-- =============================================================================
-- Migration: 20261001000002_teaching_assignments.sql
-- Description:
--   1. Ensures subjects and rooms tables have consistent schema and RLS policies.
--   2. Creates teaching_assignments table with foreign keys, indexes, and RLS.
--   3. Seeds baseline academic subjects and rooms if empty.
-- =============================================================================

-- ── 1. Subjects table hardening ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  name text,
  code text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure name column exists and mirrors title
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS name text;
UPDATE public.subjects SET name = title WHERE name IS NULL AND title IS NOT NULL;
UPDATE public.subjects SET title = name WHERE title IS NULL AND name IS NOT NULL;

-- Enable RLS on subjects
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subjects_read_authenticated" ON public.subjects;
CREATE POLICY "subjects_read_authenticated" ON public.subjects
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "subjects_admin_write" ON public.subjects;
CREATE POLICY "subjects_admin_write" ON public.subjects
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

DROP POLICY IF EXISTS "subjects_service_role_all" ON public.subjects;
CREATE POLICY "subjects_service_role_all" ON public.subjects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Rooms table hardening ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  building text NOT NULL,
  capacity integer NOT NULL DEFAULT 40,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on rooms
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_read_authenticated" ON public.rooms;
CREATE POLICY "rooms_read_authenticated" ON public.rooms
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rooms_admin_write" ON public.rooms;
CREATE POLICY "rooms_admin_write" ON public.rooms
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

DROP POLICY IF EXISTS "rooms_service_role_all" ON public.rooms;
CREATE POLICY "rooms_service_role_all" ON public.rooms
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Teaching Assignments Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teaching_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  days text[] NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teaching_assignments_time_check CHECK (end_time > start_time)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_teaching_assignments_teacher ON public.teaching_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teaching_assignments_section ON public.teaching_assignments(section_id);
CREATE INDEX IF NOT EXISTS idx_teaching_assignments_room ON public.teaching_assignments(room_id);

-- Enable RLS on teaching_assignments
ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;

-- Select policy: Admins see all; Teachers only see their own assignments
DROP POLICY IF EXISTS "teaching_assignments_select" ON public.teaching_assignments;
CREATE POLICY "teaching_assignments_select" ON public.teaching_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles me
      WHERE me.id = auth.uid() AND me.role = 'admin' AND me.is_active = true
    )
    OR teacher_id = auth.uid()
  );

-- Insert/Update/Delete policy: Admins only
DROP POLICY IF EXISTS "teaching_assignments_admin_write" ON public.teaching_assignments;
CREATE POLICY "teaching_assignments_admin_write" ON public.teaching_assignments
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

DROP POLICY IF EXISTS "teaching_assignments_service_role_all" ON public.teaching_assignments;
CREATE POLICY "teaching_assignments_service_role_all" ON public.teaching_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. Baseline Seed Data (if empty) ─────────────────────────────────────────
INSERT INTO public.subjects (title, name, code, description)
SELECT s.title, s.name, s.code, s.description
FROM (
  VALUES
    ('General Mathematics', 'General Mathematics', 'GEN-MATH', 'Core Senior High Mathematics'),
    ('Science & Technology', 'Science & Technology', 'SCI-TECH', 'Integrated Junior & Senior High Science'),
    ('English for Academic & Professional Purposes', 'English for Academic & Professional Purposes', 'EAPP', 'Applied Academic English'),
    ('Filipino: Komunikasyon at Pananaliksik', 'Filipino: Komunikasyon at Pananaliksik', 'FIL-KOM', 'Core Filipino Language & Communication'),
    ('Contemporary Philippine Arts', 'Contemporary Philippine Arts', 'CPAR', 'National and Regional Arts from the Regions'),
    ('Physical Education and Health', 'Physical Education and Health', 'PE-HEALTH', 'Health and Physical Wellness'),
    ('Empowerment Technologies (ICT)', 'Empowerment Technologies (ICT)', 'EMP-TECH', 'Information and Communications Technology')
) AS s(title, name, code, description)
WHERE NOT EXISTS (SELECT 1 FROM public.subjects LIMIT 1);

INSERT INTO public.rooms (name, building, capacity)
SELECT r.name, r.building, r.capacity
FROM (
  VALUES
    ('Room 101', 'Building A', 45),
    ('Room 102', 'Building A', 45),
    ('Room 201', 'Building B', 45),
    ('Room 202', 'Building B', 45),
    ('Science Laboratory', 'Main Building', 50),
    ('Computer Laboratory', 'ICT Building', 40),
    ('School Gymnasium', 'Sports Complex', 200)
) AS r(name, building, capacity)
WHERE NOT EXISTS (SELECT 1 FROM public.rooms LIMIT 1);
