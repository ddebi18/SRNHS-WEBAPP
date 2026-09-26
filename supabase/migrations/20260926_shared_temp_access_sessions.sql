-- ====================================================================
-- San Roque National High School — Biometric Attendance & Portal System
-- Migration: 20260926_shared_temp_access_sessions.sql
-- Replaces single-use per-student QR codes with shared-session QR codes
-- ====================================================================

-- 1. Evolve student_access_grants for shared sessions
ALTER TABLE public.student_access_grants 
  ALTER COLUMN student_id DROP NOT NULL,
  ALTER COLUMN lrn DROP NOT NULL;

ALTER TABLE public.student_access_grants
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Add birth_date column to students table if not yet present
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- 3. Create student_access_grant_claims table
CREATE TABLE IF NOT EXISTS public.student_access_grant_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.student_access_grants(id) ON DELETE CASCADE,
  lrn VARCHAR(12) NOT NULL REFERENCES public.students(lrn) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  claim_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('pending', 'verified', 'completed', 'failed')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index to prevent duplicate active claims for the same LRN in the same session
CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_claims_unique_active 
  ON public.student_access_grant_claims(grant_id, lrn) 
  WHERE status != 'failed';

CREATE INDEX IF NOT EXISTS idx_grant_claims_grant_id 
  ON public.student_access_grant_claims(grant_id);

CREATE INDEX IF NOT EXISTS idx_grant_claims_claim_token 
  ON public.student_access_grant_claims(claim_token);

CREATE INDEX IF NOT EXISTS idx_grant_claims_lrn 
  ON public.student_access_grant_claims(lrn);

-- 4. Extend audit log table (access_grant_events)
ALTER TABLE public.access_grant_events
  ADD COLUMN IF NOT EXISTS lrn VARCHAR(12),
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_access_grant_events_outcome_rate 
  ON public.access_grant_events(ip_address, timestamp);

CREATE INDEX IF NOT EXISTS idx_access_grant_events_lrn_rate 
  ON public.access_grant_events(lrn, timestamp);

-- 5. Row-Level Security (RLS)
-- Anon has NO direct access. Staff (Admin & Teacher) can view and manage.
ALTER TABLE public.student_access_grant_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read access grants" ON public.student_access_grants;
CREATE POLICY "Staff can read access grants" ON public.student_access_grants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "Staff can insert access grants" ON public.student_access_grants;
CREATE POLICY "Staff can insert access grants" ON public.student_access_grants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "Staff can update access grants" ON public.student_access_grants;
CREATE POLICY "Staff can update access grants" ON public.student_access_grants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "Staff can view claims" ON public.student_access_grant_claims;
CREATE POLICY "Staff can view claims" ON public.student_access_grant_claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "Staff can manage claims" ON public.student_access_grant_claims;
CREATE POLICY "Staff can manage claims" ON public.student_access_grant_claims
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE id = auth.uid() AND is_active = true
    ) OR auth.role() = 'service_role'
  );

