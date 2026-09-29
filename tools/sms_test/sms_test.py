#!/usr/bin/env python3
"""
SRNHS Attendance System - SMSGate Diagnostic & Load Test Harness
Temporary evaluation tool for testing Android SMSGate throughput, latency, and reliability.
Does not touch production attendance, Supabase, or student records.
"""

import argparse
import csv
from dataclasses import asdict, dataclass
import datetime
import math
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional
import requests

TERMINAL_STATES = {"delivered", "failed", "expired", "canceled", "rejected", "error"}
MAX_CONSECUTIVE_FAILURES = 5
MAX_BURST_CAP = 50
DEFAULT_TIMEOUT_SEC = 120.0
HTTP_TIMEOUT_SEC = 10.0


@dataclass
class Config:
    base_url: str
    username: str
    password: str
    device_id: Optional[str]
    test_recipients: List[str]
    sim_number: Optional[int] = None


@dataclass
class MessageRecord:
    index: int
    masked_recipient: str
    message_id: str = ""
    submitted_at: str = ""
    http_status: str = ""
    first_state: str = ""
    sent_at: str = ""
    delivered_at: str = ""
    final_state: str = ""
    submit_to_sent_sec: str = ""
    submit_to_delivered_sec: str = ""
    error: str = ""


def parse_env_file(filepath: Path) -> Dict[str, str]:
    """Tiny zero-dependency .env parser."""
    env: Dict[str, str] = {}
    if not filepath.is_file():
        return env
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            env[key] = val
    return env


def load_config(env_path: Optional[Path] = None, require_auth: bool = True) -> Config:
    """Loads configuration from environment variables, tools/sms_test/.env, or root .env."""
    file_vars: Dict[str, str] = {}
    if env_path is not None:
        if env_path.is_file():
            file_vars.update(parse_env_file(env_path))
    else:
        root_env = Path(__file__).resolve().parents[2] / ".env"
        local_env = Path(__file__).resolve().parent / ".env"
        if root_env.is_file():
            file_vars.update(parse_env_file(root_env))
        if local_env.is_file():
            file_vars.update(parse_env_file(local_env))

    def get_var(k: str, default: str = "") -> str:
        return os.environ.get(k) or file_vars.get(k, default)

    raw_base = get_var("SMSGATE_BASE_URL", "https://api.sms-gate.app/3rdparty/v1").rstrip("/")
    # Normalize base URL if 3rdparty/v1 is missing
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

    recipients = [r.strip() for r in recipients_raw.split(",") if r.strip()]

    if require_auth and (not username or not password):
        raise ValueError("Missing SMSGATE_USERNAME or SMSGATE_PASSWORD in environment / .env")

    return Config(
        base_url=base_url,
        username=username,
        password=password,
        device_id=device_id,
        test_recipients=recipients,
        sim_number=sim_number,
    )


def mask_phone(phone: str) -> str:
    """Masks phone number for privacy, e.g. +63917***4567."""
    phone = phone.strip()
    if len(phone) <= 6:
        return "***"
    if len(phone) >= 11:
        return f"{phone[:6]}***{phone[-4:]}"
    return f"{phone[:3]}***{phone[-2:]}"


def validate_recipient(phone: str, allowlist: List[str], allow_bypass: bool = False) -> None:
    """Enforces that test SMS is only dispatched to registered allowlisted numbers."""
    if allow_bypass:
        return
    normalized = phone.strip()
    normalized_allowlist = [r.strip() for r in allowlist]
    if normalized not in normalized_allowlist:
        masked = mask_phone(normalized)
        raise ValueError(
            f"Safety error: Recipient {masked} is not in TEST_RECIPIENTS allowlist. Dispatch blocked."
        )


