-- =============================================================================
-- Classroom Attendance — Table + RLS
-- Teachers may INSERT/UPDATE/DELETE rows only for sections where they are the
-- adviser (staff_profiles.id = sections.adviser_id).
-- Admins have SELECT only. service_role is unrestricted (edge engine, functions).
-- =============================================================================

-- 1. Create table (idempotent).
CREATE TABLE IF NOT EXISTS public.classroom_attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  section_id   uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  date         date NOT NULL DEFAULT CURRENT_DATE,
  status       text NOT NULL CHECK (status IN ('present', 'late', 'absent', 'excused')),
  marked_by    uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  marked_at    timestamptz NOT NULL DEFAULT now(),
  notes        text,
  UNIQUE (student_id, section_id, date)      -- one record per student per section per day
);

-- 2. Enable RLS.
ALTER TABLE public.classroom_attendance ENABLE ROW LEVEL SECURITY;

-- 3. service_role: full access (edge engine, Edge Functions, admin scripts).
DROP POLICY IF EXISTS "ca_service_role_all" ON public.classroom_attendance;
CREATE POLICY "ca_service_role_all" ON public.classroom_attendance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Teachers: SELECT only their own section's rows.
--    A teacher is the adviser when staff_profiles.id = sections.adviser_id.
DROP POLICY IF EXISTS "ca_teacher_select_own_section" ON public.classroom_attendance;
CREATE POLICY "ca_teacher_select_own_section" ON public.classroom_attendance
  FOR SELECT TO authenticated
  USING (
    -- admin: sees all rows
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'admin'
    )
    OR
    -- teacher: sees only their assigned section
    EXISTS (
      SELECT 1 FROM public.sections sec
      JOIN  public.staff_profiles sp ON sp.id = sec.adviser_id
      WHERE sec.id = classroom_attendance.section_id
        AND sp.id = auth.uid()
        AND sp.role = 'teacher'
    )
  );

-- 5. Teachers: INSERT only into their own section, and only as themselves.
DROP POLICY IF EXISTS "ca_teacher_insert_own_section" ON public.classroom_attendance;
CREATE POLICY "ca_teacher_insert_own_section" ON public.classroom_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    -- caller must be a teacher
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'teacher'
    )
    AND
    -- section must be assigned to this teacher
    EXISTS (
      SELECT 1 FROM public.sections sec
      WHERE sec.id = section_id
        AND sec.adviser_id = auth.uid()
    )
    AND
    -- marked_by must be themselves
    marked_by = auth.uid()
  );

-- 6. Teachers: UPDATE only their own section's rows (status or notes).
DROP POLICY IF EXISTS "ca_teacher_update_own_section" ON public.classroom_attendance;
CREATE POLICY "ca_teacher_update_own_section" ON public.classroom_attendance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'teacher'
    )
    AND
    EXISTS (
      SELECT 1 FROM public.sections sec
      WHERE sec.id = classroom_attendance.section_id
        AND sec.adviser_id = auth.uid()
    )
  )
  WITH CHECK (
    marked_by = auth.uid()
  );

-- 7. Teachers: DELETE only their own section's rows.
DROP POLICY IF EXISTS "ca_teacher_delete_own_section" ON public.classroom_attendance;
CREATE POLICY "ca_teacher_delete_own_section" ON public.classroom_attendance
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'teacher'
    )
    AND
    EXISTS (
      SELECT 1 FROM public.sections sec
      WHERE sec.id = classroom_attendance.section_id
        AND sec.adviser_id = auth.uid()
    )
  );

-- NOTE: There is intentionally NO write policy for admins.
-- Admins are covered by SELECT via "ca_teacher_select_own_section" (which checks for admin role).
-- Any admin INSERT/UPDATE/DELETE attempt will be rejected by RLS with "new row violates
-- row-level security policy". This is the intended behaviour.

-- 8. Helpful index for the teacher's daily view query.
CREATE INDEX IF NOT EXISTS idx_ca_section_date
  ON public.classroom_attendance (section_id, date DESC);
