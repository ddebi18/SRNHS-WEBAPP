"""
==============================================================================
SRNHS — Local Android SMS Gateway Client
==============================================================================
Dispatches SMS attendance alerts to parent/guardian phone numbers via a
self-hosted Android device running the "SMS Gateway for Android" app
(https://github.com/capcom6/android-sms-gateway) on the same local network
as the gate terminal.

REST CONTRACT (android-sms-gateway default, confirm/update per your device app):
  POST http://<device-ip>:<port>/message
  Authorization: Basic base64(username:password)
  Content-Type: application/json
  Body: { "phoneNumbers": ["+639..."], "message": "..." }

⚠️  ASSUMPTION: Contract matches android-sms-gateway v1.x.
    If the Android device runs a different app, update _build_payload() and
    _build_headers() to match that app's API.

Environment variables (set in .env or shell before running gate_biometrics.py):
  SMS_GATEWAY_URL       http://192.168.1.x:8080   (required; no trailing slash)
  SMS_GATEWAY_USER      admin                     (Basic Auth username)
  SMS_GATEWAY_PASSWORD  changeme                  (Basic Auth password)

Attendance recording is NEVER blocked by SMS failure — all errors are caught,
logged to stderr, and written to Supabase sms_notifications as status='failed'.
==============================================================================
"""

import base64
import json
import os
import time
import urllib.request
import urllib.error
from typing import Optional

# ---------------------------------------------------------------------------
# Config (read once at import time)
# ---------------------------------------------------------------------------
SMS_GATEWAY_URL: str = os.getenv("SMS_GATEWAY_URL", "").rstrip("/")
SMS_GATEWAY_USER: str = os.getenv("SMS_GATEWAY_USER", "admin")
SMS_GATEWAY_PASSWORD: str = os.getenv("SMS_GATEWAY_PASSWORD", "")

_SEND_TIMEOUT_SECONDS = 5
_RETRY_DELAY_SECONDS = 3
_MAX_RETRIES = 1  # 1 initial + 1 retry = 2 total attempts


def is_configured() -> bool:
    """True if the gateway URL is set in env — skip dispatch silently if not."""
    return bool(SMS_GATEWAY_URL)


def _format_ph_number(phone: str) -> str:
    """Normalize Philippine numbers to E.164 (+639XXXXXXXXX)."""
    cleaned = "".join(c for c in phone if c.isdigit())
    if cleaned.startswith("63") and len(cleaned) == 12:
        return f"+{cleaned}"
    if cleaned.startswith("09") and len(cleaned) == 11:
        return f"+63{cleaned[1:]}"
    if cleaned.startswith("9") and len(cleaned) == 10:
        return f"+63{cleaned}"
    return phone  # return as-is if format is unrecognised


def _build_headers() -> dict:
    credentials = base64.b64encode(
        f"{SMS_GATEWAY_USER}:{SMS_GATEWAY_PASSWORD}".encode()
    ).decode()
    return {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _build_payload(phone_e164: str, message: str) -> bytes:
    # ⚠️ Adjust key names if your Android app uses a different schema.
    return json.dumps({"phoneNumbers": [phone_e164], "message": message}).encode()


def _post(payload: bytes, headers: dict) -> tuple[bool, str]:
    """
    Single HTTP POST attempt.  Returns (success: bool, error_reason: str).
    Uses stdlib urllib — no extra dependency.
    """
    url = f"{SMS_GATEWAY_URL}/message"
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=_SEND_TIMEOUT_SECONDS) as resp:
            status_code = resp.status
            if 200 <= status_code < 300:
                return True, ""
            body = resp.read(512).decode(errors="replace")
            return False, f"HTTP {status_code}: {body}"
    except urllib.error.HTTPError as exc:
        body = exc.read(512).decode(errors="replace") if exc.fp else ""
        return False, f"HTTP {exc.code}: {body}"
    except urllib.error.URLError as exc:
        return False, f"Network error: {exc.reason}"
    except TimeoutError:
        return False, f"Timeout after {_SEND_TIMEOUT_SECONDS}s"
    except Exception as exc:  # pylint: disable=broad-except
        return False, f"Unexpected error: {exc}"


def send_sms(guardian_phone: str, message: str) -> tuple[bool, str]:
    """
    Dispatch one SMS.  Returns (success, error_reason).
    Retries once after _RETRY_DELAY_SECONDS on failure.
    Never raises — all errors are returned as (False, reason).
    """
    if not is_configured():
        return False, "SMS_GATEWAY_URL not set — SMS dispatch skipped"

    phone_e164 = _format_ph_number(guardian_phone)
    headers = _build_headers()
    payload = _build_payload(phone_e164, message)

    for attempt in range(_MAX_RETRIES + 1):
        success, reason = _post(payload, headers)
        if success:
            print(f"[SMS] Dispatched to {phone_e164} (attempt {attempt + 1})")
            return True, ""
        print(f"[SMS] Attempt {attempt + 1} failed: {reason}")
        if attempt < _MAX_RETRIES:
            time.sleep(_RETRY_DELAY_SECONDS)

    return False, reason  # type: ignore[return-value]  # reason set in last iteration


def build_attendance_message(student_name: str, lrn: str, event_type: str, gate_id: str) -> str:
    """
    Build a ≤160-char GSM-7 SMS body for a gate recognition event.
    Stays under the single-message limit to avoid multi-part splitting.
    """
    time_str = time.strftime("%I:%M %p")
    date_str = time.strftime("%b %d")
    action = "exited" if event_type == "exit" else "entered"
    # Truncate name to keep total ≤160 chars
    max_name = 30
    name = student_name[:max_name] if len(student_name) > max_name else student_name
    msg = (
        f"[SRNHS] {name} (LRN:{lrn}) {action} campus "
        f"via {gate_id} at {time_str} on {date_str}. "
        f"-San Roque NHS"
    )
    return msg[:160]
