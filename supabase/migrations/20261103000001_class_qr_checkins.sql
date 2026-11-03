CREATE TABLE IF NOT EXISTS public.class_qr_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.class_qr_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late')),
  CONSTRAINT uq_class_qr_checkin_student_subject_date
    UNIQUE (student_id, subject_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_class_qr_checkins_section_subject_date
  ON public.class_qr_checkins (section_id, subject_id, attendance_date);

ALTER TABLE public.class_qr_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_qr_checkins_faculty_select" ON public.class_qr_checkins;
CREATE POLICY "class_qr_checkins_faculty_select" ON public.class_qr_checkins
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_section(section_id)
    OR public.is_teacher_assigned(section_id, subject_id)
  );

DROP POLICY IF EXISTS "class_qr_checkins_service_role" ON public.class_qr_checkins;
CREATE POLICY "class_qr_checkins_service_role" ON public.class_qr_checkins
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.class_qr_checkins TO authenticated;
GRANT ALL ON public.class_qr_checkins TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'class_qr_checkins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.class_qr_checkins;
  END IF;
END;
$$;
