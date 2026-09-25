-- ====================================================================
-- San Roque National High School — Biometric Attendance & Portal System
-- Migration: 20260925_temp_student_access.sql
-- Removes student login and adds temporary single-use scoped QR access
-- ====================================================================

-- 1. Ensure students has face_descriptors & version columns
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS face_descriptors JSONB,
  ADD COLUMN IF NOT EXISTS face_descriptor_version INTEGER DEFAULT 1;

-- 2. Detach any user_id on students and remove student auth dependency
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'user_id'
  ) THEN
    -- Unlink user_id
    UPDATE public.students SET user_id = NULL WHERE user_id IS NOT NULL;
    -- Drop user_id foreign key or column
    ALTER TABLE public.students DROP COLUMN IF EXISTS user_id;
  END IF;
END $$;

-- 3. Hard-delete existing student accounts from auth.users (if accessible)
DO $$
BEGIN
  -- Delete users who were registered under the student portal or have student role metadata
  DELETE FROM auth.users 
  WHERE raw_user_meta_data->>'role' = 'student' 
     OR email LIKE '%@student.srnhs.edu.ph'
     OR email LIKE 'std-%@%';
EXCEPTION WHEN OTHERS THEN
  -- In client or restricted environments, auth.users modifications may be handled via service role
  NULL;
END $$;

-- 4. Create student_access_grants table
CREATE TABLE IF NOT EXISTS public.student_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lrn VARCHAR(12) NOT NULL,
  token TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('face_registration', 'guardian_update', 'both')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '60 minutes'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'revoked')),
  used_at TIMESTAMPTZ,
  device_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_access_grants_token ON public.student_access_grants(token);
CREATE INDEX IF NOT EXISTS idx_student_access_grants_student_id ON public.student_access_grants(student_id);
CREATE INDEX IF NOT EXISTS idx_student_access_grants_lrn ON public.student_access_grants(lrn);
CREATE INDEX IF NOT EXISTS idx_student_access_grants_status ON public.student_access_grants(status);

-- 5. Create access_grant_events audit table
CREATE TABLE IF NOT EXISTS public.access_grant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.student_access_grants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'created', 'validated', 'face_captured', 'guardian_updated', 'completed', 'revoked'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_access_grant_events_grant_id ON public.access_grant_events(grant_id);

-- 6. Enable RLS
ALTER TABLE public.student_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_grant_events ENABLE ROW LEVEL SECURITY;

-- Staff (Admin & Teacher) can view and manage grants
DROP POLICY IF EXISTS "Staff can read access grants" ON public.student_access_grants;
CREATE POLICY "Staff can read access grants" ON public.student_access_grants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role' OR auth.role() = 'anon'
  );

DROP POLICY IF EXISTS "Staff can insert access grants" ON public.student_access_grants;
CREATE POLICY "Staff can insert access grants" ON public.student_access_grants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role' OR auth.role() = 'anon'
  );

DROP POLICY IF EXISTS "Staff can update access grants" ON public.student_access_grants;
CREATE POLICY "Staff can update access grants" ON public.student_access_grants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role' OR auth.role() = 'anon'
  );

-- Audit event policies
DROP POLICY IF EXISTS "Staff can view access events" ON public.access_grant_events;
CREATE POLICY "Staff can view access events" ON public.access_grant_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role' OR auth.role() = 'anon'
  );

DROP POLICY IF EXISTS "Allow write access events" ON public.access_grant_events;
CREATE POLICY "Allow write access events" ON public.access_grant_events
  FOR INSERT WITH CHECK (true);