-- 6. Add student_access_grant_claims to Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_access_grant_claims;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 7. RPC: Create Shared Temp Access Session (Staff-facing)
CREATE OR REPLACE FUNCTION public.create_shared_temp_session(
  p_label TEXT DEFAULT NULL,
  p_purpose TEXT DEFAULT 'both',
  p_ttl_minutes INTEGER DEFAULT 240, -- 4 hours default
  p_max_uses INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_grant_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_ttl INT;
BEGIN
  IF p_purpose NOT IN ('face_registration', 'guardian_update', 'both') THEN
    RAISE EXCEPTION 'Invalid purpose. Must be face_registration, guardian_update, or both.';
  END IF;

  v_ttl := COALESCE(p_ttl_minutes, 240);
  IF v_ttl < 5 OR v_ttl > 10080 THEN -- 5 mins to 7 days
    v_ttl := 240;
  END IF;
  v_expires_at := NOW() + (v_ttl || ' minutes')::INTERVAL;

  -- 32 bytes crypto token in hex (64 chars)
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.student_access_grants (
    token,
    purpose,
    label,
    is_shared,
    max_uses,
    use_count,
    is_active,
    created_by,
    expires_at,
    status
  ) VALUES (
    v_token,
    p_purpose,
    COALESCE(TRIM(p_label), 'Student Registration Session'),
    true,
    p_max_uses,
    0,
    true,
    auth.uid(),
    v_expires_at,
    'pending'
  )
  RETURNING id INTO v_grant_id;

  INSERT INTO public.access_grant_events (grant_id, event_type, metadata)
  VALUES (
    v_grant_id,
    'created',
    jsonb_build_object(
      'is_shared', true,
      'label', p_label,
      'ttl_minutes', v_ttl,
      'max_uses', p_max_uses,
      'created_by', auth.uid()
    )
  );

  RETURN jsonb_build_object(
    'grant_id', v_grant_id,
    'token', v_token,
    'label', COALESCE(TRIM(p_label), 'Student Registration Session'),
    'purpose', p_purpose,
    'expires_at', v_expires_at,
    'max_uses', p_max_uses,
    'use_count', 0,
    'is_active', true
  );
END;
$$;

-- 8. RPC: Validate Temp Session (Public, Non-sensitive metadata)
CREATE OR REPLACE FUNCTION public.validate_temp_session(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant RECORD;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_token');
  END IF;

  SELECT * INTO v_grant
  FROM public.student_access_grants
  WHERE token = trim(p_token);

  IF v_grant.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF NOT v_grant.is_active OR v_grant.status = 'revoked' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'revoked');
  END IF;

  IF v_grant.expires_at <= NOW() OR v_grant.status = 'expired' THEN
    IF v_grant.status != 'expired' THEN
      UPDATE public.student_access_grants SET status = 'expired' WHERE id = v_grant.id;
    END IF;
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  IF v_grant.max_uses IS NOT NULL AND v_grant.use_count >= v_grant.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'max_uses_reached');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'grant_id', v_grant.id,
    'label', v_grant.label,
    'purpose', v_grant.purpose,
    'expires_at', v_grant.expires_at,
    'is_shared', v_grant.is_shared,
    'max_uses', v_grant.max_uses,
    'use_count', v_grant.use_count,
    'is_active', v_grant.is_active
  );
END;
$$;

