-- =============================================================================
-- Migration: 20261001000004_face_registration_adviser_scope.sql
-- Description:
--   Restrict Face Registration to the section adviser.
--   1. Adds public.is_adviser_of_section(uuid) SECURITY DEFINER helper.
--   2. Tightens students SELECT: teachers see only their advised section's
--      students. Admins see all.
--   3. Tightens students UPDATE (photo_urls / face data): teachers can update
--      only students in their advised section.
--
-- CONFLICT ANALYSIS — classroom_attendance:
--   The classroom_attendance RLS (20260929000002) allows teachers to SELECT
--   attendance rows WHERE section_id IN (SELECT id FROM sections WHERE
--   adviser_id = auth.uid()). That policy reads sections, not students directly,
--   so tightening students SELECT does NOT break attendance reads.
--   However, if any attendance JOIN selects student columns, a teacher would
--   need SELECT on those student rows. To be safe we keep teachers able to
--   SELECT students in their advised section (same scope), which covers both
--   face registration AND attendance display for that section.
--   Subject-teacher views (teaching_assignments) read assignments, not students
--   directly — no conflict.
-- =============================================================================

-- ── 1. Adviser helper ────────────────────────────────────────────────────────
-- Returns true if auth.uid() is the adviser of the given section_id.
CREATE OR REPLACE FUNCTION public.is_adviser_of_section(p_section_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sections
    WHERE id = p_section_id
      AND adviser_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_adviser_of_section(uuid) TO authenticated;

-- ── 2. Students RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- SELECT: admin sees all; teacher sees only their advised section's students.
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_section(section_id)
  );

-- INSERT: admin only (student enrolment is an admin task).
DROP POLICY IF EXISTS "students_insert" ON public.students;
CREATE POLICY "students_insert" ON public.students
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- UPDATE: admin always; teacher can update only their advised section's students
-- (covers face photo upload + face descriptor save).
DROP POLICY IF EXISTS "students_update" ON public.students;
CREATE POLICY "students_update" ON public.students
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_section(section_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_adviser_of_section(section_id)
  );

-- DELETE: admin only.
DROP POLICY IF EXISTS "students_delete" ON public.students;
CREATE POLICY "students_delete" ON public.students
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- service_role: unrestricted.
DROP POLICY IF EXISTS "students_service_role" ON public.students;
CREATE POLICY "students_service_role" ON public.students
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. student_guardians RLS ─────────────────────────────────────────────────
-- Guardian data follows the student: same adviser-scoped access.
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sg_select" ON public.student_guardians;
CREATE POLICY "sg_select" ON public.student_guardians
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND public.is_adviser_of_section(s.section_id)
    )
  );

DROP POLICY IF EXISTS "sg_write" ON public.student_guardians;
CREATE POLICY "sg_write" ON public.student_guardians
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sg_service_role" ON public.student_guardians;
CREATE POLICY "sg_service_role" ON public.student_guardians
  FOR ALL TO service_role USING (true) WITH CHECK (true);
