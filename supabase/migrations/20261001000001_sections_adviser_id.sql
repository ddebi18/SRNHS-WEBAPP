-- =============================================================================
-- Migration: 20261001000001_sections_adviser_id.sql
-- Additive: add adviser_id FK on sections (if it doesn't already exist).
--
-- check_schema.ts already queries sections.adviser_id successfully, which means
-- the column exists in production. This migration is a no-op guard that ensures
-- any fresh Supabase instance also has:
--   - The unique partial index (one adviser per section)
--   - Adviser assignment RLS on sections (admin-only write)
-- =============================================================================

-- 1. Add adviser_id if the column doesn't exist yet (safe no-op if it does).
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS adviser_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;

-- 2. One adviser per teacher: a teacher cannot be adviser of two sections simultaneously.
--    Partial index (only rows where adviser_id IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS sections_one_adviser_per_teacher
  ON public.sections (adviser_id)
  WHERE adviser_id IS NOT NULL;

-- 3. Enable RLS on sections if not already enabled.
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- 4. Authenticated users can SELECT sections (needed for dropdowns everywhere).
DROP POLICY IF EXISTS "sec_authenticated_select" ON public.sections;
CREATE POLICY "sec_authenticated_select" ON public.sections
  FOR SELECT TO authenticated
  USING (true);

-- 5. Only admins can INSERT / UPDATE / DELETE sections (including adviser assignment).
DROP POLICY IF EXISTS "sec_admin_write" ON public.sections;
CREATE POLICY "sec_admin_write" ON public.sections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles me
      WHERE me.id = auth.uid() AND me.role = 'admin' AND me.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles me
      WHERE me.id = auth.uid() AND me.role = 'admin' AND me.is_active = true
    )
  );

-- 6. service_role: unrestricted (edge engine, bootstrap scripts).
DROP POLICY IF EXISTS "sec_service_role_all" ON public.sections;
CREATE POLICY "sec_service_role_all" ON public.sections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- NOTE: classroom_attendance already uses adviser_id (sections.adviser_id = auth.uid())
-- for teacher RLS (migration 20260929000002_classroom_attendance_rls.sql). No changes needed there.
