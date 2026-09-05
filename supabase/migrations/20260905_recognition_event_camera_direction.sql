-- Store the camera and gate that produced each recognition event.
-- Direction remains represented by the existing event_type enum.

ALTER TABLE public.recognition_events
  ADD COLUMN IF NOT EXISTS camera_id TEXT,
  ADD COLUMN IF NOT EXISTS gate_id TEXT;

CREATE INDEX IF NOT EXISTS idx_recognition_events_camera_time
  ON public.recognition_events(camera_id, captured_at DESC);
