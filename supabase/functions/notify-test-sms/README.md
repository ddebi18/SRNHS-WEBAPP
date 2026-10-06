# `notify-test-sms` — Supabase Edge Function

> **TEMPORARY TEST HOOK** — Remove after SMS gateway evaluation.

Fires whenever a `recognition_events` row is inserted with `status = 'matched'`
and sends one test SMS through SMSGate to the numbers in `TEST_RECIPIENTS`.
No guardian phone numbers are read or used.

---

## Setup

### 1. Run the migration

```bash
supabase db push
# or apply manually:
psql $DATABASE_URL < supabase/migrations/20260929000001_sms_test_hook.sql
```

### 2. Deploy the function

```bash
supabase functions deploy notify-test-sms --no-verify-jwt
```

### 3. Set secrets

Copy `.env.example` and fill in real values, then:

```bash
supabase secrets set \
  SMS_TEST_HOOK_ENABLED=true \
  SMSGATE_USERNAME=xxx \
  SMSGATE_PASSWORD=xxx \
  SMSGATE_SIM_NUMBER=2 \
  TEST_RECIPIENTS=+639XXXXXXXXX \
  WEBHOOK_SECRET=some_random_string \
  SMS_COOLDOWN_SECONDS=600 \
  SMS_DAILY_CAP=30
```

### 4. Create the Database Webhook (Supabase Dashboard)

Dashboard → Database → Webhooks → Create a new hook:

| Field | Value |
|-------|-------|
| Name | `on_recognition_matched_sms` |
| Table | `public.recognition_events` |
| Events | `INSERT` |
| URL | `https://<project-ref>.supabase.co/functions/v1/notify-test-sms` |
| Headers | `x-webhook-secret: <your WEBHOOK_SECRET>` |
| HTTP method | POST |

> Supabase webhooks are async — attendance logging is never blocked.

---

## Testing

### Manual function invoke (curl)

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/notify-test-sms \
  -H "x-webhook-secret: <WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "record": {
      "student_id": "<valid-student-uuid>",
      "event_type": "entry",
      "status": "matched",
      "captured_at": "2026-09-29T07:00:00Z"
    }
  }'
```

Expected CP log in Supabase function logs:
```
[CP1] Webhook received — method=POST
[CP2] Auth ok
[CP3] Gates passed — student=<uuid> event=entry
[CP4] POST .../messages — recipients=+63991***2657 sim=2
[CP5] Response status=202 body={"id":"...","state":"Pending",...}
```

### Insert a test row (triggers the webhook)

```sql
INSERT INTO recognition_events (student_id, event_type, status, source, captured_at)
VALUES ('<valid-student-uuid>', 'entry', 'matched', 'camera', now());
```

### Run unit tests

```bash
deno test supabase/functions/notify-test-sms/index_test.ts
```

### Verify dedup

Send the same student/event within the cooldown window — function logs `Dedup — cooldown active`.

---

## How to remove the test hook completely

1. Delete the DB Webhook in Supabase Dashboard → Database → Webhooks.
2. `supabase functions delete notify-test-sms`
3. Delete `supabase/functions/notify-test-sms/`
4. Delete `supabase/migrations/20260929000001_sms_test_hook.sql`
5. Optionally drop the added columns:
   ```sql
   ALTER TABLE sms_notifications
     DROP COLUMN IF EXISTS masked_phone,
     DROP COLUMN IF EXISTS smsgate_msg_id,
     DROP COLUMN IF EXISTS error_msg,
     DROP COLUMN IF EXISTS source;
   ALTER TABLE sms_notifications
     DROP CONSTRAINT IF EXISTS uq_sms_test_hook_daily;
   ```
6. Unset secrets: `supabase secrets unset SMS_TEST_HOOK_ENABLED SMSGATE_USERNAME SMSGATE_PASSWORD WEBHOOK_SECRET TEST_RECIPIENTS`
