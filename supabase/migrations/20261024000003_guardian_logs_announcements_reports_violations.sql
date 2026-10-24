-- =============================================================================
-- Migration: 20261024000003_guardian_logs_announcements_reports_violations.sql
-- Description:
--   Comprehensive database schema additions for:
--   1. Guardian Accounts (user_id FK, invite lifecycle, RLS policies)
--   2. User Logs / Audit Trail (append-only table and security policies)
--   3. Announcements, Attachments, and Recipients (targeted delivery + RLS)
--   4. Violations, Violation Types, and Violation View Tracking (who saw it)
--   5. Faculty Report Aggregation Functions / RPCs
-- =============================================================================

-- ── 1. Guardian Account Columns & Helpers ─────────────────────────────────────

ALTER TABLE public.guardians 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_guardians_user_id ON public.guardians(user_id);
CREATE INDEX IF NOT EXISTS idx_guardians_student_id ON public.guardians(student_id);

-- Helper: Check if current authenticated user is a guardian
CREATE OR REPLACE FUNCTION public.is_guardian()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guardians
    WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_guardian() TO authenticated;

-- Helper: Get list of student IDs linked to current authenticated guardian
CREATE OR REPLACE FUNCTION public.get_guardian_student_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT student_id FROM public.guardians
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_guardian_student_ids() TO authenticated;

-- Update guardians RLS: Allow guardian to view their own profile/records
DROP POLICY IF EXISTS "guardians_guardian_select" ON public.guardians;
CREATE POLICY "guardians_guardian_select" ON public.guardians
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
  );

-- Update students RLS: Allow guardian to read basic info of their linked children
DROP POLICY IF EXISTS "students_guardian_select" ON public.students;
CREATE POLICY "students_guardian_select" ON public.students
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT public.get_guardian_student_ids())
  );

-- Update recognition_events RLS: Allow guardian to view gate attendance for their linked children
DROP POLICY IF EXISTS "rec_events_guardian_select" ON public.recognition_events;
CREATE POLICY "rec_events_guardian_select" ON public.recognition_events
  FOR SELECT TO authenticated
  USING (
    student_id IN (SELECT public.get_guardian_student_ids())
  );

-- Update classroom_attendance RLS: Allow guardian to view classroom attendance of their linked children
DROP POLICY IF EXISTS "ca_guardian_select" ON public.classroom_attendance;
CREATE POLICY "ca_guardian_select" ON public.classroom_attendance
  FOR SELECT TO authenticated
  USING (
    student_id IN (SELECT public.get_guardian_student_ids())
  );

-- Update event_attendance RLS: Allow guardian to view school event attendance of their linked children
DROP POLICY IF EXISTS "ea_guardian_select" ON public.event_attendance;
CREATE POLICY "ea_guardian_select" ON public.event_attendance
  FOR SELECT TO authenticated
  USING (
    student_id IN (SELECT public.get_guardian_student_ids())
  );

-- Update grades RLS: Allow guardian to view PUBLISHED grades only of their linked children
DROP POLICY IF EXISTS "grades_guardian_select" ON public.grades;
CREATE POLICY "grades_guardian_select" ON public.grades
  FOR SELECT TO authenticated
  USING (
    is_published = true 
    AND student_id IN (SELECT public.get_guardian_student_ids())
  );


-- ── 2. User Logs Table (Audit Trail) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_logs_user_id ON public.user_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_logs_entity ON public.user_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_action ON public.user_logs(action, created_at DESC);

ALTER TABLE public.user_logs ENABLE ROW LEVEL SECURITY;

-- Append-only: Authenticated users can insert log records
DROP POLICY IF EXISTS "user_logs_insert" ON public.user_logs;
CREATE POLICY "user_logs_insert" ON public.user_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admins can view all logs; teachers can view only their own logs
DROP POLICY IF EXISTS "user_logs_select" ON public.user_logs;
CREATE POLICY "user_logs_select" ON public.user_logs
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR user_id = auth.uid()
  );

-- Service role bypass
DROP POLICY IF EXISTS "user_logs_service_role" ON public.user_logs;
CREATE POLICY "user_logs_service_role" ON public.user_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Explicitly no UPDATE or DELETE policies: strictly append-only audit trail.


