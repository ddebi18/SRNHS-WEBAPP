import { StaffProfile, TeacherAssignment } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isValidUUID, generateUUID } from '@/features/faceRegistration/api';

const LS_STAFF = 'srnhs_faculty_staff_v1';
const LS_ASSIGNMENTS = 'srnhs_faculty_assignments_v1';

const INITIAL_STAFF: StaffProfile[] = [
  {
    id: 'f5d84000-0000-4000-8000-000000000001',
    email: 'admin@srnhs.edu.ph',
    full_name: 'Dr. Maria Santos',
    role: 'admin',
    department: 'School Administration',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'f5d84000-0000-4000-8000-000000000002',
    email: 'teacher1@srnhs.edu.ph',
    full_name: 'Mr. Juan Dela Cruz',
    role: 'teacher',
    department: 'Mathematics & STEM',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'f5d84000-0000-4000-8000-000000000003',
    email: 'teacher2@srnhs.edu.ph',
    full_name: 'Mrs. Corazon Ramos',
    role: 'teacher',
    department: 'English & Humanities',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export function getLocalStaff(): StaffProfile[] {
  try {
    const raw = localStorage.getItem(LS_STAFF);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(LS_STAFF, JSON.stringify(INITIAL_STAFF));
  return INITIAL_STAFF;
}

export function saveLocalStaff(staff: StaffProfile[]): void {
  try { localStorage.setItem(LS_STAFF, JSON.stringify(staff)); } catch {}
}

export function getLocalAssignments(): TeacherAssignment[] {
  try {
    const raw = localStorage.getItem(LS_ASSIGNMENTS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveLocalAssignments(assignments: TeacherAssignment[]): void {
  try { localStorage.setItem(LS_ASSIGNMENTS, JSON.stringify(assignments)); } catch {}
}

// ── Staff Profiles API ───────────────────────────────────────────────────────
export async function fetchStaffProfiles(): Promise<StaffProfile[]> {
  const local = getLocalStaff();
  if (!supabase || !isSupabaseConfigured) return local;

  try {
    const { data, error } = await supabase
      .from('staff_profiles')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) {
      console.warn('[Faculty API] Supabase fetch staff note:', error.message);
      return local;
    }

    if (data && data.length > 0) {
      const mapped: StaffProfile[] = data.map(s => ({
        id: s.id,
        email: s.email,
        full_name: s.full_name,
        role: s.role,
        department: s.department || 'Faculty',
        is_active: s.is_active,
        created_at: s.created_at,
        updated_at: s.updated_at,
      }));
      saveLocalStaff(mapped);
      return mapped;
    } else {
      return local;
    }
  } catch (err) {
    console.warn('[Faculty API] Network note:', err);
    return local;
  }
}

export async function createStaffProfile(staff: {
  email: string;
  full_name: string;
  role: 'admin' | 'teacher';
  department?: string;
}): Promise<StaffProfile> {
  const newStaff: StaffProfile = {
    id: generateUUID(),
    email: staff.email.trim().toLowerCase(),
    full_name: staff.full_name.trim(),
    role: staff.role,
    department: staff.department || 'Faculty',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const current = getLocalStaff();
  saveLocalStaff([...current, newStaff]);

  if (supabase && isSupabaseConfigured) {
    try {
      await supabase.from('staff_profiles').insert({
        id: newStaff.id,
        email: newStaff.email,
        full_name: newStaff.full_name,
        role: newStaff.role,
        department: newStaff.department,
        is_active: true,
      });
    } catch (err) {
      console.warn('[Faculty API] Error inserting staff profile in Supabase:', err);
    }
  }

  return newStaff;
}

export async function toggleStaffStatus(id: string): Promise<boolean> {
  const current = getLocalStaff();
  const target = current.find(s => s.id === id);
  if (!target) return false;

  const nextState = !target.is_active;
  const updated = current.map(s => (s.id === id ? { ...s, is_active: nextState } : s));
  saveLocalStaff(updated);

  if (supabase && isSupabaseConfigured && isValidUUID(id)) {
    try {
      await supabase
        .from('staff_profiles')
        .update({ is_active: nextState, updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (err) {
      console.warn('[Faculty API] Error updating staff status:', err);
    }
  }

  return nextState;
}

// ── Teacher Assignments & Schedules API ───────────────────────────────────────
export async function fetchTeacherAssignments(teacherId?: string): Promise<TeacherAssignment[]> {
  const local = getLocalAssignments();
  if (!supabase || !isSupabaseConfigured) {
    return teacherId ? local.filter(a => a.teacher_id === teacherId) : local;
  }

  try {
    let query = supabase.from('teacher_assignments').select(`
      *,
      staff_profiles ( full_name, email ),
      sections ( name, grade_level ),
      subjects ( title, code ),
      rooms ( name, building )
    `);

    if (teacherId && isValidUUID(teacherId)) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[Faculty API] Supabase fetch assignments note:', error.message);
      return teacherId ? local.filter(a => a.teacher_id === teacherId) : local;
    }

    if (data) {
      const mapped: TeacherAssignment[] = data.map((row: any) => ({
        id: row.id,
        teacher_id: row.teacher_id,
        teacher_name: row.staff_profiles?.full_name || 'Faculty',
        section_id: row.section_id,
        section_name: row.sections?.name || 'Section',
        subject_id: row.subject_id,
        subject_code: row.subjects?.code,
        subject_title: row.subjects?.title || 'Subject',
        room_id: row.room_id,
        room_name: row.rooms?.name || 'Room',
        schedule_day: row.schedule_day,
        start_time: row.start_time,
        end_time: row.end_time,
        created_at: row.created_at,
      }));
      saveLocalAssignments(mapped);
      return mapped;
    }
    return local;
  } catch (err) {
    console.warn('[Faculty API] Network note assignments:', err);
    return local;
  }
}

export async function createTeacherAssignment(asg: {
  teacher_id: string;
  teacher_name?: string;
  section_id: string;
  section_name?: string;
  subject_id: string;
  subject_title?: string;
  subject_code?: string;
  room_id: string;
  room_name?: string;
  schedule_day: string;
  start_time: string;
  end_time: string;
}): Promise<TeacherAssignment> {
  const newAsg: TeacherAssignment = {
    id: generateUUID(),
    ...asg,
    created_at: new Date().toISOString(),
  };

  const current = getLocalAssignments();
  saveLocalAssignments([newAsg, ...current]);

  if (supabase && isSupabaseConfigured) {
    try {
      await supabase.from('teacher_assignments').insert({
        id: newAsg.id,
        teacher_id: newAsg.teacher_id,
        section_id: newAsg.section_id,
        subject_id: newAsg.subject_id,
        room_id: newAsg.room_id,
        schedule_day: newAsg.schedule_day,
        start_time: newAsg.start_time,
        end_time: newAsg.end_time,
      });
    } catch (err) {
      console.warn('[Faculty API] Error inserting assignment to Supabase:', err);
    }
  }

  return newAsg;
}

export async function deleteTeacherAssignment(id: string): Promise<void> {
  const current = getLocalAssignments();
  saveLocalAssignments(current.filter(a => a.id !== id));

  if (supabase && isSupabaseConfigured && isValidUUID(id)) {
    try {
      await supabase.from('teacher_assignments').delete().eq('id', id);
    } catch (err) {
      console.warn('[Faculty API] Error deleting assignment from Supabase:', err);
    }
  }
}
