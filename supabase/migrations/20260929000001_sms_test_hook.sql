-- =============================================================================
-- SMS Test Hook — Migration
-- Adds dedup tracking columns to sms_notifications and a unique constraint
-- used by the notify-test-sms Edge Function.
-- TO REMOVE: drop this migration and delete supabase/functions/notify-test-sms/
-- =============================================================================

-- 1. Ensure sms_notifications table exists (send-sms may have created it via API;
--    create it idempotently so this migration is self-contained).
CREATE TABLE IF NOT EXISTS public.sms_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid REFERENCES public.students(id),
  guardian_phone text,
  message     text,
  event_type  text,
  status      text,
  sent_at     timestamptz DEFAULT now()
);

-- 2. Add test-hook columns (idempotent).
ALTER TABLE public.sms_notifications
  ADD COLUMN IF NOT EXISTS masked_phone     text,
  ADD COLUMN IF NOT EXISTS smsgate_msg_id   text,
  ADD COLUMN IF NOT EXISTS error_msg        text,
  ADD COLUMN IF NOT EXISTS source           text DEFAULT 'send-sms';

-- 3. Unique constraint for dedup: one test SMS per student per event type per UTC day.
--    DROP first so re-running the migration is safe.
ALTER TABLE public.sms_notifications
  DROP CONSTRAINT IF EXISTS uq_sms_test_hook_daily;

ALTER TABLE public.sms_notifications
  ADD CONSTRAINT uq_sms_test_hook_daily
  UNIQUE (student_id, event_type, source, (date_trunc('day', sent_at)));

-- 4. RLS — service role bypasses; anon cannot read.
ALTER TABLE public.sms_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.sms_notifications;
CREATE POLICY "service_role_all" ON public.sms_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);
