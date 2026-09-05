-- ====================================================================
-- San Roque National High School — Test Accounts Seed Script
-- Run this in your Supabase SQL Editor to seed test accounts
-- ====================================================================

-- 1. Create Staff Profile for Admin (Dr. Maria Santos)
INSERT INTO public.staff_profiles (id, email, full_name, role, department, is_active)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'admin@srnhs.edu.ph', 'Dr. Maria Santos', 'admin', 'Office of the Principal', true)
ON CONFLICT (id) DO UPDATE 
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role;

-- 2. Create Staff Profile for Teacher (Mr. Juan Dela Cruz)
INSERT INTO public.staff_profiles (id, email, full_name, role, department, is_active)
VALUES 
  ('00000000-0000-0000-0000-000000000002', 'teacher@srnhs.edu.ph', 'Mr. Juan Dela Cruz', 'teacher', 'Science & Mathematics Faculty', true)
ON CONFLICT (id) DO UPDATE 
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role;
