-- ====================================================================
-- San Roque National High School — Student Attendance Monitoring System
-- Database Schema DDL & Row Level Security (RLS) Policies
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUM Types
CREATE TYPE user_role AS ENUM ('admin', 'teacher');
CREATE TYPE event_type AS ENUM ('entry', 'exit', 'classroom_checkin');
CREATE TYPE event_source AS ENUM ('camera', 'manual_override');
CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent', 'excused');
CREATE TYPE sms_status AS ENUM ('queued', 'sent', 'failed');
CREATE TYPE violation_severity AS ENUM ('minor', 'moderate', 'severe');

-- 3. Staff Profiles Table (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'teacher',
  department TEXT DEFAULT 'Faculty',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Academic Rooms
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  building TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Academic Subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Academic Sections
CREATE TABLE IF NOT EXISTS public.sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_level INT NOT NULL CHECK (grade_level BETWEEN 7 AND 12),
  name TEXT NOT NULL,
  adviser_id UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(grade_level, name)
);

-- 7. Teacher Assignments & Schedules
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  schedule_day TEXT NOT NULL, -- e.g. "Monday, Wednesday, Friday"
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Students Table
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lrn VARCHAR(12) NOT NULL UNIQUE, -- Learner Reference Number (12 digits)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  grade_level INT NOT NULL,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE RESTRICT,
  parent_consent BOOLEAN NOT NULL DEFAULT false,
  consent_date DATE,
  photo_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Student Guardians (1:N relationship)
CREATE TABLE IF NOT EXISTS public.student_guardians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL, -- e.g., "Mother", "Father", "Legal Guardian"
  phone_number TEXT NOT NULL, -- e.g., "+639171234567"
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Facial Recognition Events Table
CREATE TABLE IF NOT EXISTS public.recognition_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type event_type NOT NULL,
  camera_id TEXT,
  gate_id TEXT,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  confidence_score NUMERIC(5,4) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  source event_source NOT NULL DEFAULT 'camera',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Classroom Attendance Records
CREATE TABLE IF NOT EXISTS public.classroom_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status attendance_status NOT NULL DEFAULT 'absent',
  marked_by UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(section_id, subject_id, student_id, date)
);

-- 12. Student Violations Log
CREATE TABLE IF NOT EXISTS public.student_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.staff_profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity violation_severity NOT NULL DEFAULT 'minor',
  incident_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. SMS Notifications Log
CREATE TABLE IF NOT EXISTS public.sms_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  guardian_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'gate_entry' | 'gate_exit' | 'unexcused_absence'
  status sms_status NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recognition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_notifications ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_assigned_teacher(target_section_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.teacher_assignments
    WHERE teacher_id = auth.uid() AND section_id = target_section_id
  ) OR EXISTS (
    SELECT 1 FROM public.sections
    WHERE id = target_section_id AND adviser_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Staff Profiles Policies
CREATE POLICY "Admins full access to staff profiles" ON public.staff_profiles
  FOR ALL USING (is_admin());
CREATE POLICY "Staff can view their own profile" ON public.staff_profiles
  FOR SELECT USING (auth.uid() = id);

-- 2. Master Academics (Rooms, Subjects, Sections)
CREATE POLICY "Admins full access to rooms" ON public.rooms FOR ALL USING (is_admin());
CREATE POLICY "Staff read access to rooms" ON public.rooms FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins full access to subjects" ON public.subjects FOR ALL USING (is_admin());
CREATE POLICY "Staff read access to subjects" ON public.subjects FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins full access to sections" ON public.sections FOR ALL USING (is_admin());
CREATE POLICY "Staff read access to sections" ON public.sections FOR SELECT USING (auth.role() = 'authenticated');

-- 3. Teacher Assignments
CREATE POLICY "Admins full access to teacher_assignments" ON public.teacher_assignments FOR ALL USING (is_admin());
CREATE POLICY "Teachers read own assignments" ON public.teacher_assignments FOR SELECT USING (teacher_id = auth.uid());

-- 4. Students & Guardians
CREATE POLICY "Admins full access to students" ON public.students FOR ALL USING (is_admin());
CREATE POLICY "Teachers view students in assigned sections" ON public.students
  FOR SELECT USING (is_assigned_teacher(section_id));

CREATE POLICY "Admins full access to guardians" ON public.student_guardians FOR ALL USING (is_admin());
CREATE POLICY "Teachers view guardians of students in assigned sections" ON public.student_guardians
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND is_assigned_teacher(s.section_id)
    )
  );

-- 5. Recognition Events (Gate Log)
CREATE POLICY "Admins full access to recognition events" ON public.recognition_events FOR ALL USING (is_admin());

-- 6. Classroom Attendance
CREATE POLICY "Admins full access to classroom attendance" ON public.classroom_attendance FOR ALL USING (is_admin());
CREATE POLICY "Teachers select attendance in assigned sections" ON public.classroom_attendance
  FOR SELECT USING (is_assigned_teacher(section_id));
CREATE POLICY "Teachers insert/update attendance in assigned sections" ON public.classroom_attendance
  FOR ALL USING (is_assigned_teacher(section_id));

-- 7. Violations Log
CREATE POLICY "Admins full access to violations" ON public.student_violations FOR ALL USING (is_admin());
CREATE POLICY "Teachers insert violations for students in assigned sections" ON public.student_violations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND is_assigned_teacher(s.section_id)
    )
  );
CREATE POLICY "Teachers view violations for students in assigned sections" ON public.student_violations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND is_assigned_teacher(s.section_id)
    )
  );

-- 8. SMS Notifications
CREATE POLICY "Admins full access to SMS notifications" ON public.sms_notifications FOR ALL USING (is_admin());

-- Enable Realtime for recognition_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.recognition_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classroom_attendance;
