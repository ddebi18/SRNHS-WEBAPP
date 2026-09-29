#!/usr/bin/env python3
"""
SRNHS Attendance & Monitoring System — Edge SMSGate Test Hook
Temporary feature-flagged hook for sending diagnostic SMS alerts upon biometric recognition.
Non-blocking background worker thread with bounded queue and deduplication.
"""

import csv
from dataclasses import dataclass
import datetime
import os
from pathlib import Path
import queue
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Set, Tuple
import requests

DEFAULT_BASE_URL = "https://api.sms-gate.app/3rdparty/v1"
DEFAULT_COOLDOWN_SEC = 600.0
DEFAULT_DAILY_CAP = 30
DEFAULT_SEND_DELAY_SEC = 2.0
DEFAULT_POLL_TIMEOUT_SEC = 120.0
MAX_QUEUE_SIZE = 50
MAX_RETRIES = 2
HTTP_TIMEOUT_SEC = 10.0


def parse_env_file(filepath: Path) -> Dict[str, str]:
    """Simple key=value parser for local .env files."""
    env: Dict[str, str] = {}
    if not filepath.is_file():
        return env
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def mask_phone(phone: str) -> str:
    """Masks phone number for privacy, e.g. +63917***4567."""
    phone = phone.strip()
    if len(phone) <= 6:
        return "***"
    if len(phone) >= 11:
        return f"{phone[:6]}***{phone[-4:]}"
    return f"{phone[:3]}***{phone[-2:]}"


@dataclass
class HookConfig:
    enabled: bool
    dry_run: bool
    base_url: str
    username: str
    password: str
    device_id: Optional[str]
    sim_number: Optional[int]
    test_recipients: List[str]
    cooldown_seconds: float
    daily_cap: int
    send_delay_seconds: float


