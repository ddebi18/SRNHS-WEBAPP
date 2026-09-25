-- Store the same FaceNet/SFace descriptors used by browser and edge recognition.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS face_descriptors JSONB,
  ADD COLUMN IF NOT EXISTS face_descriptor_version INTEGER;