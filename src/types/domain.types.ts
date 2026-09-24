export type UserRole = 'admin' | 'teacher' | 'student';

export type EventType = 'entry' | 'exit' | 'classroom_checkin';

export type EventSource = 'camera' | 'manual_override';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export type SmsStatus = 'queued' | 'sent' | 'failed';

export type ViolationSeverity = 'minor' | 'moderate' | 'severe';

export interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  name: string;
  building: string;
  capacity: number;
  created_at: string;
}

export interface Subject {
  id: string;
  code: string;
  title: string;
  description?: string;
  created_at: string;
}

export interface Section {
  id: string;
  grade_level: number;
  name: string;
  adviser_id?: string | null;
  adviser_name?: string;
  created_at: string;
}

export interface TeacherAssignment {
  id: string;
  teacher_id: string;
  teacher_name?: string;
  section_id: string;
  section_name?: string;
  subject_id: string;
  subject_code?: string;
  subject_title?: string;
  room_id: string;
  room_name?: string;
  schedule_day: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface StudentGuardian {
  id: string;
  student_id: string;
  name: string;
  relationship: string;
  phone_number: string;
  is_primary: boolean;
  created_at: string;
}

export interface Student {
  id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  gender: string;
  grade_level: number;
  section_id: string;
  section_name?: string;
  parent_consent: boolean;
  consent_date?: string | null;
  photo_urls: string[];
  guardians?: StudentGuardian[];
  created_at: string;
  updated_at: string;
}

export interface RecognitionEvent {
  id: string;
  student_id: string;
  student_name?: string;
  student_lrn?: string;
  student_photo?: string;
  section_name?: string;
  camera_id?: string;
  gate_id?: string;
  event_type: EventType;
  room_id?: string | null;
  room_name?: string;
  subject_id?: string | null;
  subject_title?: string;
  confidence_score: number;
  source: EventSource;
  captured_at: string;
}

export interface ClassroomAttendanceRecord {
  id: string;
  section_id: string;
  subject_id: string;
  student_id: string;
  student_name?: string;
  student_lrn?: string;
  student_photo?: string;
  date: string;
  status: AttendanceStatus;
  marked_by?: string | null;
  marked_by_name?: string;
  updated_at: string;
}

export interface StudentViolation {
  id: string;
  student_id: string;
  student_name?: string;
  reported_by: string;
  reporter_name?: string;
  title: string;
  description: string;
  severity: ViolationSeverity;
  incident_date: string;
  created_at: string;
}

export interface SmsNotification {
  id: string;
  student_id: string;
  student_name?: string;
  guardian_phone: string;
  message: string;
  event_type: string;
  status: SmsStatus;
  sent_at: string;
}

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }
  | { status: 'forbidden'; message: string };