-- ── 3. Announcements, Attachments, and Recipients ────────────────────────────

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience_type text NOT NULL CHECK (audience_type IN ('school', 'grade_level', 'section')),
  audience_id text,
  send_sms boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.announcements(audience_type, audience_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_attachments_ann ON public.announcement_attachments(announcement_id);
ALTER TABLE public.announcement_attachments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.announcement_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  sms_status text NOT NULL DEFAULT 'none',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_announcement_guardian UNIQUE (announcement_id, guardian_id)
);

CREATE INDEX IF NOT EXISTS idx_ann_recipients_guardian ON public.announcement_recipients(guardian_id);
CREATE INDEX IF NOT EXISTS idx_ann_recipients_read ON public.announcement_recipients(read_at);
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;

-- Announcements RLS
DROP POLICY IF EXISTS "ann_admin_all" ON public.announcements;
CREATE POLICY "ann_admin_all" ON public.announcements
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ann_teacher_select" ON public.announcements;
CREATE POLICY "ann_teacher_select" ON public.announcements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.id = auth.uid() AND sp.role = 'teacher'));

DROP POLICY IF EXISTS "ann_teacher_insert" ON public.announcements;
CREATE POLICY "ann_teacher_insert" ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "ann_guardian_select" ON public.announcements;
CREATE POLICY "ann_guardian_select" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    audience_type = 'school'
    OR (
      audience_type = 'grade_level'
      AND audience_id IN (
        SELECT s.grade_level::text FROM public.students s
        WHERE s.id IN (SELECT public.get_guardian_student_ids())
      )
    )
    OR (
      audience_type = 'section'
      AND audience_id IN (
        SELECT s.section_id::text FROM public.students s
        WHERE s.id IN (SELECT public.get_guardian_student_ids())
      )
    )
  );