class SMSGateClient:
    def __init__(self, config: Config, dry_run: bool = False):
        self.config = config
        self.dry_run = dry_run
        self.session = requests.Session()
        if config.username and config.password:
            self.session.auth = (config.username, config.password)

    def send_message(self, phone: str, text: str, sim_number: Optional[int] = None) -> Dict[str, Any]:
        """POST /messages with generic text and single phone number."""
        payload: Dict[str, Any] = {
            "textMessage": {"text": text},
            "phoneNumbers": [phone],
        }
        if self.config.device_id:
            payload["deviceId"] = self.config.device_id
        
        active_sim = sim_number if sim_number is not None else self.config.sim_number
        if active_sim is not None:
            payload["simNumber"] = active_sim

        if self.dry_run:
            return {
                "id": f"dry_run_{int(time.time()*1000)}",
                "state": "Simulated",
                "http_status": 200,
            }

        url = f"{self.config.base_url}/messages"
        try:
            res = self.session.post(url, json=payload, timeout=HTTP_TIMEOUT_SEC)
            data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            msg_id = data.get("id") or data.get("messageId") or ""
            state = data.get("state") or data.get("status") or ("Queued" if res.ok else "Failed")
            return {
                "id": str(msg_id),
                "state": state,
                "http_status": res.status_code,
                "data": data,
                "error": "" if res.ok else (data.get("message") or res.text),
            }
        except Exception as exc:
            return {
                "id": "",
                "state": "Error",
                "http_status": 0,
                "error": str(exc),
            }

    def get_status(self, message_id: str) -> Dict[str, Any]:
        """GET /messages/{id} to check current delivery state and timestamps."""
        if self.dry_run:
            return {
                "id": message_id,
                "state": "Delivered",
                "sentAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "deliveredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "http_status": 200,
            }

        url = f"{self.config.base_url}/messages/{message_id}"
        try:
            res = self.session.get(url, timeout=HTTP_TIMEOUT_SEC)
            data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            state = data.get("state") or data.get("status") or ("Unknown" if res.ok else "Failed")
            
            # Extract detailed error from recipients array if present
            err_msg = ""
            recipients = data.get("recipients") or []
            if recipients and isinstance(recipients, list) and isinstance(recipients[0], dict):
                err_msg = recipients[0].get("error", "")
            if not err_msg:
                err_msg = data.get("message") or ("" if res.ok else res.text)

            return {
                "id": message_id,
                "state": state,
                "sent_at": data.get("sentAt") or data.get("sent_at") or "",
                "delivered_at": data.get("deliveredAt") or data.get("delivered_at") or "",
                "http_status": res.status_code,
                "error": err_msg,
            }
        except Exception as exc:
            return {
                "id": message_id,
                "state": "Error",
                "http_status": 0,
                "error": str(exc),
            }


def poll_message_status(
    client: SMSGateClient,
    record: MessageRecord,
    submit_epoch: float,
    timeout_sec: float = DEFAULT_TIMEOUT_SEC,
    poll_interval_sec: float = 2.0,
    verbose: bool = True,
) -> MessageRecord:
    """Polls a message until terminal state or timeout."""
    if not record.message_id or record.final_state.lower() in TERMINAL_STATES:
        return record

    deadline = time.time() + timeout_sec
    last_state = record.first_state

    while time.time() < deadline:
        res = client.get_status(record.message_id)
        current_state = str(res.get("state", "Unknown"))
        now = time.time()

        if current_state != last_state:
            elapsed = now - submit_epoch
            if verbose:
                print(f"  [Msg {record.message_id}] State changed: {last_state} -> {current_state} (+{elapsed:.2f}s)")
            last_state = current_state

        if "sent" in current_state.lower() and not record.sent_at:
            record.sent_at = res.get("sent_at") or datetime.datetime.now(datetime.timezone.utc).isoformat()
            record.submit_to_sent_sec = f"{(now - submit_epoch):.2f}"

        if "delivered" in current_state.lower() and not record.delivered_at:
            record.delivered_at = res.get("delivered_at") or datetime.datetime.now(datetime.timezone.utc).isoformat()
            record.submit_to_delivered_sec = f"{(now - submit_epoch):.2f}"

        if current_state.lower() in TERMINAL_STATES:
            record.final_state = current_state
            if res.get("error") and not record.error:
                record.error = res["error"]
            return record

        if client.dry_run:
            record.final_state = "Delivered"
            record.submit_to_delivered_sec = "0.05"
            return record

        time.sleep(poll_interval_sec)

    record.final_state = last_state or "TimedOut"
    if not record.error:
        record.error = f"Timed out waiting for terminal state after {timeout_sec}s"
    return record


