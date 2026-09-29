# SMSGate Diagnostic & Load Test Harness

> [!NOTE]
> **Temporary Test Tooling:** This tool is an isolated diagnostic harness to benchmark [SMSGate](https://docs.sms-gate.app) (Android device as local SMS gateway) for throughput, delivery latency, and background reliability. It does **not** touch the production attendance pipeline, Supabase, or real student/guardian records.

---

## 1. Setup & Configuration

1. Copy the example configuration file to `.env`:
   ```bash
   cp tools/sms_test/.env.example tools/sms_test/.env
   ```
2. Open `tools/sms_test/.env` and configure:
   - `SMSGATE_BASE_URL`: `https://api.sms-gate.app/3rdparty/v1` (or your private server endpoint).
   - `SMSGATE_USERNAME` & `SMSGATE_PASSWORD`: Basic authentication credentials configured in your SMSGate Android app.
   - `SMSGATE_DEVICE_ID` *(optional)*: Device ID if multiple phones are connected to your SMSGate account.
   - `TEST_RECIPIENTS`: Comma-separated allowlist of test phone numbers (e.g. `+639171234567,+639181234567`).

> [!IMPORTANT]
> **Safety Protection:** The harness strictly rejects any phone number not present in `TEST_RECIPIENTS` to prevent accidental transmissions to non-testing recipients.

---

## 2. Test Commands

Run all commands from the repository root:

### A. Single Message Latency Test (`send`)
Sends a single test SMS and polls delivery status until terminal state (`Delivered` or `Failed`):
```bash
python tools/sms_test/sms_test.py send --to +639171234567 --text "SRNHS single test #1"
```
*Optional flags:* `--timeout 120` (max poll seconds), `--poll-interval 2`, `--dry-run`.

### B. Burst & Throughput Test (`burst`)
Sends $N$ messages rotating through allowlisted recipients to test rate limits and queue processing:
```bash
python tools/sms_test/sms_test.py burst --count 20 --interval 0 --to-all
```
*Notes:* Hard safety cap of 50 messages per run. Includes confirmation prompt unless `--yes` or `-y` is provided.

### C. Extended Soak Test (`soak`)
Periodically sends messages over an extended duration to verify the Android background service survives screen off / power management:
```bash
python tools/sms_test/sms_test.py soak --duration-min 30 --every-sec 300
```

### D. Bad Number & Error Handling Test (`badnumber`)
Sends requests with invalid prefixes and malformed strings to evaluate HTTP and gateway error reporting:
```bash
python tools/sms_test/sms_test.py badnumber
```

### E. Historical Report Generator (`report`)
Generates benchmark summary statistics from a previously saved CSV run:
```bash
python tools/sms_test/sms_test.py report tools/sms_test/results/burst_YYYYMMDD_HHMMSS.csv
```

### F. Dry-Run Mode
Any command supports `--dry-run` to simulate requests without making live network calls:
```bash
python tools/sms_test/sms_test.py burst --count 5 --dry-run --yes
```

---

## 3. CSV Results Schema

Test runs are automatically recorded to `tools/sms_test/results/<command>_<timestamp>.csv` with the following columns:

| Column | Description |
| :--- | :--- |
| `index` | Sequence index of the message in the run |
| `masked_recipient` | Privacy-masked phone number (e.g. `+63917***4567`) |
| `message_id` | Gateway-assigned unique message ID |
| `submitted_at` | ISO 8601 UTC timestamp of API submission |
| `http_status` | HTTP response code from initial POST (e.g. 200, 201) |
| `first_state` | Initial state returned upon submission |
| `sent_at` | Timestamp when the device transmitted the SMS |
| `delivered_at` | Timestamp when carrier delivery receipt was confirmed |
| `final_state` | Terminal state (`Delivered`, `Failed`, `TimedOut`, etc.) |
| `submit_to_sent_sec` | Latency from submit to device dispatch (seconds) |
| `submit_to_delivered_sec` | Total latency from submit to carrier delivery (seconds) |
| `error` | Error message or timeout details if failed |

---

## 4. Running Unit Tests

Run the test suite using Python's standard `unittest`:
```bash
python -m unittest tools/sms_test/test_sms_test.py
```