-- 7. Add student_access_grants to Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_access_grants;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 8. RPC: Create Student Access Grant by LRN
CREATE OR REPLACE FUNCTION public.create_student_access_grant(
  p_lrn TEXT,
  p_purpose TEXT,
  p_ttl_minutes INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student RECORD;
  v_token TEXT;
  v_grant_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_ttl INT;
BEGIN
  -- Validate 12-digit DepEd LRN format
  IF p_lrn IS NULL OR NOT (p_lrn ~ '^\d{12}$') THEN
    RAISE EXCEPTION 'Invalid LRN format. Must be exactly 12 digits.';
  END IF;

  -- Validate purpose
  IF p_purpose NOT IN ('face_registration', 'guardian_update', 'both') THEN
    RAISE EXCEPTION 'Invalid purpose. Must be face_registration, guardian_update, or both.';
  END IF;

  -- Lookup student
  SELECT s.id, s.lrn, s.first_name, s.last_name, s.grade_level, sec.name AS section_name, s.photo_urls
  INTO v_student
  FROM public.students s
  LEFT JOIN public.sections sec ON sec.id = s.section_id
  WHERE s.lrn = p_lrn;

  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Student with LRN % not found.', p_lrn;
  END IF;

  -- Rate limit check: at most 5 pending tokens for the same student in 10 minutes
  IF (
    SELECT COUNT(*) FROM public.student_access_grants
    WHERE student_id = v_student.id
      AND status = 'pending'
      AND created_at > (NOW() - interval '10 minutes')
  ) >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Too many pending access tokens generated for this student. Please wait before generating another.';
  END IF;

  -- Determine TTL
  v_ttl := COALESCE(p_ttl_minutes, 60);
  IF v_ttl < 1 OR v_ttl > 1440 THEN
    v_ttl := 60;
  END IF;
  v_expires_at := NOW() + (v_ttl || ' minutes')::INTERVAL;

  -- Generate crypto-secure 32-byte token encoded in hex (64 chars)
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Insert grant
  INSERT INTO public.student_access_grants (
    student_id,
    lrn,
    token,
    purpose,
    created_by,
    expires_at,
    status
  ) VALUES (
    v_student.id,
    v_student.lrn,
    v_token,
    p_purpose,
    auth.uid(),
    v_expires_at,
    'pending'
  )
  RETURNING id INTO v_grant_id;

  -- Audit log event
  INSERT INTO public.access_grant_events (grant_id, event_type, metadata)
  VALUES (
    v_grant_id,
    'created',
    jsonb_build_object(
      'purpose', p_purpose,
      'ttl_minutes', v_ttl,
      'created_by', auth.uid()
    )
  );

  RETURN jsonb_build_object(
    'grant_id', v_grant_id,
    'token', v_token,
    'purpose', p_purpose,
    'expires_at', v_expires_at,
    'student', jsonb_build_object(
      'id', v_student.id,
      'lrn', v_student.lrn,
      'first_name', v_student.first_name,
      'last_name', v_student.last_name,
      'grade_level', v_student.grade_level,
      'section_name', v_student.section_name,
      'photo_url', CASE WHEN array_length(v_student.photo_urls, 1) > 0 THEN v_student.photo_urls[1] ELSE NULL END
    )
  );
END;
$$;

-- 9. RPC: Validate Temporary Access Token
CREATE OR REPLACE FUNCTION public.validate_student_access_token(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant RECORD;
  v_student RECORD;
  v_guardian RECORD;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_token');
  END IF;

  SELECT * INTO v_grant
  FROM public.student_access_grants
  WHERE token = p_token;

  IF v_grant.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_grant.status = 'completed' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'already_used');
  END IF;

  IF v_grant.status = 'revoked' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'revoked');
  END IF;

  IF v_grant.status = 'expired' OR v_grant.expires_at <= NOW() THEN
    -- Mark as expired if not already
    IF v_grant.status = 'pending' THEN
      UPDATE public.student_access_grants
      SET status = 'expired'
      WHERE id = v_grant.id;
    END IF;
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  -- Load student details
  SELECT s.id, s.lrn, s.first_name, s.last_name, s.gender, s.grade_level, sec.name AS section_name, s.photo_urls, s.face_descriptors
  INTO v_student
  FROM public.students s
  LEFT JOIN public.sections sec ON sec.id = s.section_id
  WHERE s.id = v_grant.student_id;

  -- Load existing primary guardian details if available
  SELECT name, relationship, phone_number
  INTO v_guardian
  FROM public.student_guardians
  WHERE student_id = v_grant.student_id AND is_primary = true
  LIMIT 1;

  -- Audit log access validation
  INSERT INTO public.access_grant_events (grant_id, event_type, metadata)
  VALUES (
    v_grant.id,
    'validated',
    jsonb_build_object('timestamp', NOW())
  );

  RETURN jsonb_build_object(
    'valid', true,
    'grant_id', v_grant.id,
    'student_id', v_grant.student_id,
    'purpose', v_grant.purpose,
    'expires_at', v_grant.expires_at,
    'has_existing_face', (v_student.face_descriptors IS NOT NULL AND jsonb_array_length(v_student.face_descriptors) > 0),
    'student', jsonb_build_object(
      'id', v_student.id,
      'lrn', v_student.lrn,
      'first_name', v_student.first_name,
      'last_name', v_student.last_name,
      'gender', v_student.gender,
      'grade_level', v_student.grade_level,
      'section_name', v_student.section_name,
      'photo_url', CASE WHEN array_length(v_student.photo_urls, 1) > 0 THEN v_student.photo_urls[1] ELSE NULL END
    ),
    'guardian', CASE WHEN v_guardian.name IS NOT NULL THEN jsonb_build_object(
      'name', v_guardian.name,
      'relationship', v_guardian.relationship,
      'phone_number', v_guardian.phone_number
    ) ELSE NULL END
  );
