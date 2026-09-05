-- ============================================================
-- Face Registration: Supabase Migration
-- Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Create the face_registrations table
create table if not exists face_registrations (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  section_id text not null,
  angle text not null check (angle in ('front', 'left', 'right')),
  storage_path text not null,
  registered_by uuid references auth.users(id),
  consent_confirmed boolean default false,
  created_at timestamptz default now()
);

-- Index for efficient lookups
create index if not exists idx_face_reg_student on face_registrations(student_id);
create index if not exists idx_face_reg_section on face_registrations(section_id);

-- 2. Enable Row Level Security
alter table face_registrations enable row level security;

-- Allow authenticated users (teachers/admins) to read all registrations
create policy "Teachers can read face registrations"
  on face_registrations for select
  to authenticated
  using (true);

-- Allow authenticated users to insert registrations
create policy "Teachers can insert face registrations"
  on face_registrations for insert
  to authenticated
  with check (true);

-- Allow authenticated users to delete (for re-registration)
create policy "Teachers can delete face registrations"
  on face_registrations for delete
  to authenticated
  using (true);

-- ============================================================
-- 3. Create Storage Bucket (run separately in SQL Editor)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('face-registrations', 'face-registrations', true)
on conflict (id) do nothing;

-- Allow authenticated uploads
create policy "Auth users can upload face images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'face-registrations');

-- Allow public read of face images
create policy "Public read face images"
  on storage.objects for select
  to public
  using (bucket_id = 'face-registrations');

-- Allow authenticated deletion (for re-registration)
create policy "Auth users can delete face images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'face-registrations');
