export type UserRole = 'admin' | 'teacher' | 'guardian';

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
  code?: string | null;
  title: string;
  name?: string;
  description?: string;
  created_at: string;
}

export interface Section {
  id: string;
  grade_level: number;
  name: string;
  adviser_id?: string | null;
  adviser_name?: string;
  created_at?: string;
}

export interface TeacherAssignment {
  id: string;
  teacher_id: string;
  teacher_name?: string;
  teacher_email?: string;
  section_id: string;
  section_name?: string;
  grade_level?: number;
  subject_id: string;
  subject_code?: string;
  subject_title?: string;
  room_id: string;
  room_name?: string;
  room_building?: string;
  days: string[];
  schedule_day?: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface TeachingAssignmentInput {
  teacher_id: string;
  section_id: string;
  subject_id: string;
  room_id: string;
  days: string[];
  start_time: string;
  end_time: string;
}

export interface StudentGuardian {
  id: string;
  student_id: string;
  name?: string;
  full_name?: string;
  relationship: string;
  phone_number?: string;
  mobile_number?: string;
  email?: string | null;
  address?: string | null;
  is_primary: boolean;
  user_id?: string | null;
  invited_at?: string | null;
  activated_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type Guardian = StudentGuardian;

export interface SchoolYear {
  id: string;
  name?: string;
  label?: string;
  year_start?: number;
  year_end?: number;
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string;
}

export interface GradeLevel {
  id: string;
  level: number;
  name: string;
  category?: 'JHS' | 'SHS';
  created_at?: string;
}

export interface TrackStrand {
  id: string;
  code: string;
  name: string;
  track_type: string;
  track?: string;
  created_at?: string;
}

export interface SectionSubject {
  id: string;
  section_id: string;
  subject_id: string;
  created_at?: string;
  subject?: Subject;
}

export type EnrollmentStatus =
  | 'enrolled'
  | 'promoted'
  | 'retained'
  | 'transferred_out'
  | 'dropped'
  | 'graduated'
  | 'active';

export interface Enrollment {
  id: string;
  student_id: string;
  school_year_id?: string | null;
  school_year_name?: string;
  grade_level?: number;
  grade_level_id?: string;
  section_id: string;
  section_name?: string;
  status: EnrollmentStatus;
  effective_date: string;
  changed_by?: string | null;
  is_current?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Student {
  id: string;
  lrn: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  gender: string;
  sex?: string | null;
  birthdate?: string | null;
  religion?: string | null;
  mother_tongue?: string | null;
  ethnic_group?: string | null;
  is_pwd?: boolean;
  is_4ps?: boolean;
  house_street?: string | null;
  barangay?: string | null;
  city_municipality?: string | null;
  province?: string | null;
  zip_code?: string | null;
  prev_school_name?: string | null;
  prev_grade_level?: number | null;
  prev_general_average?: number | null;
  school_year_admitted?: string | null;
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

export type RecognitionStatus = 'matched' | 'unidentified' | 'ambiguous';

export interface CandidateStudent {
  student_id: string;
  student_name: string;
  lrn: string;
  similarity: number;
}

export interface RecognitionEvent {
  id: string;
  student_id?: string | null;
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
  status?: RecognitionStatus;
  top_similarity_score?: number;
  candidate_student_ids?: CandidateStudent[];
  captured_image_path?: string | null;
  captured_image_url?: string | null;
  detection_count?: number;
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

// ─── Faculty Features Domain Types ──────────────────────────────────────────

export interface Grade {
  id: string;
  student_id: string;
  subject_id: string;
  section_id: string;
  school_year_id?: string | null;
  quarter: 1 | 2 | 3 | 4;
  grade: number;
  is_published: boolean;
  recorded_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StudentQuarterGrades {
  student_id: string;
  student_name: string;
  lrn: string;
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
  q4?: number | null;
  final_rating?: number | null;
  remark?: 'Passed' | 'Failed' | 'Incomplete';
  is_published?: boolean;
}

export interface ClassQrSession {
  id: string;
  teacher_id: string;
  section_id: string;
  subject_id: string;
  school_year_id?: string | null;
  token: string;
  expires_at: string;
  revoked_at?: string | null;
  created_at?: string;
}

export type EventStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

export interface SchoolEvent {
  id: string;
  title: string;
  description?: string | null;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  venue?: string | null;
  status: EventStatus;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type EventCheckInMethod = 'qr' | 'face' | 'manual';

export interface EventAttendance {
  id: string;
  event_id: string;
  student_id: string;
  student_name?: string;
  student_lrn?: string;
  section_name?: string;
  checked_in_at: string;
  method: EventCheckInMethod;
  recorded_by?: string | null;
  notes?: string | null;
  created_at?: string;
}

// ── User Logs (Audit Trail) Domain Types ───────────────────────────────────
export interface UserLog {
  id: string;
  user_id: string | null;
  role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, any>;
  ip?: string | null;
  ip_address?: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

// ── Announcements Domain Types ─────────────────────────────────────────────
export type AnnouncementAudience = 'school' | 'grade_level' | 'section';

export interface AnnouncementAttachment {
  id: string;
  announcement_id: string;
  storage_path: string;
  file_name: string;
  mime: string;
  size: number;
  created_at: string;
}

export interface AnnouncementRecipient {
  id: string;
  announcement_id: string;
  guardian_id: string;
  sms_status: string;
  read_at?: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  created_by?: string | null;
  author_name?: string;
  audience_type: AnnouncementAudience;
  audience_id?: string | null;
  send_sms: boolean;
  created_at: string;
  attachments?: AnnouncementAttachment[];
  recipients_count?: number;
  read_count?: number;
  is_read?: boolean;
}

// ── Violations Domain Types ────────────────────────────────────────────────
export interface ViolationType {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

export type ViolationStatus = 'reported' | 'acknowledged' | 'resolved';

export interface Violation {
  id: string;
  student_id: string;
  student_name?: string;
  student_lrn?: string;
  violation_type_id: string;
  violation_type_name?: string;
  violation_type_code?: string;
  section_id?: string | null;
  section_name?: string;
  school_year_id?: string | null;
  occurred_at: string;
  location?: string | null;
  notes?: string | null;
  evidence_path?: string | null;
  status: ViolationStatus;
  source: string;
  reported_by?: string | null;
  reporter_name?: string;
  created_at: string;
  views_count?: number;
}

export interface ViolationView {
  id: string;
  violation_id: string;
  user_id: string;
  user_name?: string;
  role: string;
  first_seen_at: string;
  last_seen_at: string;
}

// ── Faculty Reports Domain Types ───────────────────────────────────────────
export interface FacultyAttendanceSummary {
  total_sessions_held: number;
  total_attendees_marked: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  excused_count: number;
  overall_attendance_rate: number;
}

export interface FacultyGradesStatus {
  section_id: string;
  section_name: string;
  grade_level: number;
  subject_id: string;
  subject_code: string;
  subject_title: string;
  total_enrolled: number;
  q1_entered: number;
  q1_published: boolean;
  q2_entered: number;
  q2_published: boolean;
  q3_entered: number;
  q3_published: boolean;
  q4_entered: number;
  q4_published: boolean;
}



