-- ====================================================================
-- SRNHS — Fix: RLS policies for recognition_events table
-- Migration: 20260922_recognition_events_rls.sql
--
-- Problem: recognition_events had no RLS policies, so if RLS is
-- enabled on the table, anon-key clients receive 0 rows silently.
-- Both phone and laptop use the anon key (the app does not call
-- supabase.auth.signIn, so auth.uid() is always null / role = anon).
-- ====================================================================

-- Ensure RLS is on (idempotent)
ALTER TABLE public.recognition_events ENABLE ROW LEVEL SECURITY;

-- Allow any client (anon or authenticated) to read all recognition events
DROP POLICY IF EXISTS "Allow anon and authenticated read recognition events" ON public.recognition_events;
CREATE POLICY "Allow anon and authenticated read recognition events"
  ON public.recognition_events
  FOR SELECT
  USING (true);

-- Allow any client to insert recognition events (edge turnstile nodes use anon key)
DROP POLICY IF EXISTS "Allow anon and authenticated insert recognition events" ON public.recognition_events;
CREATE POLICY "Allow anon and authenticated insert recognition events"
  ON public.recognition_events
  FOR INSERT
  WITH CHECK (true);

-- Allow service role full access (used by edge functions)
DROP POLICY IF EXISTS "Service role full access recognition events" ON public.recognition_events;
CREATE POLICY "Service role full access recognition events"
  ON public.recognition_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- Ensure recognition_events is part of supabase_realtime publication
-- so that all clients (laptop + phone) receive INSERT events via WebSocket
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recognition_events;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already in publication, skip
  END;
END $$;

-- Performance index on captured_at for the default sort order
CREATE INDEX IF NOT EXISTS idx_recognition_events_captured_at
  ON public.recognition_events(captured_at DESC);

-- Index on student_id for per-student queries
CREATE INDEX IF NOT EXISTS idx_recognition_events_student_id
  ON public.recognition_events(student_id, captured_at DESC);
