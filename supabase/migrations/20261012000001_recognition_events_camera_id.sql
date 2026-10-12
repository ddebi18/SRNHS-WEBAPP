ALTER TABLE public.recognition_events
  ADD COLUMN IF NOT EXISTS camera_id text;

NOTIFY pgrst, 'reload schema';
