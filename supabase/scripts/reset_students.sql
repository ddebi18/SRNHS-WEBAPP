-- =============================================================================
-- supabase/scripts/reset_students.sql
--
-- DESTRUCTIVE: Removes all students and student-related records.
-- PRESERVES: Admin accounts, teacher accounts, sections, faculty assignments.
-- NEVER deletes or touches auth.users or auth.identities.
--
-- BY DEFAULT THIS SCRIPT ROLLS BACK (DRY RUN).
-- To apply changes: replace ROLLBACK with COMMIT at the very bottom.
-- =============================================================================

BEGIN;

-- ── 1. Safety Guard: Abort if no active admin account exists ─────────────────
DO $$
DECLARE
  v_admin_count int;
BEGIN
  SELECT COUNT(*) INTO v_admin_count
  FROM public.staff_profiles sp
  JOIN auth.users au ON au.id = sp.id
  WHERE sp.role = 'admin' 
    AND sp.is_active = true 
    AND au.encrypted_password IS NOT NULL;

  IF v_admin_count < 1 THEN
    RAISE EXCEPTION 'SAFETY ABORT: No active admin account with verified credentials found. Refusing to run.';
  END IF;

  RAISE NOTICE 'Admin verification verified: % active admin(s) confirmed.', v_admin_count;
END;
$$;

-- ── 2. Display Accounts Being Preserved ───────────────────────────────────────
SELECT
  'PRESERVED' AS status,
  role,
  LEFT(email, 2) || '***@' || SPLIT_PART(email, '@', 2) AS masked_email,
  full_name,
  id
FROM public.staff_profiles
ORDER BY role, full_name;

-- ── 3. Execute Deletions (Respecting Foreign Key Dependency Order) ─────────────
DELETE FROM public.classroom_attendance;
DELETE FROM public.sms_notifications;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_guardians') THEN
    DELETE FROM public.student_guardians;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_violations') THEN
    DELETE FROM public.student_violations;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'access_grant_events') THEN
    DELETE FROM public.access_grant_events;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_access_grant_claims') THEN
    DELETE FROM public.student_access_grant_claims;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_access_grants') THEN
    DELETE FROM public.student_access_grants;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gate_logs') THEN
    DELETE FROM public.gate_logs;
  END IF;
END;
$$;

DELETE FROM public.recognition_events;
DELETE FROM public.students;

-- ── 4. Post-Deletion Verification: Check Student Data is Zero ─────────────────
SELECT 'AFTER: students (must be 0)' AS metric, COUNT(*) AS count FROM public.students
UNION ALL
SELECT 'AFTER: classroom_attendance (must be 0)', COUNT(*) FROM public.classroom_attendance
UNION ALL
SELECT 'AFTER: sms_notifications (must be 0)', COUNT(*) FROM public.sms_notifications
UNION ALL
SELECT 'AFTER: recognition_events (must be 0)', COUNT(*) FROM public.recognition_events;

-- ── 5. Final Safety Assertion Guard ──────────────────────────────────────────
DO $$
DECLARE
  v_admins int;
BEGIN
  SELECT COUNT(*) INTO v_admins
  FROM public.staff_profiles
  WHERE role = 'admin' AND is_active = true;

  IF v_admins < 1 THEN
    RAISE EXCEPTION 'FATAL: Deletion script removed or broke admin account. Rolling back.';
  END IF;
END;
$$;

-- ── 6. Transaction Termination ───────────────────────────────────────────────
-- DEFAULT IS ROLLBACK (DRY RUN).
-- Once you have reviewed the counts above, change ROLLBACK to COMMIT below.
ROLLBACK;
