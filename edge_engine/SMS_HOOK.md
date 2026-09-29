# Edge SMSGate Test Hook Specification & Guide

> [!NOTE]
> **Temporary Feature-Flagged Test Hook:** This module integrates with the turnstile biometric pipeline to dispatch test SMS messages through [SMSGate](https://docs.sms-gate.app) when a registered student's face is recognized. It operates in a non-blocking background worker thread and does **not** read or modify guardian contact information from the database.

---

## 1. Environment Configuration

Add the following variables to `.env` (or `edge_engine/.env`):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SMS_TEST_HOOK_ENABLED` | `false` | Master feature flag. When `false`, the hook is a zero-overhead no-op. |
| `SMS_HOOK_DRY_RUN` | `false` | When `true`, simulates SMS transmission and logs to CSV without calling SMSGate API. |
| `SMSGATE_BASE_URL` | `https://api.sms-gate.app/3rdparty/v1` | SMSGate API endpoint. |
| `SMSGATE_USERNAME` | — | HTTP Basic auth username. |
| `SMSGATE_PASSWORD` | — | HTTP Basic auth password. |
| `SMSGATE_SIM_NUMBER` | `2` | Explicit SIM slot on the Android device (1 or 2). |
| `SMSGATE_DEVICE_ID` | `None` | Optional device ID filter for multi-phone setups. |
| `TEST_RECIPIENTS` | — | Comma-separated allowlist of test phone numbers (e.g. `+639916272657`). |
| `SMS_COOLDOWN_SECONDS` | `600` | Minimum seconds before the same student can trigger another SMS. |
| `SMS_DAILY_CAP` | `30` | Maximum test SMS messages allowed per calendar day across all students. |
| `SMS_SEND_DELAY_SECONDS` | `2.0` | Minimum spacing gap between consecutive worker dispatches. |

---

## 2. Enabling the Hook

To activate live SMS notifications on gate recognition:
1. In your `.env` file, set:
   ```env
   SMS_TEST_HOOK_ENABLED=true
   SMS_HOOK_DRY_RUN=false
   TEST_RECIPIENTS=+639916272657
   ```
2. Start the turnstile gate biometrics engine:
   ```bash
   python edge_engine/gate_biometrics.py
   ```
3. A startup banner will confirm the hook is active:
   ```text
   ==============================================================
     [SRNHS EDGE SMS TEST HOOK ACTIVATED]
     Recipients:   +63991***2657
     Cooldown:     600.0s
     Daily Cap:    30 messages
     SIM Slot:     2
     Dry Run Mode: False
   ==============================================================
   ```

---

## 3. CSV Audit Log Format

Every SMS dispatch attempt is recorded to `edge_engine/logs/sms_hook_YYYYMMDD.csv` with the following columns:

```csv
timestamp,student_id,masked_recipient,event_type,message_id,http_status,status,error,seconds_from_recognition_to_submit
```

- **`timestamp`**: UTC ISO-8601 timestamp of dispatch.
- **`student_id`**: Internal identifier of matched student.
- **`masked_recipient`**: Privacy-masked destination number (e.g. `+63991***2657`).
- **`event_type`**: `entry` or `exit`.
- **`message_id`**: Gateway-assigned tracking ID.
- **`http_status`**: Response code from SMSGate (`200`, `202`, etc.).
- **`status`**: Updated delivery status (`Delivered`, `Failed`, `TimedOut`).
- **`seconds_from_recognition_to_submit`**: Latency from face match to gateway HTTP submission.

---

## 4. Running Unit Tests

Run the test suite using Python's standard `unittest`:
```bash
python -m unittest edge_engine/tests/test_sms_hook.py
```

---

## 5. How to Remove the Hook

When evaluation is complete, you can remove the hook in two quick steps:

1. In [`edge_engine/gate_biometrics.py`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/edge_engine/gate_biometrics.py), delete:
   - Line ~30: `from sms_hook import notify_recognition`
   - Line ~418: `notify_recognition(student_id, student_name.split()[0] if student_name else "Student", DEFAULT_EVENT_TYPE, now)`
2. Delete [`edge_engine/sms_hook.py`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/edge_engine/sms_hook.py) and [`edge_engine/tests/test_sms_hook.py`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/edge_engine/tests/test_sms_hook.py).