-- 9. RPC: Claim Temp Session (Public, Verifier-gated, Rate-limited)
CREATE OR REPLACE FUNCTION public.claim_temp_session(
  p_token TEXT,
  p_lrn TEXT,
  p_verifier TEXT,
  p_client_ip TEXT DEFAULT NULL,
  p_client_ua TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant RECORD;
  v_student RECORD;
  v_guardian RECORD;
  v_claim_token TEXT;
  v_claim_id UUID;
  v_clean_lrn TEXT;
  v_clean_verifier TEXT;
  v_recent_attempts INTEGER;
  c_generic_error CONSTANT TEXT := 'We couldn''t verify your details — check your LRN or ask a staff member for help.';
BEGIN
  v_clean_lrn := trim(COALESCE(p_lrn, ''));
  v_clean_verifier := trim(COALESCE(p_verifier, ''));

  -- 1. Validate session token
  SELECT * INTO v_grant
  FROM public.student_access_grants
  WHERE token = trim(COALESCE(p_token, ''))
  FOR UPDATE;

  IF v_grant.id IS NULL OR NOT v_grant.is_active OR v_grant.status = 'revoked' OR v_grant.expires_at <= NOW() THEN
    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
    VALUES (v_grant.id, v_clean_lrn, 'expired_or_invalid', p_client_ip, p_client_ua, jsonb_build_object('timestamp', NOW()));
    RAISE EXCEPTION '%', c_generic_error;
  END IF;

  IF v_grant.max_uses IS NOT NULL AND v_grant.use_count >= v_grant.max_uses THEN
    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
    VALUES (v_grant.id, v_clean_lrn, 'max_uses_reached', p_client_ip, p_client_ua, jsonb_build_object('timestamp', NOW()));
    RAISE EXCEPTION '%', c_generic_error;
  END IF;

  -- 2. Rate limit check (5 attempts per 10 minutes per IP or LRN)
  SELECT COUNT(*) INTO v_recent_attempts
  FROM public.access_grant_events
  WHERE timestamp > (NOW() - interval '10 minutes')
    AND (
      (p_client_ip IS NOT NULL AND ip_address = p_client_ip)
      OR (v_clean_lrn <> '' AND lrn = v_clean_lrn)
    )
    AND outcome IN ('lrn_not_found', 'verifier_mismatch', 'already_claimed', 'rate_limited');

  IF v_recent_attempts >= 5 THEN
    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
    VALUES (v_grant.id, v_clean_lrn, 'rate_limited', p_client_ip, p_client_ua, jsonb_build_object('attempts', v_recent_attempts));
    RAISE EXCEPTION '%', c_generic_error;
  END IF;

  -- 3. Check LRN format
  IF NOT (v_clean_lrn ~ '^\d{12}$') THEN
    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
    VALUES (v_grant.id, v_clean_lrn, 'invalid_lrn_format', p_client_ip, p_client_ua, NULL);
    RAISE EXCEPTION '%', c_generic_error;
  END IF;

  -- 4. Lookup student
  SELECT s.id, s.lrn, s.first_name, s.last_name, s.gender, s.grade_level, s.birth_date, sec.name AS section_name, s.photo_urls, s.face_descriptors
  INTO v_student
  FROM public.students s
  LEFT JOIN public.sections sec ON sec.id = s.section_id
  WHERE s.lrn = v_clean_lrn;

  IF v_student.id IS NULL THEN
    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
    VALUES (v_grant.id, v_clean_lrn, 'lrn_not_found', p_client_ip, p_client_ua, NULL);
    RAISE EXCEPTION '%', c_generic_error;
  END IF;

  -- 5. Secondary Verifier Check:
  -- Checks Date of Birth (YYYY-MM-DD or MM/DD/YYYY) OR student's Last Name (case-insensitive)
  IF v_clean_verifier = '' THEN
    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
    VALUES (v_grant.id, v_clean_lrn, 'verifier_missing', p_client_ip, p_client_ua, NULL);
    RAISE EXCEPTION '%', c_generic_error;
  END IF;

  IF NOT (
    (v_student.birth_date IS NOT NULL AND (
      to_char(v_student.birth_date, 'YYYY-MM-DD') = v_clean_verifier
      OR to_char(v_student.birth_date, 'MM/DD/YYYY') = v_clean_verifier
      OR to_char(v_student.birth_date, 'YYYY/MM/DD') = v_clean_verifier
    ))
    OR (LOWER(v_clean_verifier) = LOWER(v_student.last_name))
  ) THEN
    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
    VALUES (v_grant.id, v_clean_lrn, 'verifier_mismatch', p_client_ip, p_client_ua, NULL);
    RAISE EXCEPTION '%', c_generic_error;
  END IF;

  -- 6. Check existing completed/verified claim for this session
  IF EXISTS (
    SELECT 1 FROM public.student_access_grant_claims
    WHERE grant_id = v_grant.id
      AND lrn = v_clean_lrn
      AND status IN ('verified', 'completed')
  ) THEN
    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
    VALUES (v_grant.id, v_clean_lrn, 'already_claimed', p_client_ip, p_client_ua, NULL);
    RAISE EXCEPTION '%', c_generic_error;
  END IF;

  -- 7. Generate single-purpose short-lived claim token
  v_claim_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.student_access_grant_claims (
    grant_id,
    lrn,
    student_id,
    claim_token,
    status,
    ip_address,
    user_agent
  ) VALUES (
    v_grant.id,
    v_student.lrn,
    v_student.id,
    v_claim_token,
    'verified',
    p_client_ip,
    p_client_ua
  )
  RETURNING id INTO v_claim_id;

  -- Increment session use_count
  UPDATE public.student_access_grants
  SET use_count = use_count + 1
  WHERE id = v_grant.id;

  -- Audit log success
  INSERT INTO public.access_grant_events (grant_id, lrn, outcome, ip_address, user_agent, metadata)
  VALUES (
    v_grant.id,
    v_clean_lrn,
    'success',
    p_client_ip,
    p_client_ua,
    jsonb_build_object('claim_id', v_claim_id, 'claim_token', v_claim_token)
  );

  -- Fetch primary guardian if exists
  SELECT name, relationship, phone_number
  INTO v_guardian
  FROM public.student_guardians
  WHERE student_id = v_student.id AND is_primary = true
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'claim_token', v_claim_token,
    'grant_id', v_grant.id,
    'purpose', v_grant.purpose,
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
    ) ELSE NULL END,
    'has_existing_face', (v_student.face_descriptors IS NOT NULL AND jsonb_array_length(v_student.face_descriptors) > 0)
  );