def calculate_percentile(sorted_data: List[float], p: float) -> float:
    """Calculates nearest-rank or linear interpolated percentile (p in 0..100)."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_data[int(k)]
    return sorted_data[f] * (c - k) + sorted_data[c] * (k - f)


def compute_statistics(records: List[MessageRecord]) -> Dict[str, Any]:
    """Generates benchmark summary statistics."""
    total = len(records)
    if total == 0:
        return {"total": 0, "delivered": 0, "failed": 0, "success_rate": 0.0}

    delivered_records = [r for r in records if r.final_state.lower() == "delivered"]
    failed_records = [r for r in records if r.final_state.lower() != "delivered"]

    delivered_count = len(delivered_records)
    failed_count = len(failed_records)
    success_rate = (delivered_count / total) * 100.0

    delivery_times: List[float] = []
    for r in delivered_records:
        try:
            if r.submit_to_delivered_sec:
                delivery_times.append(float(r.submit_to_delivered_sec))
        except ValueError:
            pass

    delivery_times.sort()
    min_lat = delivery_times[0] if delivery_times else 0.0
    median_lat = calculate_percentile(delivery_times, 50.0) if delivery_times else 0.0
    p95_lat = calculate_percentile(delivery_times, 95.0) if delivery_times else 0.0
    max_lat = delivery_times[-1] if delivery_times else 0.0

    # Calculate longest gap between consecutive successful deliveries
    longest_gap_sec = 0.0
    if len(delivered_records) > 1:
        times: List[float] = []
        for r in delivered_records:
            try:
                dt = datetime.datetime.fromisoformat(r.delivered_at.replace("Z", "+00:00"))
                times.append(dt.timestamp())
            except Exception:
                try:
                    dt = datetime.datetime.fromisoformat(r.submitted_at.replace("Z", "+00:00"))
                    times.append(dt.timestamp())
                except Exception:
                    pass
        times.sort()
        if len(times) > 1:
            gaps = [times[i] - times[i - 1] for i in range(1, len(times))]
            longest_gap_sec = max(gaps) if gaps else 0.0

    return {
        "total": total,
        "delivered": delivered_count,
        "failed": failed_count,
        "success_rate": success_rate,
        "min_delivery_sec": min_lat,
        "median_delivery_sec": median_lat,
        "p95_delivery_sec": p95_lat,
        "max_delivery_sec": max_lat,
        "longest_gap_sec": longest_gap_sec,
    }


def print_summary(stats: Dict[str, Any]) -> None:
    """Prints diagnostic metrics to console."""
    print("\n" + "=" * 60)
    print(" SMSGATE TEST RUN SUMMARY ")
    print("=" * 60)
    print(f" Total Messages:       {stats.get('total', 0)}")
    print(f" Delivered:            {stats.get('delivered', 0)}")
    print(f" Failed / Incomplete:  {stats.get('failed', 0)}")
    print(f" Success Rate:         {stats.get('success_rate', 0.0):.1f}%")
    if stats.get("delivered", 0) > 0:
        print("-" * 60)
        print(" Latency (Submit -> Delivered):")
        print(f"   Min:     {stats.get('min_delivery_sec', 0.0):.2f}s")
        print(f"   Median:  {stats.get('median_delivery_sec', 0.0):.2f}s")
        print(f"   P95:     {stats.get('p95_delivery_sec', 0.0):.2f}s")
        print(f"   Max:     {stats.get('max_delivery_sec', 0.0):.2f}s")
        print(f" Longest Delivery Gap: {stats.get('longest_gap_sec', 0.0):.2f}s")
    print("=" * 60 + "\n")


def write_results_csv(command_name: str, records: List[MessageRecord]) -> Path:
    """Saves test execution logs to results/<command>_<timestamp>.csv."""
    results_dir = Path(__file__).resolve().parent / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = results_dir / f"{command_name}_{ts}.csv"

    fieldnames = [
        "index",
        "masked_recipient",
        "message_id",
        "submitted_at",
        "http_status",
        "first_state",
        "sent_at",
        "delivered_at",
        "final_state",
        "submit_to_sent_sec",
        "submit_to_delivered_sec",
        "error",
    ]
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            writer.writerow(asdict(r))

    print(f"[Results saved] {filepath}")
    return filepath


# --- CLI Command Implementations ---


def cmd_send(args: argparse.Namespace) -> None:
    config = load_config(require_auth=not args.dry_run)
    validate_recipient(args.to, config.test_recipients)
    client = SMSGateClient(config, dry_run=args.dry_run)

    masked = mask_phone(args.to)
    text = args.text or f"SRNHS test single [{datetime.datetime.now().strftime('%H:%M:%S')}]"
    submit_dt = datetime.datetime.now(datetime.timezone.utc).isoformat()
    submit_epoch = time.time()

    print(f"[*] Submitting test SMS to {masked} (DryRun: {args.dry_run}, SIM: {args.sim or config.sim_number or 'Default'})...")
    res = client.send_message(args.to, text, sim_number=args.sim)

    record = MessageRecord(
        index=1,
        masked_recipient=masked,
        message_id=str(res.get("id", "")),
        submitted_at=submit_dt,
        http_status=str(res.get("http_status", "")),
        first_state=str(res.get("state", "")),
        final_state=str(res.get("state", "")),
        error=str(res.get("error", "")),
    )

    print(f"[+] HTTP {record.http_status} | Message ID: {record.message_id or 'N/A'} | Initial State: {record.first_state}")

    if record.message_id and not record.error:
        print(f"[*] Polling status (timeout {args.timeout}s)...")
        record = poll_message_status(
            client, record, submit_epoch, timeout_sec=args.timeout, poll_interval_sec=args.poll_interval
        )

    write_results_csv("send", [record])
    stats = compute_statistics([record])
    print_summary(stats)


def cmd_burst(args: argparse.Namespace) -> None:
    config = load_config(require_auth=not args.dry_run)
    if not config.test_recipients:
        raise ValueError("TEST_RECIPIENTS is empty in .env. Cannot run burst test.")

    count = args.count
    if count > MAX_BURST_CAP:
        print(f"[!] Warning: Count {count} exceeds safety cap of {MAX_BURST_CAP}. Clamping to {MAX_BURST_CAP}.")
        count = MAX_BURST_CAP

    if not args.yes and not args.dry_run:
        prompt = input(f"Send {count} test messages to allowlisted recipients? [y/N]: ").strip().lower()
        if prompt not in ("y", "yes"):
            print("Burst cancelled.")
            return

    client = SMSGateClient(config, dry_run=args.dry_run)
    records: List[MessageRecord] = []
    epochs: Dict[int, float] = {}
    consecutive_failures = 0

    print(f"[*] Starting burst of {count} messages (Interval: {args.interval}s, DryRun: {args.dry_run}, SIM: {args.sim or config.sim_number or 'Default'})...")

    for i in range(count):
        recipient = config.test_recipients[i % len(config.test_recipients)]
        validate_recipient(recipient, config.test_recipients)
        masked = mask_phone(recipient)

        text = f"SRNHS burst #{i+1}/{count} [{datetime.datetime.now().strftime('%H:%M:%S')}]"
        sub_epoch = time.time()
        sub_dt = datetime.datetime.now(datetime.timezone.utc).isoformat()

        res = client.send_message(recipient, text, sim_number=args.sim)
        msg_id = str(res.get("id", ""))
        state = str(res.get("state", ""))
        err = str(res.get("error", ""))
        status_code = str(res.get("http_status", ""))

        rec = MessageRecord(
            index=i + 1,
            masked_recipient=masked,
            message_id=msg_id,
            submitted_at=sub_dt,
            http_status=status_code,
            first_state=state,
            final_state=state,
            error=err,
        )
        records.append(rec)
        epochs[i] = sub_epoch

        if err or status_code not in ("200", "201", "202"):
            consecutive_failures += 1
            print(f"  [#{i+1}] FAILED send to {masked}: {err or 'HTTP ' + status_code}")
        else:
            consecutive_failures = 0
            print(f"  [#{i+1}] Submitted to {masked} -> ID: {msg_id} ({state})")

        if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
            print(f"[!] ABORTING: {MAX_CONSECUTIVE_FAILURES} consecutive dispatch failures encountered.")
            break

        if args.interval > 0 and (i + 1) < count:
            time.sleep(args.interval)

    # Post-burst polling phase
    print("\n[*] Polling final delivery status for submitted messages...")
    for idx, rec in enumerate(records):
        if rec.message_id and not rec.error:
            records[idx] = poll_message_status(
                client,
                rec,
                epochs.get(idx, time.time()),
                timeout_sec=args.timeout,
                poll_interval_sec=args.poll_interval,
                verbose=False,
            )
            print(f"  [#{rec.index} ID {rec.message_id}] Final State: {records[idx].final_state}")

    write_results_csv("burst", records)
    stats = compute_statistics(records)
    print_summary(stats)


def cmd_soak(args: argparse.Namespace) -> None:
    config = load_config(require_auth=not args.dry_run)
    if not config.test_recipients:
        raise ValueError("TEST_RECIPIENTS is empty in .env. Cannot run soak test.")

    recipient = args.to if args.to else config.test_recipients[0]
    validate_recipient(recipient, config.test_recipients)
    masked = mask_phone(recipient)

    client = SMSGateClient(config, dry_run=args.dry_run)
    records: List[MessageRecord] = []
    consecutive_failures = 0

    duration_sec = args.duration_min * 60.0
    end_time = time.time() + duration_sec
    every_sec = max(1.0, float(args.every_sec))
    iteration = 0

    print(f"[*] Starting soak test for {args.duration_min}m (Every {every_sec}s to {masked}, SIM: {args.sim or config.sim_number or 'Default'})...")

    while time.time() < end_time:
        iteration += 1
        text = f"SRNHS soak #{iteration} [{datetime.datetime.now().strftime('%H:%M:%S')}]"
        sub_epoch = time.time()
        sub_dt = datetime.datetime.now(datetime.timezone.utc).isoformat()

        res = client.send_message(recipient, text, sim_number=args.sim)
        msg_id = str(res.get("id", ""))
        state = str(res.get("state", ""))
        err = str(res.get("error", ""))
        status_code = str(res.get("http_status", ""))

        rec = MessageRecord(
            index=iteration,
            masked_recipient=masked,
            message_id=msg_id,
            submitted_at=sub_dt,
            http_status=status_code,
            first_state=state,
            final_state=state,
            error=err,
        )

        if err or status_code not in ("200", "201", "202"):
            consecutive_failures += 1
            print(f"  [Soak #{iteration}] FAILED send: {err or 'HTTP ' + status_code}")
        else:
            consecutive_failures = 0
            print(f"  [Soak #{iteration}] Sent ID {msg_id}. Polling delivery...")
            rec = poll_message_status(
                client,
                rec,
                sub_epoch,
                timeout_sec=args.timeout,
                poll_interval_sec=args.poll_interval,
                verbose=False,
            )
            print(f"  [Soak #{iteration}] Final: {rec.final_state} (Delivered in {rec.submit_to_delivered_sec or 'N/A'}s)")

        records.append(rec)

        if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
            print(f"[!] ABORTING SOAK: {MAX_CONSECUTIVE_FAILURES} consecutive dispatch failures.")
            break

        remaining = end_time - time.time()
        if remaining > 0:
            sleep_duration = min(every_sec, remaining)
            time.sleep(sleep_duration)

    write_results_csv("soak", records)
    stats = compute_statistics(records)
    print_summary(stats)


def cmd_badnumber(args: argparse.Namespace) -> None:
    config = load_config(require_auth=not args.dry_run)
    client = SMSGateClient(config, dry_run=args.dry_run)

    test_cases = [
        ("+639000000000", "SRNHS dummy invalid prefix test"),
        ("invalid-malformed-phone", "SRNHS malformed phone string test"),
    ]

    records: List[MessageRecord] = []
    print("[*] Running badnumber test on intentionally invalid destinations...")

    for i, (phone, text) in enumerate(test_cases, 1):
        masked = mask_phone(phone)
        sub_epoch = time.time()
        sub_dt = datetime.datetime.now(datetime.timezone.utc).isoformat()

        print(f"\n--- Testing Target {i}: {masked} ---")
        res = client.send_message(phone, text)
        msg_id = str(res.get("id", ""))
        state = str(res.get("state", ""))
        err = str(res.get("error", ""))
        status_code = str(res.get("http_status", ""))

        rec = MessageRecord(
            index=i,
            masked_recipient=masked,
            message_id=msg_id,
            submitted_at=sub_dt,
            http_status=status_code,
            first_state=state,
            final_state=state,
            error=err,
        )

        print(f"  Submit HTTP Status: {status_code}")
        print(f"  Response State:     {state}")
        print(f"  Error Detail:       {err or 'None'}")

        if msg_id and not err:
            print(f"  Message ID assigned ({msg_id}), polling for gateway rejection...")
            rec = poll_message_status(client, rec, sub_epoch, timeout_sec=20.0, poll_interval_sec=2.0)
            print(f"  Final State after polling: {rec.final_state}")

        records.append(rec)

    write_results_csv("badnumber", records)
    print("\n[*] Bad number test completed. Logged to CSV.")


def cmd_report(args: argparse.Namespace) -> None:
    filepath = Path(args.csv_file)
    if not filepath.is_file():
        print(f"[!] Error: File not found: {filepath}")
        sys.exit(1)

    records: List[MessageRecord] = []
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            records.append(
                MessageRecord(
                    index=int(r.get("index", 0) or 0),
                    masked_recipient=r.get("masked_recipient", ""),
                    message_id=r.get("message_id", ""),
                    submitted_at=r.get("submitted_at", ""),
                    http_status=r.get("http_status", ""),
                    first_state=r.get("first_state", ""),
                    sent_at=r.get("sent_at", ""),
                    delivered_at=r.get("delivered_at", ""),
                    final_state=r.get("final_state", ""),
                    submit_to_sent_sec=r.get("submit_to_sent_sec", ""),
                    submit_to_delivered_sec=r.get("submit_to_delivered_sec", ""),
                    error=r.get("error", ""),
                )
            )

    stats = compute_statistics(records)
    print(f"[+] Loaded {len(records)} records from {filepath}")
    print_summary(stats)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SRNHS Attendance System - SMSGate Benchmark & Test Harness"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # send
    p_send = subparsers.add_parser("send", help="Send a single test SMS and poll delivery")
    p_send.add_argument("--to", required=True, help="Recipient phone number (must be in TEST_RECIPIENTS)")
    p_send.add_argument("--text", default="", help="Generic test message text")
    p_send.add_argument("--sim", type=int, default=None, help="Explicit SIM slot index (1 or 2)")
    p_send.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SEC, help="Max seconds to poll")
    p_send.add_argument("--poll-interval", type=float, default=2.0, help="Polling interval in seconds")
    p_send.add_argument("--dry-run", action="store_true", help="Simulate without network request")

    # burst
    p_burst = subparsers.add_parser("burst", help="Send burst of messages across allowlist")
    p_burst.add_argument("--count", type=int, default=20, help="Number of messages (cap 50)")
    p_burst.add_argument("--interval", type=float, default=0.0, help="Delay between sends in seconds")
    p_burst.add_argument("--sim", type=int, default=None, help="Explicit SIM slot index (1 or 2)")
    p_burst.add_argument("--to-all", action="store_true", help="Rotate across all TEST_RECIPIENTS")
    p_burst.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    p_burst.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SEC, help="Polling timeout per msg")
    p_burst.add_argument("--poll-interval", type=float, default=2.0, help="Polling interval in seconds")
    p_burst.add_argument("--dry-run", action="store_true", help="Simulate without network requests")

    # soak
    p_soak = subparsers.add_parser("soak", help="Periodic soak test over extended duration")
    p_soak.add_argument("--duration-min", type=float, default=30.0, help="Duration in minutes")
    p_soak.add_argument("--every-sec", type=float, default=300.0, help="Interval between sends in seconds")
    p_soak.add_argument("--to", default="", help="Target recipient (defaults to allowlist[0])")
    p_soak.add_argument("--sim", type=int, default=None, help="Explicit SIM slot index (1 or 2)")
    p_soak.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SEC, help="Polling timeout per msg")
    p_soak.add_argument("--poll-interval", type=float, default=2.0, help="Polling interval in seconds")
    p_soak.add_argument("--dry-run", action="store_true", help="Simulate without network requests")

    # badnumber
    p_bad = subparsers.add_parser("badnumber", help="Test error reporting with invalid/malformed numbers")
    p_bad.add_argument("--dry-run", action="store_true", help="Simulate without network requests")

    # report
    p_rep = subparsers.add_parser("report", help="Generate summary report from existing CSV results file")
    p_rep.add_argument("csv_file", help="Path to results CSV file")

    args = parser.parse_args()

    commands = {
        "send": cmd_send,
        "burst": cmd_burst,
        "soak": cmd_soak,
        "badnumber": cmd_badnumber,
        "report": cmd_report,
    }

    try:
        commands[args.command](args)
    except KeyboardInterrupt:
        print("\n[!] Execution interrupted by user.")
        sys.exit(130)
    except Exception as exc:
        print(f"[!] Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
