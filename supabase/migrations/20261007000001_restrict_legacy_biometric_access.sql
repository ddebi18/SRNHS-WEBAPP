-- Restrict access to the legacy face-registration table and image bucket.
-- The active client registration flow stores photos/descriptors on students
-- and does not use this bucket.

ALTER TABLE public.face_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can read face registrations" ON public.face_registrations;
DROP POLICY IF EXISTS "Teachers can insert face registrations" ON public.face_registrations;
DROP POLICY IF EXISTS "Teachers can delete face registrations" ON public.face_registrations;

DROP POLICY IF EXISTS "Admins and advisers can read face registrations" ON public.face_registrations;
CREATE POLICY "Admins and advisers can read face registrations"
  ON public.face_registrations
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.students AS s
      WHERE s.id::text = face_registrations.student_id
        AND s.section_id::text = face_registrations.section_id
        AND public.is_adviser_of_section(s.section_id)
    )
  );

DROP POLICY IF EXISTS "Admins and advisers can insert face registrations" ON public.face_registrations;
CREATE POLICY "Admins and advisers can insert face registrations"
  ON public.face_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    consent_confirmed IS TRUE
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.students AS s
        WHERE s.id::text = face_registrations.student_id
          AND s.section_id::text = face_registrations.section_id
          AND s.parent_consent IS TRUE
          AND public.is_adviser_of_section(s.section_id)
      )
    )
  );

DROP POLICY IF EXISTS "Admins and advisers can delete face registrations" ON public.face_registrations;
CREATE POLICY "Admins and advisers can delete face registrations"
  ON public.face_registrations
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.students AS s
      WHERE s.id::text = face_registrations.student_id
        AND s.section_id::text = face_registrations.section_id
        AND public.is_adviser_of_section(s.section_id)
    )
  );

-- This legacy bucket is not used by the active application. Keep existing
-- objects, but stop anonymous reads and restrict authenticated access.
INSERT INTO storage.buckets (id, name, public)
VALUES ('face-registrations', 'face-registrations', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public = false
WHERE id = 'face-registrations';

DROP POLICY IF EXISTS "Auth users can upload face images" ON storage.objects;
DROP POLICY IF EXISTS "Public read face images" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete face images" ON storage.objects;

DROP POLICY IF EXISTS "Admins can read legacy face images" ON storage.objects;
CREATE POLICY "Admins can read legacy face images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'face-registrations' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can upload legacy face images" ON storage.objects;
CREATE POLICY "Admins can upload legacy face images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'face-registrations' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete legacy face images" ON storage.objects;
CREATE POLICY "Admins can delete legacy face images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'face-registrations' AND public.is_admin());
