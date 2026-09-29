-- =============================================================================
-- supabase/scripts/reset_teachers.sql
--
-- DESTRUCTIVE: Removes all teacher accounts (auth + profiles) except admins.
-- By default this script ROLLS BACK (dry run).
-- To commit: replace ROLLBACK with COMMIT at the bottom, then run manually.
--
-- NEVER run against production without a backup.
-- Run discovery first (Step 1) and review output before enabling COMMIT.
--
-- How to run (Supabase SQL Editor or psql):
--   1. Take a database backup via the Supabase dashboard first.
--   2. Paste into the SQL Editor (or: psql <connection_string> -f reset_teachers.sql)
--   3. Review the dry-run output (counts per table).
--   4. Replace ROLLBACK with COMMIT at the bottom when satisfied.
-- =============================================================================

BEGIN;

-- ── 0. Safety: abort if no admin account would remain ──────────────────────
DO $$
DECLARE
  admin_count int;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM public.staff_profiles
  WHERE role = 'admin' AND is_active = true;

  IF admin_count < 1 THEN
    RAISE EXCEPTION 'ABORT: No active admin accounts found. Refusing to continue.';
  END IF;

  RAISE NOTICE 'Admin accounts that will be PRESERVED (%): ', admin_count;
END;
$$;

-- ── 1. Show admins that will be preserved (masked email) ──────────────────
SELECT
  'PRESERVED (admin)' AS action,
  LEFT(email, 2) || '***@' || SPLIT_PART(email, '@', 2) AS masked_email,
  full_name,
  id
FROM public.staff_profiles
WHERE role = 'admin';

-- ── 2. Collect teacher IDs to delete ──────────────────────────────────────
-- (only staff_profiles rows with role = 'teacher')
CREATE TEMP TABLE _teachers_to_delete AS
SELECT sp.id, sp.email, sp.full_name
FROM public.staff_profiles sp
WHERE sp.role = 'teacher';

SELECT 'WILL DELETE (teacher)' AS action, COUNT(*) AS count FROM _teachers_to_delete;

-- ── 3. Dry-run: count rows that reference these teachers ───────────────────

-- classroom_attendance.marked_by (will SET NULL — column is nullable)
SELECT
  'classroom_attendance.marked_by → SET NULL' AS table_action,
  COUNT(*) AS rows_affected
FROM public.classroom_attendance
WHERE marked_by IN (SELECT id FROM _teachers_to_delete);

-- sections.adviser_id (will SET NULL)
SELECT
  'sections.adviser_id → SET NULL' AS table_action,
  COUNT(*) AS rows_affected
FROM public.sections
WHERE adviser_id IN (SELECT id FROM _teachers_to_delete);

-- recognition_events has no teacher FK — no action needed.

-- ── 4. ACTUAL DELETIONS (still inside transaction, rolled back by default) ──

-- 4a. Null-out classroom_attendance.marked_by for deleted teachers
UPDATE public.classroom_attendance
SET marked_by = NULL
WHERE marked_by IN (SELECT id FROM _teachers_to_delete);

-- 4b. Null-out sections.adviser_id
UPDATE public.sections
SET adviser_id = NULL, adviser_name = NULL
WHERE adviser_id IN (SELECT id FROM _teachers_to_delete);

-- 4c. Delete staff_profiles rows
DELETE FROM public.staff_profiles
WHERE id IN (SELECT id FROM _teachers_to_delete);

-- 4d. NOTE: Supabase auth.users rows CANNOT be deleted from SQL safely.
--     Use the Supabase Admin API or Dashboard to remove auth users.
--     List of auth user IDs to delete manually:
SELECT
  'DELETE VIA ADMIN API (auth.users)' AS action,
  id AS user_id,
  email
FROM _teachers_to_delete;

-- ── 5. Verify admin and student data are unchanged ────────────────────────
SELECT 'admins_remaining' AS check, COUNT(*) AS count FROM public.staff_profiles WHERE role = 'admin';
SELECT 'students_unchanged' AS check, COUNT(*) AS count FROM public.students;

-- ── 6. DEFAULT: ROLLBACK (dry run). Replace with COMMIT to apply. ──────────
ROLLBACK;
-- COMMIT;  -- ← Uncomment this line and comment ROLLBACK above when ready.
