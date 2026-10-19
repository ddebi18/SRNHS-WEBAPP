DO $$
DECLARE
  captured_at_data_type text;
BEGIN
  IF to_regclass('public.recognition_events') IS NULL THEN
    RAISE EXCEPTION 'Cannot add daily attendance uniqueness: public.recognition_events does not exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recognition_events'
      AND column_name = 'student_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recognition_events'
      AND column_name = 'event_type'
  ) THEN
    RAISE EXCEPTION 'Cannot add daily attendance uniqueness: student_id or event_type is missing.';
  END IF;

  SELECT data_type
  INTO captured_at_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'recognition_events'
    AND column_name = 'captured_at';

  IF captured_at_data_type IS DISTINCT FROM 'timestamp with time zone' THEN
    RAISE EXCEPTION 'Cannot add daily attendance uniqueness: captured_at must be timestamp with time zone (found %).',
      COALESCE(captured_at_data_type, 'missing');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recognition_events
    WHERE student_id IS NOT NULL
      AND event_type IN ('entry', 'exit')
      AND captured_at IS NOT NULL
    GROUP BY
      student_id,
      event_type,
      (captured_at AT TIME ZONE 'Asia/Manila')::date
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add daily attendance uniqueness: duplicate student entry/exit events already exist for an Asia/Manila calendar day. Review and resolve duplicates before retrying.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS recognition_events_student_event_manila_day_uidx
  ON public.recognition_events (
    student_id,
    event_type,
    ((captured_at AT TIME ZONE 'Asia/Manila')::date)
  )
  WHERE student_id IS NOT NULL
    AND event_type IN ('entry', 'exit');