END;
$$;

-- 10. RPC: Complete Temp Claim (Public, Scoped to Claim Token)
CREATE OR REPLACE FUNCTION public.complete_temp_claim(
  p_claim_token TEXT,
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
  v_claim RECORD;
  v_grant RECORD;
BEGIN
  IF p_claim_token IS NULL OR length(trim(p_claim_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid claim token.';
  END IF;

  SELECT * INTO v_claim
  FROM public.student_access_grant_claims
  WHERE claim_token = trim(p_claim_token)
  FOR UPDATE;

  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION 'Claim session not found.';
  END IF;

  IF v_claim.status = 'completed' THEN
    RAISE EXCEPTION 'This claim has already been completed.';
  END IF;

  SELECT * INTO v_grant
  FROM public.student_access_grants
  WHERE id = v_claim.grant_id;

  -- 1. Update biometric descriptors if provided
  IF p_face_descriptors IS NOT NULL THEN
    UPDATE public.students
    SET
      face_descriptors = p_face_descriptors,
      face_descriptor_version = 1,
      parent_consent = true,
      consent_date = COALESCE(consent_date, CURRENT_DATE),
      photo_urls = CASE
        WHEN p_captured_photo_url IS NOT NULL AND length(p_captured_photo_url) > 0
        THEN array_prepend(p_captured_photo_url, photo_urls)
        ELSE photo_urls
      END,
      updated_at = NOW()
    WHERE id = v_claim.student_id;

    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, metadata)
    VALUES (v_claim.grant_id, v_claim.lrn, 'face_captured', jsonb_build_object('descriptors_count', jsonb_array_length(p_face_descriptors)));
  END IF;

  -- 2. Update guardian details if provided
  IF p_guardian_name IS NOT NULL AND length(trim(p_guardian_name)) > 0 THEN
    IF EXISTS (SELECT 1 FROM public.student_guardians WHERE student_id = v_claim.student_id AND is_primary = true) THEN
      UPDATE public.student_guardians
      SET
        name = trim(p_guardian_name),
        relationship = trim(COALESCE(p_guardian_relationship, 'Parent/Guardian')),
        phone_number = trim(p_guardian_phone)
      WHERE student_id = v_claim.student_id AND is_primary = true;
    ELSE
      INSERT INTO public.student_guardians (
        student_id,
        name,
        relationship,
        phone_number,
        is_primary
      ) VALUES (
        v_claim.student_id,
        trim(p_guardian_name),
        trim(COALESCE(p_guardian_relationship, 'Parent/Guardian')),
        trim(p_guardian_phone),
        true
      );
    END IF;

    INSERT INTO public.access_grant_events (grant_id, lrn, outcome, metadata)
    VALUES (v_claim.grant_id, v_claim.lrn, 'guardian_updated', jsonb_build_object('guardian_name', p_guardian_name, 'phone', p_guardian_phone));
  END IF;

  -- 3. Finalize claim
  UPDATE public.student_access_grant_claims
  SET
    status = 'completed',
    completed_at = NOW()
  WHERE id = v_claim.id;

  INSERT INTO public.access_grant_events (grant_id, lrn, outcome, metadata)
  VALUES (v_claim.grant_id, v_claim.lrn, 'completed', jsonb_build_object('claim_id', v_claim.id, 'completed_at', NOW()));

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim.id,
    'status', 'completed',
    'student_id', v_claim.student_id
  );
END;
$$;
