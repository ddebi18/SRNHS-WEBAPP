-- =============================================================================
-- Migration: 20261024000002_faculty_features.sql
-- Description:
--   Faculty features: Quarterly Grades (Q1-Q4), Class QR Sessions,
--   School-wide Events, and Event Attendance with RLS and Indexes.
-- =============================================================================

-- ── 1. Grades Table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  quarter integer NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
  grade numeric(5,2) NOT NULL CHECK (grade >= 60.00 AND grade <= 100.00),
  is_published boolean NOT NULL DEFAULT false,
  recorded_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_grades_student_subject_sy_quarter UNIQUE (student_id, subject_id, school_year_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_grades_student_sy ON public.grades(student_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_grades_section_subject_quarter ON public.grades(section_id, subject_id, quarter);
CREATE INDEX IF NOT EXISTS idx_grades_recorded_by ON public.grades(recorded_by);

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- Helper to check if a teacher is assigned to a subject and section
CREATE OR REPLACE FUNCTION public.is_teacher_assigned(p_section_id uuid, p_subject_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.teaching_assignments ta
    WHERE ta.teacher_id = auth.uid()
      AND ta.section_id = p_section_id
      AND ta.subject_id = p_subject_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Admin full access
DROP POLICY IF EXISTS "grades_admin_all" ON public.grades;
CREATE POLICY "grades_admin_all" ON public.grades
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Teachers can view grades for sections/subjects they teach or advise
DROP POLICY IF EXISTS "grades_teacher_select" ON public.grades;
CREATE POLICY "grades_teacher_select" ON public.grades
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher_assigned(section_id, subject_id)
    OR EXISTS (
      SELECT 1 FROM public.sections s
      WHERE s.id = section_id AND s.adviser_id = auth.uid()
    )
  );

-- Teachers can insert/update grades ONLY for subjects/sections they are assigned to
DROP POLICY IF EXISTS "grades_teacher_insert" ON public.grades;
CREATE POLICY "grades_teacher_insert" ON public.grades
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_teacher_assigned(section_id, subject_id)
  );

DROP POLICY IF EXISTS "grades_teacher_update" ON public.grades;
CREATE POLICY "grades_teacher_update" ON public.grades
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.is_teacher_assigned(section_id, subject_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_teacher_assigned(section_id, subject_id)
  );

-- Service role bypass
DROP POLICY IF EXISTS "grades_service_role" ON public.grades;
CREATE POLICY "grades_service_role" ON public.grades
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Future Guardian read-only policy placeholder (commented / prepared):
-- When guardian auth is added:
-- CREATE POLICY "grades_guardian_select" ON public.grades
--   FOR SELECT TO authenticated
--   USING (
--     is_published = true AND
--     student_id IN (
--       SELECT sg.student_id FROM public.student_guardians sg
--       JOIN public.guardians g ON g.id = sg.guardian_id
--       WHERE g.user_id = auth.uid()
--     )
--   );


-- ── 2. Class QR Sessions Table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.class_qr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_qr_token ON public.class_qr_sessions(token);
CREATE INDEX IF NOT EXISTS idx_class_qr_active ON public.class_qr_sessions(teacher_id, section_id, subject_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.class_qr_sessions ENABLE ROW LEVEL SECURITY;

-- Admin full access
DROP POLICY IF EXISTS "class_qr_admin_all" ON public.class_qr_sessions;
CREATE POLICY "class_qr_admin_all" ON public.class_qr_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Teachers manage their own sessions
DROP POLICY IF EXISTS "class_qr_teacher_all" ON public.class_qr_sessions;
CREATE POLICY "class_qr_teacher_all" ON public.class_qr_sessions
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Public / Students can query active tokens to check in
DROP POLICY IF EXISTS "class_qr_anon_select" ON public.class_qr_sessions;
CREATE POLICY "class_qr_anon_select" ON public.class_qr_sessions
  FOR SELECT TO anon, authenticated
  USING (revoked_at IS NULL AND expires_at > now());

DROP POLICY IF EXISTS "class_qr_service_role" ON public.class_qr_sessions;
CREATE POLICY "class_qr_service_role" ON public.class_qr_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 3. Events Table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  venue text,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
  created_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_auth" ON public.events;
CREATE POLICY "events_select_auth" ON public.events
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "events_admin_all" ON public.events;
CREATE POLICY "events_admin_all" ON public.events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "events_teacher_write" ON public.events;
CREATE POLICY "events_teacher_write" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "events_teacher_update" ON public.events;
CREATE POLICY "events_teacher_update" ON public.events
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR created_by = auth.uid())
  WITH CHECK (public.is_admin() OR created_by = auth.uid());

DROP POLICY IF EXISTS "events_service_role" ON public.events;
CREATE POLICY "events_service_role" ON public.events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 4. Event Attendance Table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL CHECK (method IN ('qr', 'face', 'manual')),
  recorded_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_student UNIQUE (event_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendance_event ON public.event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_student ON public.event_attendance(student_id);

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

-- Admins full access
DROP POLICY IF EXISTS "event_att_admin_all" ON public.event_attendance;
CREATE POLICY "event_att_admin_all" ON public.event_attendance
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Teachers can view and record attendance
DROP POLICY IF EXISTS "event_att_teacher_select" ON public.event_attendance;
CREATE POLICY "event_att_teacher_select" ON public.event_attendance
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "event_att_teacher_insert" ON public.event_attendance;
CREATE POLICY "event_att_teacher_insert" ON public.event_attendance
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "event_att_service_role" ON public.event_attendance;
CREATE POLICY "event_att_service_role" ON public.event_attendance
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