DROP POLICY IF EXISTS "ann_service_role" ON public.announcements;
CREATE POLICY "ann_service_role" ON public.announcements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Announcement Attachments RLS
DROP POLICY IF EXISTS "ann_att_select" ON public.announcement_attachments;
CREATE POLICY "ann_att_select" ON public.announcement_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = announcement_id
        AND (
          public.is_admin()
          OR a.created_by = auth.uid()
          OR a.audience_type = 'school'
          OR (
            a.audience_type = 'grade_level'
            AND a.audience_id IN (
              SELECT s.grade_level::text FROM public.students s
              WHERE s.id IN (SELECT public.get_guardian_student_ids())
            )
          )
          OR (
            a.audience_type = 'section'
            AND a.audience_id IN (
              SELECT s.section_id::text FROM public.students s
              WHERE s.id IN (SELECT public.get_guardian_student_ids())
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "ann_att_write" ON public.announcement_attachments;
CREATE POLICY "ann_att_write" ON public.announcement_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = announcement_id AND a.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ann_att_service_role" ON public.announcement_attachments;
CREATE POLICY "ann_att_service_role" ON public.announcement_attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Announcement Recipients RLS
DROP POLICY IF EXISTS "ann_rec_select" ON public.announcement_recipients;
CREATE POLICY "ann_rec_select" ON public.announcement_recipients
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.guardians g
      WHERE g.id = guardian_id AND g.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = announcement_id AND a.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ann_rec_update" ON public.announcement_recipients;
CREATE POLICY "ann_rec_update" ON public.announcement_recipients
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.guardians g
      WHERE g.id = guardian_id AND g.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.guardians g
      WHERE g.id = guardian_id AND g.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ann_rec_write_staff" ON public.announcement_recipients;
CREATE POLICY "ann_rec_write_staff" ON public.announcement_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = announcement_id AND a.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ann_rec_service_role" ON public.announcement_recipients;
CREATE POLICY "ann_rec_service_role" ON public.announcement_recipients
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 4. Violations, Types, and Viewers ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.violation_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.violation_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vt_select" ON public.violation_types;
CREATE POLICY "vt_select" ON public.violation_types
  FOR SELECT TO authenticated
  USING (NOT public.is_guardian());

DROP POLICY IF EXISTS "vt_admin_write" ON public.violation_types;
CREATE POLICY "vt_admin_write" ON public.violation_types
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "vt_service_role" ON public.violation_types;
CREATE POLICY "vt_service_role" ON public.violation_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default violation types
INSERT INTO public.violation_types (code, name, description)
VALUES 
  ('improper_uniform', 'Improper Uniform', 'Not wearing complete or prescribed school uniform during class hours'),
  ('earrings_accessories', 'Prohibited Jewelry / Accessories', 'Wearing unprescribed earrings, piercing jewelry, or prohibited accessories'),
  ('long_hair', 'Haircut / Grooming Non-Compliance', 'Haircut or personal grooming outside standard DepEd student dress code policy'),
  ('other', 'Other Disciplinary Infraction', 'Other student disciplinary or conduct rule infraction')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  violation_type_id uuid NOT NULL REFERENCES public.violation_types(id) ON DELETE RESTRICT,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  location text,
  notes text,
  evidence_path text,
  status text NOT NULL CHECK (status IN ('reported', 'acknowledged', 'resolved')) DEFAULT 'reported',
  source text NOT NULL DEFAULT 'manual',
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_violations_student ON public.violations(student_id);
CREATE INDEX IF NOT EXISTS idx_violations_section ON public.violations(section_id);
CREATE INDEX IF NOT EXISTS idx_violations_status ON public.violations(status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_violations_reported_by ON public.violations(reported_by);

ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

-- Violations View Tracking (Who saw it)
CREATE TABLE IF NOT EXISTS public.violation_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id uuid NOT NULL REFERENCES public.violations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_violation_user_view UNIQUE (violation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_violation_views_vio ON public.violation_views(violation_id);
CREATE INDEX IF NOT EXISTS idx_violation_views_usr ON public.violation_views(user_id);
ALTER TABLE public.violation_views ENABLE ROW LEVEL SECURITY;

-- Violations RLS:
-- Admin: Full access
-- Teachers: Can insert; can select violations for their section/advisory or reported by themselves
-- Guardians: STRICTLY DENIED (NO POLICY)
DROP POLICY IF EXISTS "violations_admin_all" ON public.violations;
CREATE POLICY "violations_admin_all" ON public.violations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "violations_teacher_insert" ON public.violations;
CREATE POLICY "violations_teacher_insert" ON public.violations
  FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = auth.uid()
    AND NOT public.is_guardian()
  );

DROP POLICY IF EXISTS "violations_teacher_select" ON public.violations;
CREATE POLICY "violations_teacher_select" ON public.violations
  FOR SELECT TO authenticated
  USING (
    NOT public.is_guardian()
    AND (
      reported_by = auth.uid()
      OR public.is_adviser_of_section(section_id)
      OR EXISTS (
        SELECT 1 FROM public.teaching_assignments ta
        WHERE ta.teacher_id = auth.uid() AND ta.section_id = public.violations.section_id
      )
    )
  );

DROP POLICY IF EXISTS "violations_teacher_update" ON public.violations;
CREATE POLICY "violations_teacher_update" ON public.violations
  FOR UPDATE TO authenticated
  USING (
    NOT public.is_guardian()
    AND (
      reported_by = auth.uid()
      OR public.is_adviser_of_section(section_id)
    )
  )
  WITH CHECK (
    NOT public.is_guardian()
    AND (
      reported_by = auth.uid()
      OR public.is_adviser_of_section(section_id)
    )
  );

DROP POLICY IF EXISTS "violations_service_role" ON public.violations;
CREATE POLICY "violations_service_role" ON public.violations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Violation Views RLS:
DROP POLICY IF EXISTS "vv_admin_all" ON public.violation_views;
CREATE POLICY "vv_admin_all" ON public.violation_views
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "vv_teacher_view" ON public.violation_views;
CREATE POLICY "vv_teacher_view" ON public.violation_views
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND NOT public.is_guardian())
  WITH CHECK (user_id = auth.uid() AND NOT public.is_guardian());

DROP POLICY IF EXISTS "vv_service_role" ON public.violation_views;
CREATE POLICY "vv_service_role" ON public.violation_views
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 5. Faculty Reports Aggregates / RPCs ──────────────────────────────────────

-- Aggregates for attendance sessions held by faculty member
CREATE OR REPLACE FUNCTION public.get_faculty_attendance_summary(
  p_teacher_id uuid,
  p_sy_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  total_sessions_held bigint,
  total_attendees_marked bigint,
  present_count bigint,
  late_count bigint,
  absent_count bigint,
  excused_count bigint,
  overall_attendance_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH sessions AS (
    SELECT cqs.id, cqs.section_id, cqs.subject_id
    FROM public.class_qr_sessions cqs
    WHERE cqs.teacher_id = p_teacher_id
      AND (p_sy_id IS NULL OR cqs.school_year_id = p_sy_id)
      AND (p_start_date IS NULL OR cqs.expires_at::date >= p_start_date)
      AND (p_end_date IS NULL OR cqs.expires_at::date <= p_end_date)
  ),
  records AS (
    SELECT ca.status
    FROM public.classroom_attendance ca
    JOIN sessions s ON s.section_id = ca.section_id AND s.subject_id = ca.subject_id
    WHERE (p_start_date IS NULL OR ca.date >= p_start_date)
      AND (p_end_date IS NULL OR ca.date <= p_end_date)
  )
  SELECT
    (SELECT COUNT(*) FROM sessions)::bigint AS total_sessions_held,
    COUNT(*)::bigint AS total_attendees_marked,
    COUNT(*) FILTER (WHERE status = 'present')::bigint AS present_count,
    COUNT(*) FILTER (WHERE status = 'late')::bigint AS late_count,
    COUNT(*) FILTER (WHERE status = 'absent')::bigint AS absent_count,
    COUNT(*) FILTER (WHERE status = 'excused')::bigint AS excused_count,
    CASE 
      WHEN COUNT(*) > 0 
      THEN ROUND((COUNT(*) FILTER (WHERE status IN ('present', 'late'))::numeric / COUNT(*)::numeric) * 100, 2)
      ELSE 0.00 
    END AS overall_attendance_rate
  FROM records;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_faculty_attendance_summary(uuid, uuid, date, date) TO authenticated;

-- Aggregates for grades submission status per assigned section/subject
CREATE OR REPLACE FUNCTION public.get_faculty_grades_status(
  p_teacher_id uuid,
  p_sy_id uuid DEFAULT NULL
)
RETURNS TABLE (
  section_id uuid,
  section_name text,
  grade_level integer,
  subject_id uuid,
  subject_code text,
  subject_title text,
  total_enrolled bigint,
  q1_entered bigint,
  q1_published boolean,
  q2_entered bigint,
  q2_published boolean,
  q3_entered bigint,
  q3_published boolean,
  q4_entered bigint,
  q4_published boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sec.id AS section_id,
    sec.name AS section_name,
    sec.grade_level,
    sub.id AS subject_id,
    COALESCE(sub.code, '')::text AS subject_code,
    COALESCE(sub.title, sub.name, '')::text AS subject_title,
    COUNT(DISTINCT s.id)::bigint AS total_enrolled,
    COUNT(DISTINCT g1.student_id)::bigint AS q1_entered,
    COALESCE(BOOL_AND(g1.is_published), false) AS q1_published,
    COUNT(DISTINCT g2.student_id)::bigint AS q2_entered,
    COALESCE(BOOL_AND(g2.is_published), false) AS q2_published,
    COUNT(DISTINCT g3.student_id)::bigint AS q3_entered,
    COALESCE(BOOL_AND(g3.is_published), false) AS q3_published,
    COUNT(DISTINCT g4.student_id)::bigint AS q4_entered,
    COALESCE(BOOL_AND(g4.is_published), false) AS q4_published
  FROM public.teaching_assignments ta
  JOIN public.sections sec ON sec.id = ta.section_id
  JOIN public.subjects sub ON sub.id = ta.subject_id
  LEFT JOIN public.students s ON s.section_id = sec.id
  LEFT JOIN public.grades g1 ON g1.student_id = s.id AND g1.subject_id = sub.id AND g1.quarter = 1 AND (p_sy_id IS NULL OR g1.school_year_id = p_sy_id)
  LEFT JOIN public.grades g2 ON g2.student_id = s.id AND g2.subject_id = sub.id AND g2.quarter = 2 AND (p_sy_id IS NULL OR g2.school_year_id = p_sy_id)
  LEFT JOIN public.grades g3 ON g3.student_id = s.id AND g3.subject_id = sub.id AND g3.quarter = 3 AND (p_sy_id IS NULL OR g3.school_year_id = p_sy_id)
  LEFT JOIN public.grades g4 ON g4.student_id = s.id AND g4.subject_id = sub.id AND g4.quarter = 4 AND (p_sy_id IS NULL OR g4.school_year_id = p_sy_id)
  WHERE ta.teacher_id = p_teacher_id
  GROUP BY sec.id, sec.name, sec.grade_level, sub.id, sub.code, sub.title, sub.name
  ORDER BY sec.grade_level, sec.name, sub.title;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_faculty_grades_status(uuid, uuid) TO authenticated;
