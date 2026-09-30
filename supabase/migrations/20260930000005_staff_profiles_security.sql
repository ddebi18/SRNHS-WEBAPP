-- =============================================================================
-- Migration: 20260930000005_staff_profiles_security.sql
-- Description: Hardens staff_profiles RLS and guarantees own-row select for auth.
-- =============================================================================

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- 1. Any authenticated user can read their OWN profile (needed immediately after login)
DROP POLICY IF EXISTS "sp_self_select" ON public.staff_profiles;
DROP POLICY IF EXISTS "Staff can view their own profile" ON public.staff_profiles;
CREATE POLICY "sp_self_select" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 2. Administrators can read all staff profiles
DROP POLICY IF EXISTS "sp_admin_select_all" ON public.staff_profiles;
DROP POLICY IF EXISTS "Admins full access to staff profiles" ON public.staff_profiles;
CREATE POLICY "sp_admin_select_all" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles me
      WHERE me.id = auth.uid() AND me.role = 'admin' AND me.is_active = true
    )
  );

-- 3. Only administrators can INSERT / UPDATE / DELETE profiles
DROP POLICY IF EXISTS "sp_admin_modify" ON public.staff_profiles;
CREATE POLICY "sp_admin_modify" ON public.staff_profiles
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
