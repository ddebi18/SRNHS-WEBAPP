-- =============================================================================
-- supabase/scripts/reset_students.sql
--
-- DESTRUCTIVE: Removes all students and student-related records.
-- PRESERVES: Admin accounts, teacher accounts, sections, subjects, rooms,
--            faculty assignments, and site configuration.
--
-- BY DEFAULT THIS SCRIPT ROLLS BACK (DRY RUN).
-- To apply changes: replace ROLLBACK with COMMIT at the very bottom.
--
-- TARGET PROJECT: nhbeargdlzcaljndqpzp
--
-- SAFETY INSTRUCTIONS:
--   1. Take a full database backup via Supabase Dashboard before running.
--   2. Paste and run this script in Supabase SQL Editor.
--   3. Inspect the row counts before and after in the results tab.
--   4. Only change ROLLBACK to COMMIT once verified.
-- =============================================================================

BEGIN;

-- ── 0. Safety Guard: Abort if no active admin account exists ─────────────────
DO $$
DECLARE
  admin_count int;
  teacher_count int;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM public.staff_profiles
  WHERE role = 'admin' AND is_active = true;

  IF admin_count < 1 THEN
    RAISE EXCEPTION 'ABORT: No active admin accounts found in staff_profiles. Refusing to continue.';
  END IF;

  SELECT COUNT(*) INTO teacher_count
  FROM public.staff_profiles
  WHERE role = 'teacher' AND is_active = true;

  RAISE NOTICE 'Preserved Staff: % Admin(s), % Teacher(s)', admin_count, teacher_count;
END;
$$;

-- ── 1. Display Preserved Accounts (Masked for privacy) ────────────────────────
SELECT
  'PRESERVED' AS status,
  role,
  LEFT(email, 2) || '***@' || SPLIT_PART(email, '@', 2) AS masked_email,
  full_name,
  id
FROM public.staff_profiles
ORDER BY role, full_name;

-- ── 2. Pre-Deletion Diagnostic Counts ─────────────────────────────────────────
SELECT 'BEFORE: students' AS metric, COUNT(*) AS count FROM public.students
UNION ALL
SELECT 'BEFORE: classroom_attendance', COUNT(*) FROM public.classroom_attendance
UNION ALL
SELECT 'BEFORE: sms_notifications', COUNT(*) FROM public.sms_notifications
UNION ALL
SELECT 'BEFORE: recognition_events (all)', COUNT(*) FROM public.recognition_events;

-- Check optional / related tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_guardians') THEN
    RAISE NOTICE 'student_guardians count: %', (SELECT COUNT(*) FROM public.student_guardians);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_violations') THEN
    RAISE NOTICE 'student_violations count: %', (SELECT COUNT(*) FROM public.student_violations);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_access_grants') THEN
    RAISE NOTICE 'student_access_grants count: %', (SELECT COUNT(*) FROM public.student_access_grants);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gate_logs') THEN
    RAISE NOTICE 'gate_logs count: %', (SELECT COUNT(*) FROM public.gate_logs);
  END IF;
END;
$$;

-- ── 3. Execute Deletions (Respecting Foreign Key Dependency Order) ─────────────

-- 3a. Delete classroom roll-call records
DELETE FROM public.classroom_attendance;

-- 3b. Delete SMS notification logs
DELETE FROM public.sms_notifications;

-- 3c. Delete student guardians if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_guardians') THEN
    DELETE FROM public.student_guardians;
  END IF;
END;
$$;

-- 3d. Delete student violations if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_violations') THEN
    DELETE FROM public.student_violations;
  END IF;
END;
$$;

-- 3e. Delete access grant events, claims, and grants if tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'access_grant_events') THEN
    DELETE FROM public.access_grant_events;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_access_grant_claims') THEN
    DELETE FROM public.student_access_grant_claims;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_access_grants') THEN
    DELETE FROM public.student_access_grants;
  END IF;
END;
$$;

-- 3f. Delete gate recognition events (Option A: clear all gate test scans)
DELETE FROM public.recognition_events;

-- 3g. Delete gate logs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gate_logs') THEN
    DELETE FROM public.gate_logs;
  END IF;
END;
$$;

-- 3h. Delete all students
DELETE FROM public.students;

-- ── 4. Post-Deletion Verification: Check Student Data is Zero ─────────────────
SELECT 'AFTER: students (must be 0)' AS metric, COUNT(*) AS count FROM public.students
UNION ALL
SELECT 'AFTER: classroom_attendance (must be 0)', COUNT(*) FROM public.classroom_attendance
UNION ALL
SELECT 'AFTER: sms_notifications (must be 0)', COUNT(*) FROM public.sms_notifications
UNION ALL
SELECT 'AFTER: recognition_events (must be 0)', COUNT(*) FROM public.recognition_events;

-- ── 5. Verify Preserved Structural Entities are Completely Unchanged ──────────
SELECT 'PRESERVED: staff_profiles (admin)' AS entity, COUNT(*) AS count FROM public.staff_profiles WHERE role = 'admin'
UNION ALL
SELECT 'PRESERVED: staff_profiles (teacher)', COUNT(*) FROM public.staff_profiles WHERE role = 'teacher'
UNION ALL
SELECT 'PRESERVED: sections', COUNT(*) FROM public.sections;

-- ── 6. Transaction Termination ───────────────────────────────────────────────
-- DEFAULT IS ROLLBACK (DRY RUN).
-- Once you have reviewed the counts above, change ROLLBACK to COMMIT below.
ROLLBACK;
