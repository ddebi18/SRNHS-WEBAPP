-- =============================================================================
-- Migration: 20261024000001_student_profiling_and_enrollment.sql
-- Description:
--   Comprehensive database schema upgrade for Student Profiling, Guardians,
--   Academic Master Data separation, Section Rules enforcement, and Leveling.
-- =============================================================================

-- ── 1. Academic Master Data Tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT false,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sy_select" ON public.school_years;
CREATE POLICY "sy_select" ON public.school_years
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sy_admin_write" ON public.school_years;
CREATE POLICY "sy_admin_write" ON public.school_years
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sy_service_role" ON public.school_years;
CREATE POLICY "sy_service_role" ON public.school_years
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grade Levels catalog
CREATE TABLE IF NOT EXISTS public.grade_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level integer NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gl_select" ON public.grade_levels;
CREATE POLICY "gl_select" ON public.grade_levels
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "gl_admin_write" ON public.grade_levels;
CREATE POLICY "gl_admin_write" ON public.grade_levels
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "gl_service_role" ON public.grade_levels;
CREATE POLICY "gl_service_role" ON public.grade_levels
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tracks and Strands
CREATE TABLE IF NOT EXISTS public.tracks_strands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  track_type text NOT NULL DEFAULT 'Academic',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracks_strands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ts_select" ON public.tracks_strands;
CREATE POLICY "ts_select" ON public.tracks_strands
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ts_admin_write" ON public.tracks_strands;
CREATE POLICY "ts_admin_write" ON public.tracks_strands
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ts_service_role" ON public.tracks_strands;
CREATE POLICY "ts_service_role" ON public.tracks_strands
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed basic grade levels and school years if missing
INSERT INTO public.grade_levels (level, name)
VALUES 
  (7, 'Grade 7'),
  (8, 'Grade 8'),
  (9, 'Grade 9'),
  (10, 'Grade 10'),
  (11, 'Grade 11'),
  (12, 'Grade 12')
ON CONFLICT (level) DO NOTHING;

INSERT INTO public.school_years (name, is_active, start_date, end_date)
VALUES ('S.Y. 2026-2027', true, '2026-06-01', '2027-03-31')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.tracks_strands (code, name, track_type)
VALUES
  ('JHS', 'Junior High School General Curriculum', 'JHS'),
  ('STEM', 'Science, Technology, Engineering, and Mathematics', 'Academic'),
  ('ABM', 'Accountancy, Business, and Management', 'Academic'),
  ('HUMSS', 'Humanities and Social Sciences', 'Academic'),
  ('GAS', 'General Academic Strand', 'Academic'),
  ('TVL-ICT', 'Technical-Vocational-Livelihood (ICT)', 'TVL'),
  ('TVL-HE', 'Technical-Vocational-Livelihood (Home Economics)', 'TVL')
ON CONFLICT (code) DO NOTHING;

-- Extend sections with school_year_id and track_strand_id
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS school_year_id uuid REFERENCES public.school_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS track_strand_id uuid REFERENCES public.tracks_strands(id) ON DELETE SET NULL;

-- Section Subjects (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.section_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_section_subject UNIQUE (section_id, subject_id)
);

ALTER TABLE public.section_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sec_subj_select" ON public.section_subjects;
CREATE POLICY "sec_subj_select" ON public.section_subjects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sec_subj_admin_write" ON public.section_subjects;
CREATE POLICY "sec_subj_admin_write" ON public.section_subjects
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sec_subj_service_role" ON public.section_subjects;
CREATE POLICY "sec_subj_service_role" ON public.section_subjects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Student Profile Columns ──────────────────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS suffix text,
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS religion text,
  ADD COLUMN IF NOT EXISTS mother_tongue text,
  ADD COLUMN IF NOT EXISTS ethnic_group text,
  ADD COLUMN IF NOT EXISTS is_pwd boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_4ps boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS house_street text,
  ADD COLUMN IF NOT EXISTS barangay text,
  ADD COLUMN IF NOT EXISTS city_municipality text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS prev_school_name text,
  ADD COLUMN IF NOT EXISTS prev_grade_level integer,
  ADD COLUMN IF NOT EXISTS prev_general_average numeric(5,2),
  ADD COLUMN IF NOT EXISTS school_year_admitted text;

-- ── 3. Guardians Table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL,
  mobile_number text NOT NULL,
  email text,
  address text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Exactly one primary guardian per student enforced via partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS guardians_one_primary_per_student
  ON public.guardians (student_id)
  WHERE is_primary = true;

-- Backfill from student_guardians table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_guardians') THEN
    INSERT INTO public.guardians (id, student_id, full_name, relationship, mobile_number, is_primary, created_at, updated_at)
    SELECT 
      CASE WHEN id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN id::uuid ELSE gen_random_uuid() END,
      student_id,
      name,
      relationship,
      phone_number,
      COALESCE(is_primary, false),
      created_at,
      now()
    FROM public.student_guardians
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guardians_select" ON public.guardians;
CREATE POLICY "guardians_select" ON public.guardians
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND public.is_adviser_of_section(s.section_id)
    )
  );

