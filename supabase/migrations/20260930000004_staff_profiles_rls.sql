-- =============================================================================
-- staff_profiles — RLS SELECT policies
--
-- Previously, staff_profiles had no SELECT policy for authenticated users,
-- causing the teacher adviser dropdown and Academics section list to return
-- 0 rows even for admin sessions.
--
-- Rules:
--   • admin: read all staff profiles (id, full_name, email, role, is_active,
--            department, created_at, updated_at — no sensitive auth fields)
--   • teacher: read own profile only
--   • service_role: unrestricted (already bypasses RLS)
-- =============================================================================

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- Admin: read all active staff profiles
DROP POLICY IF EXISTS "sp_admin_select_all" ON public.staff_profiles;
CREATE POLICY "sp_admin_select_all" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles me
      WHERE me.id = auth.uid() AND me.role = 'admin'
    )
  );

-- Teacher: read own profile
DROP POLICY IF EXISTS "sp_self_select" ON public.staff_profiles;
CREATE POLICY "sp_self_select" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Teacher: update own profile (name, department — not role)
-- ponytail: only SELECT is the blocker; skip UPDATE policy for now, add when teachers need to edit their profile