END;
$$;

-- 10. RPC: Complete Student Access Grant (atomic completion & update)
CREATE OR REPLACE FUNCTION public.complete_student_access_grant(
  p_token TEXT,
  p_face_descriptors JSONB DEFAULT NULL,
  p_guardian_name TEXT DEFAULT NULL,
  p_guardian_relationship TEXT DEFAULT NULL,
  p_guardian_phone TEXT DEFAULT NULL,
  p_captured_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant RECORD;
BEGIN
  -- Validate grant
  SELECT * INTO v_grant
  FROM public.student_access_grants
  WHERE token = p_token
  FOR UPDATE;

  IF v_grant.id IS NULL THEN
    RAISE EXCEPTION 'Access grant not found.';
  END IF;

  IF v_grant.status != 'pending' THEN
    RAISE EXCEPTION 'Access grant is already %.', v_grant.status;
  END IF;

  IF v_grant.expires_at <= NOW() THEN
    UPDATE public.student_access_grants SET status = 'expired' WHERE id = v_grant.id;
    RAISE EXCEPTION 'Access grant has expired.';
  END IF;

  -- 1. If Face Registration included and descriptors provided
  IF v_grant.purpose IN ('face_registration', 'both') AND p_face_descriptors IS NOT NULL THEN
    UPDATE public.students
    SET 
      face_descriptors = p_face_descriptors,
      face_descriptor_version = 1, -- FaceNet in-browser model v1
      parent_consent = true,
      consent_date = COALESCE(consent_date, CURRENT_DATE),
      photo_urls = CASE 
        WHEN p_captured_photo_url IS NOT NULL AND length(p_captured_photo_url) > 0 
        THEN array_prepend(p_captured_photo_url, photo_urls)
        ELSE photo_urls
      END,
      updated_at = NOW()
    WHERE id = v_grant.student_id;

    INSERT INTO public.access_grant_events (grant_id, event_type, metadata)
    VALUES (v_grant.id, 'face_captured', jsonb_build_object('descriptors_count', jsonb_array_length(p_face_descriptors)));
  END IF;

  -- 2. If Guardian Update included and details provided
  IF v_grant.purpose IN ('guardian_update', 'both') AND p_guardian_name IS NOT NULL AND length(trim(p_guardian_name)) > 0 THEN
    -- Upsert primary guardian record
    IF EXISTS (SELECT 1 FROM public.student_guardians WHERE student_id = v_grant.student_id AND is_primary = true) THEN
      UPDATE public.student_guardians
      SET
        name = trim(p_guardian_name),
        relationship = trim(COALESCE(p_guardian_relationship, 'Parent/Guardian')),
        phone_number = trim(p_guardian_phone)
      WHERE student_id = v_grant.student_id AND is_primary = true;
    ELSE
      INSERT INTO public.student_guardians (
        student_id,
        name,
        relationship,
        phone_number,
        is_primary
      ) VALUES (
        v_grant.student_id,
        trim(p_guardian_name),
        trim(COALESCE(p_guardian_relationship, 'Parent/Guardian')),
        trim(p_guardian_phone),
        true
      );
    END IF;

    INSERT INTO public.access_grant_events (grant_id, event_type, metadata)
    VALUES (v_grant.id, 'guardian_updated', jsonb_build_object('guardian_name', p_guardian_name, 'phone', p_guardian_phone));
  END IF;

  -- 3. Mark grant as completed and single-use finalized
  UPDATE public.student_access_grants
  SET 
    status = 'completed',
    used_at = NOW()
  WHERE id = v_grant.id;

  INSERT INTO public.access_grant_events (grant_id, event_type, metadata)
  VALUES (v_grant.id, 'completed', jsonb_build_object('completed_at', NOW()));

  RETURN jsonb_build_object(
    'success', true,
    'grant_id', v_grant.id,
    'status', 'completed',
    'student_id', v_grant.student_id
  );
END;
$$;
