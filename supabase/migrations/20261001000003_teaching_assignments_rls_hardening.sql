-- =============================================================================
-- Migration: 20261001000003_teaching_assignments_rls_hardening.sql
-- Description:
--   1. Adds SECURITY DEFINER helper functions (is_admin, current_teacher_id)
--      to eliminate RLS subquery recursion and guarantee exact ID matching.
--   2. Hardens teaching_assignments SELECT policy so teachers can view their
--      own assignments without recursion, and admins can view all.
--   3. Guarantees read-only SELECT access on subjects, rooms, sections, and
--      active staff_profiles for authenticated users (enabling PostgREST joins).
--   4. Preserves admin-only write permissions for all academic tables.
-- =============================================================================

-- ── 1. Security Definer Helper Functions ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' AND is_active = true
     FROM public.staff_profiles
     WHERE id = auth.uid()
     LIMIT 1),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id
  FROM public.staff_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_teacher_id() TO authenticated;

-- ── 2. Staff Profiles Read Policy for Joins ──────────────────────────────────
-- Authenticated users need to read active staff profiles for relational joins
-- (e.g. teacher names on assignments, class advisers on sections).
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sp_authenticated_read" ON public.staff_profiles;
CREATE POLICY "sp_authenticated_read" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (is_active = true);

-- ── 3. Teaching Assignments RLS Hardening ────────────────────────────────────
ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;

-- Select policy: Admins can view all; Teachers only view their own rows
DROP POLICY IF EXISTS "teaching_assignments_select" ON public.teaching_assignments;
CREATE POLICY "teaching_assignments_select" ON public.teaching_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR teacher_id = public.current_teacher_id()
  );

-- Admin-only write policy (insert, update, delete)
DROP POLICY IF EXISTS "teaching_assignments_admin_write" ON public.teaching_assignments;
CREATE POLICY "teaching_assignments_admin_write" ON public.teaching_assignments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 4. Joined Tables Read-Only Access Guarantee ──────────────────────────────
-- Subjects: read-only for authenticated, write for admin
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subjects_read_authenticated" ON public.subjects;
CREATE POLICY "subjects_read_authenticated" ON public.subjects
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "subjects_admin_write" ON public.subjects;
CREATE POLICY "subjects_admin_write" ON public.subjects
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Rooms: read-only for authenticated, write for admin
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_read_authenticated" ON public.rooms;
CREATE POLICY "rooms_read_authenticated" ON public.rooms
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rooms_admin_write" ON public.rooms;
CREATE POLICY "rooms_admin_write" ON public.rooms
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Sections: read-only for authenticated, write for admin
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sec_authenticated_select" ON public.sections;
CREATE POLICY "sec_authenticated_select" ON public.sections
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sec_admin_write" ON public.sections;
CREATE POLICY "sec_admin_write" ON public.sections
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