def load_hook_config() -> HookConfig:
    """Loads configuration from environment variables and available .env files."""
    root_env = Path(__file__).resolve().parents[1] / ".env"
    edge_env = Path(__file__).resolve().parent / ".env"
    tools_env = Path(__file__).resolve().parents[1] / "tools" / "sms_test" / ".env"

    file_vars: Dict[str, str] = {}
    for p in (root_env, edge_env, tools_env):
        if p.is_file():
            file_vars.update(parse_env_file(p))

    def get_var(k: str, default: str = "") -> str:
        return os.environ.get(k) or file_vars.get(k, default)

    enabled_raw = get_var("SMS_TEST_HOOK_ENABLED", "false").lower()
    enabled = enabled_raw in ("true", "1", "yes", "on")

    dry_run_raw = get_var("SMS_HOOK_DRY_RUN", "false").lower()
    dry_run = dry_run_raw in ("true", "1", "yes", "on")

    raw_base = get_var("SMSGATE_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    if "api.sms-gate.app" in raw_base and not raw_base.endswith("/3rdparty/v1"):
        base_url = f"{raw_base}/3rdparty/v1"
    else:
        base_url = raw_base

    username = get_var("SMSGATE_USERNAME", "")
    password = get_var("SMSGATE_PASSWORD", "")
    device_id = get_var("SMSGATE_DEVICE_ID", "").strip() or None
    sim_raw = get_var("SMSGATE_SIM_NUMBER", "").strip()
    sim_number = int(sim_raw) if sim_raw.isdigit() else None

    recipients_raw = get_var("TEST_RECIPIENTS", "")
    test_recipients = [r.strip() for r in recipients_raw.split(",") if r.strip()]

    try:
        cooldown = float(get_var("SMS_COOLDOWN_SECONDS", str(DEFAULT_COOLDOWN_SEC)))
    except ValueError:
        cooldown = DEFAULT_COOLDOWN_SEC

    try:
        daily_cap = int(get_var("SMS_DAILY_CAP", str(DEFAULT_DAILY_CAP)))
    except ValueError:
        daily_cap = DEFAULT_DAILY_CAP

    try:
        send_delay = float(get_var("SMS_SEND_DELAY_SECONDS", str(DEFAULT_SEND_DELAY_SEC)))
    except ValueError:
        send_delay = DEFAULT_SEND_DELAY_SEC

    return HookConfig(
        enabled=enabled,
        dry_run=dry_run,
        base_url=base_url,
        username=username,
        password=password,
        device_id=device_id,
        sim_number=sim_number,
        test_recipients=test_recipients,
        cooldown_seconds=cooldown,
        daily_cap=daily_cap,
        send_delay_seconds=send_delay,
    )


class SMSHookManager:
    """Manages background dispatching, cooldowns, daily caps, and logging for recognition SMS."""

    def __init__(self, config: Optional[HookConfig] = None):
        self.config = config or load_hook_config()
        self.queue: queue.Queue = queue.Queue(maxsize=MAX_QUEUE_SIZE)
        self.lock = threading.Lock()
        
        # State tracking
        self.last_sent_times: Dict[str, float] = {}  # student_id -> timestamp
        self.daily_events: Set[Tuple[str, str, str]] = set()  # (student_id, YYYY-MM-DD, event_type)
        self.daily_count: int = 0
        self.current_day: str = datetime.date.today().isoformat()
        
        self.session = requests.Session()
        if self.config.username and self.config.password:
            self.session.auth = (self.config.username, self.config.password)

        self.logs_dir = Path(__file__).resolve().parent / "logs"
        self.logs_dir.mkdir(parents=True, exist_ok=True)

        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name="SMSHookWorker")
        self._worker_thread.start()

        if self.config.enabled:
            self._print_startup_banner()

    def stop(self) -> None:
        """Stops background worker loop."""
        try:
            self.queue.put_nowait(None)
        except Exception:
            pass

    def _print_startup_banner(self) -> None:
        masked_recipients = [mask_phone(r) for r in self.config.test_recipients]
        print("\n" + "=" * 62)
        print("  [SRNHS EDGE SMS TEST HOOK ACTIVATED]")
        print(f"  Recipients:   {', '.join(masked_recipients) or 'None (Dispatch Blocked)'}")
        print(f"  Cooldown:     {self.config.cooldown_seconds}s")
        print(f"  Daily Cap:    {self.config.daily_cap} messages")
        print(f"  SIM Slot:     {self.config.sim_number or 'OS default'}")
        print(f"  Dry Run Mode: {self.config.dry_run}")
        print("=" * 62 + "\n")

    def _reset_daily_counts_if_needed(self, now_dt: datetime.datetime) -> None:
        today_str = now_dt.date().isoformat()
        if today_str != self.current_day:
            self.current_day = today_str
            self.daily_count = 0
            self.daily_events.clear()
            print(f"[SMSHook] Daily reset triggered for {today_str}.")

    def notify(
        self,
        student_id: str,
        student_first_name: str,
        event_type: str,
        recognition_timestamp: Optional[float] = None,
    ) -> bool:
        """
        Public non-blocking entry point called by the recognition pipeline.
        Returns True if queued, False if skipped/dropped. Never throws.
        """
        if not self.config.enabled:
            return False

        rec_time = recognition_timestamp or time.time()
        # Extract first name safely
        clean_first_name = (student_first_name or "Student").strip().split()[0]

        event = {
            "student_id": str(student_id),
            "first_name": clean_first_name,
            "event_type": str(event_type or "entry"),
            "timestamp": rec_time,
        }

        try:
            self.queue.put_nowait(event)
            return True
        except queue.Full:
            print("[SMSHook] Warning: Queue full (50 events). Dropping SMS notification.", file=sys.stderr)
            return False
        except Exception as exc:
            print(f"[SMSHook] Error queuing notification: {exc}", file=sys.stderr)
            return False

    def _format_message_text(self, first_name: str, rec_time: float) -> str:
        """Constructs generic test message containing only first name and time."""
        dt = datetime.datetime.fromtimestamp(rec_time)
        formatted_time = dt.strftime("%I:%M %p").lstrip("0")
        return f"SRNHS TEST: {first_name} recognized at {formatted_time}. This is a system test."

    def _worker_loop(self) -> None:
        """Background daemon processing queued SMS notifications."""
        while True:
            try:
                event = self.queue.get()
                if event is None:
                    break
                self._process_event(event)
            except Exception as exc:
                print(f"[SMSHook] Unexpected worker exception: {exc}", file=sys.stderr)
            finally:
                time.sleep(self.config.send_delay_seconds)

    def _process_event(self, event: Dict[str, Any]) -> None:
        student_id = event["student_id"]
        first_name = event["first_name"]
        event_type = event["event_type"]
        rec_time = event["timestamp"]

        now = time.time()
        now_dt = datetime.datetime.now()

        with self.lock:
            self._reset_daily_counts_if_needed(now_dt)

            # 1. Cooldown check
            last_sent = self.last_sent_times.get(student_id, 0.0)
            if (now - last_sent) < self.config.cooldown_seconds:
                return

            # 2. Per-day, per-event-type deduplication check
            event_key = (student_id, self.current_day, event_type)
            if event_key in self.daily_events:
                return

            # 3. Daily message cap check
            if self.daily_count >= self.config.daily_cap:
                print(f"[SMSHook] Daily message cap ({self.config.daily_cap}) reached. Suppressing SMS.", file=sys.stderr)
                return

            # 4. Allowlist verification
            if not self.config.test_recipients:
                print("[SMSHook] No TEST_RECIPIENTS configured. Suppressing SMS.", file=sys.stderr)
                return

            # Reserve slot
            self.daily_count += 1
            self.last_sent_times[student_id] = now
            self.daily_events.add(event_key)

        message_text = self._format_message_text(first_name, rec_time)

        # Dispatch to allowlisted recipients
        for recipient in self.config.test_recipients:
            self._send_to_recipient(
                recipient=recipient,
                student_id=student_id,
                event_type=event_type,
                message_text=message_text,
                recognition_epoch=rec_time,
            )

    def _send_to_recipient(
        self,
        recipient: str,
        student_id: str,
        event_type: str,
        message_text: str,
        recognition_epoch: float,
    ) -> None:
        masked = mask_phone(recipient)
        submit_epoch = time.time()
        sec_to_submit = f"{submit_epoch - recognition_epoch:.2f}"
        iso_timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

        if self.config.dry_run:
            print(f"[SMSHook DryRun] Simulated SMS to {masked} for student {student_id}: '{message_text}'")
            self._log_to_csv(
                timestamp=iso_timestamp,
                student_id=student_id,
                masked_recipient=masked,
                event_type=event_type,
                message_id=f"dry_run_{int(submit_epoch*1000)}",
                http_status="200",
                status="Delivered",
                error="",
                sec_to_submit=sec_to_submit,
            )
            return

        payload: Dict[str, Any] = {
            "textMessage": {"text": message_text},
            "phoneNumbers": [recipient],
        }
        if self.config.device_id:
            payload["deviceId"] = self.config.device_id
        if self.config.sim_number:
            payload["simNumber"] = self.config.sim_number

        url = f"{self.config.base_url}/messages"
        msg_id = ""
        http_status = 0
        final_status = "Failed"
        error_msg = ""

        # Retry loop (at most MAX_RETRIES)
        for attempt in range(1, MAX_RETRIES + 2):
            try:
                res = self.session.post(url, json=payload, timeout=HTTP_TIMEOUT_SEC)
                http_status = res.status_code
                data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}

                if http_status in (401, 403):
                    error_msg = f"Auth error (HTTP {http_status}). Verify credentials."
                    print(f"[SMSHook] {error_msg}", file=sys.stderr)
                    final_status = "AuthFailed"
                    break

                if res.ok:
                    msg_id = str(data.get("id") or data.get("messageId") or "")
                    final_status = str(data.get("state") or data.get("status") or "Pending")
                    error_msg = ""
                    break
                else:
                    error_msg = data.get("message") or res.text
                    if attempt <= MAX_RETRIES:
                        time.sleep(1.0)
            except Exception as exc:
                error_msg = str(exc)
                if attempt <= MAX_RETRIES:
                    time.sleep(1.0)

        # Write initial submission log
        csv_path, row_index = self._log_to_csv(
            timestamp=iso_timestamp,
            student_id=student_id,
            masked_recipient=masked,
            event_type=event_type,
            message_id=msg_id,
            http_status=str(http_status),
            status=final_status,
            error=error_msg,
            sec_to_submit=sec_to_submit,
        )

        if msg_id and not error_msg:
            # Poll status in background worker
            self._poll_delivery_status(msg_id, csv_path, row_index)

    def _poll_delivery_status(self, message_id: str, csv_path: Path, target_index: int) -> None:
        """Polls SMSGate status endpoint until terminal state or timeout."""
        deadline = time.time() + DEFAULT_POLL_TIMEOUT_SEC
        url = f"{self.config.base_url}/messages/{message_id}"
        terminal_states = {"delivered", "failed", "expired", "canceled", "rejected", "error"}

        while time.time() < deadline:
            try:
                res = self.session.get(url, timeout=HTTP_TIMEOUT_SEC)
                if res.ok:
                    data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
                    state = str(data.get("state") or data.get("status") or "Unknown")
                    err = ""
                    recipients = data.get("recipients") or []
                    if recipients and isinstance(recipients, list) and isinstance(recipients[0], dict):
                        err = recipients[0].get("error", "")

                    if state.lower() in terminal_states:
                        self._update_csv_status(csv_path, target_index, state, err)
                        return
            except Exception:
                pass
            time.sleep(3.0)

        self._update_csv_status(csv_path, target_index, "TimedOut", "Timed out polling status")

    def _log_to_csv(
        self,
        timestamp: str,
        student_id: str,
        masked_recipient: str,
        event_type: str,
        message_id: str,
        http_status: str,
        status: str,
        error: str,
        sec_to_submit: str,
    ) -> Tuple[Path, int]:
        """Appends notification record to edge_engine/logs/sms_hook_YYYYMMDD.csv."""
        date_str = datetime.date.today().strftime("%Y%m%d")
        csv_path = self.logs_dir / f"sms_hook_{date_str}.csv"
        file_exists = csv_path.is_file()

        headers = [
            "timestamp",
            "student_id",
            "masked_recipient",
            "event_type",
            "message_id",
            "http_status",
            "status",
            "error",
            "seconds_from_recognition_to_submit",
        ]

        row_data = [
            timestamp,
            student_id,
            masked_recipient,
            event_type,
            message_id,
            http_status,
            status,
            error,
            sec_to_submit,
        ]

        with self.lock:
            with open(csv_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(headers)
                writer.writerow(row_data)

            # Estimate row index for in-place status update
            try:
                with open(csv_path, "r", encoding="utf-8") as f:
                    row_index = sum(1 for _ in f) - 1
            except Exception:
                row_index = 1

        return csv_path, row_index

    def _update_csv_status(self, csv_path: Path, row_index: int, final_state: str, error: str) -> None:
        """Updates the status and error columns of a previous CSV entry."""
        if not csv_path.is_file() or row_index < 1:
            return
        with self.lock:
            try:
                with open(csv_path, "r", newline="", encoding="utf-8") as f:
                    rows = list(csv.reader(f))
                if row_index < len(rows):
                    # headers: [timestamp, student_id, masked_recipient, event_type, message_id, http_status, status, error, seconds_from_recognition_to_submit]
                    rows[row_index][6] = final_state
                    if error:
                        rows[row_index][7] = error
                    with open(csv_path, "w", newline="", encoding="utf-8") as f:
                        writer = csv.writer(f)
                        writer.writerows(rows)
            except Exception as exc:
                print(f"[SMSHook] CSV update warning: {exc}", file=sys.stderr)


# Global singleton instance
_manager: Optional[SMSHookManager] = None
_init_lock = threading.Lock()


def get_hook_manager() -> SMSHookManager:
    global _manager
    if _manager is None:
        with _init_lock:
            if _manager is None:
                _manager = SMSHookManager()
    return _manager


def notify_recognition(
    student_id: str,
    student_first_name: str,
    event_type: str = "entry",
    timestamp: Optional[float] = None,
) -> bool:
    """
    Public pipeline hook. Call once when a registered student is matched.
    Non-blocking, exception-isolated, thread-safe.
    """
    try:
        manager = get_hook_manager()
        return manager.notify(
            student_id=student_id,
            student_first_name=student_first_name,
            event_type=event_type,
            recognition_timestamp=timestamp,
        )
    except Exception as exc:
        print(f"[SMSHook] Notification hook suppressed error: {exc}", file=sys.stderr)
        return False