DROP POLICY IF EXISTS "guardians_write" ON public.guardians;
CREATE POLICY "guardians_write" ON public.guardians
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "guardians_service_role" ON public.guardians;
CREATE POLICY "guardians_service_role" ON public.guardians
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- NOTE: Future Guardian Read-Only Portal policy placeholder:
-- CREATE POLICY "guardians_self_read" ON public.guardians
--   FOR SELECT TO authenticated
--   USING (auth.jwt() ->> 'role' = 'guardian' AND email = auth.email());

-- ── 4. Enrollments Table (Leveling & Historical Audit) ───────────────────────

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE RESTRICT,
  grade_level integer NOT NULL,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('enrolled', 'promoted', 'retained', 'transferred_out', 'dropped', 'graduated')) DEFAULT 'enrolled',
  effective_date date NOT NULL DEFAULT current_date,
  changed_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student_current ON public.enrollments (student_id, is_current);
CREATE INDEX IF NOT EXISTS idx_enrollments_section ON public.enrollments (section_id);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrollments_select" ON public.enrollments;
CREATE POLICY "enrollments_select" ON public.enrollments
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_adviser_of_section(section_id)
  );

DROP POLICY IF EXISTS "enrollments_admin_write" ON public.enrollments;
CREATE POLICY "enrollments_admin_write" ON public.enrollments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "enrollments_service_role" ON public.enrollments;
CREATE POLICY "enrollments_service_role" ON public.enrollments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5. Section Rules: Rule A & Rule B Database Guards ────────────────────────

-- Rule A: Prevent enrolling students into a section that has 0 subjects
CREATE OR REPLACE FUNCTION public.trg_check_section_has_subjects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subject_count integer;
  v_section_name text;
BEGIN
  IF NEW.section_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), max(name)
  INTO v_subject_count, v_section_name
  FROM public.sections sec
  LEFT JOIN public.section_subjects ss ON ss.section_id = sec.id
  WHERE sec.id = NEW.section_id
  GROUP BY sec.id;

  -- Only enforce if section_subjects are being utilized in this installation
  IF EXISTS (SELECT 1 FROM public.section_subjects) AND v_subject_count = 0 THEN
    RAISE EXCEPTION 'Cannot enroll student into section "%" because it has zero subjects assigned (Rule A).', v_section_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_section_subjects_check ON public.students;
CREATE TRIGGER trg_student_section_subjects_check
  BEFORE INSERT OR UPDATE OF section_id ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_section_has_subjects();

DROP TRIGGER IF EXISTS trg_enrollment_section_subjects_check ON public.enrollments;
CREATE TRIGGER trg_enrollment_section_subjects_check
  BEFORE INSERT OR UPDATE OF section_id ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_section_has_subjects();

-- Rule B: Prevent section deletion, grade/strand/school_year modification if students enrolled
CREATE OR REPLACE FUNCTION public.trg_check_section_locked_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enrolled_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT count(*) INTO v_enrolled_count
    FROM public.students
    WHERE section_id = OLD.id;

    IF v_enrolled_count > 0 THEN
      RAISE EXCEPTION 'Section "%" cannot be deleted because it has % enrolled student(s) (Rule B).', OLD.name, v_enrolled_count;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.grade_level IS DISTINCT FROM NEW.grade_level
       OR OLD.track_strand_id IS DISTINCT FROM NEW.track_strand_id
       OR OLD.school_year_id IS DISTINCT FROM NEW.school_year_id THEN
      
      SELECT count(*) INTO v_enrolled_count
      FROM public.students
      WHERE section_id = OLD.id;

      IF v_enrolled_count > 0 THEN
        RAISE EXCEPTION 'Section "%" is locked with % enrolled student(s). Grade level, track/strand, and school year cannot be changed (Rule B).', OLD.name, v_enrolled_count;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sections_lock_check ON public.sections;
CREATE TRIGGER trg_sections_lock_check
  BEFORE UPDATE OR DELETE ON public.sections
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_section_locked_guard();

-- Rule B2: Block removing the last subject from a section with enrolled students
CREATE OR REPLACE FUNCTION public.trg_check_section_subject_removal_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining_subjects integer;
  v_enrolled_count integer;
BEGIN
  SELECT count(*) INTO v_remaining_subjects
  FROM public.section_subjects
  WHERE section_id = OLD.section_id AND id != OLD.id;

  IF v_remaining_subjects = 0 THEN
    SELECT count(*) INTO v_enrolled_count
    FROM public.students
    WHERE section_id = OLD.section_id;

    IF v_enrolled_count > 0 THEN
      RAISE EXCEPTION 'Cannot remove the last subject from section with % enrolled student(s) (Rule B).', v_enrolled_count;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_section_subjects_lock_check ON public.section_subjects;
CREATE TRIGGER trg_section_subjects_lock_check
  BEFORE DELETE ON public.section_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_section_subject_removal_guard();
