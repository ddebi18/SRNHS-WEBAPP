import { StudentViolation } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isValidUUID, generateUUID } from '@/features/faceRegistration/api';

const LS_VIOLATIONS = 'srnhs_student_violations_v1';

export function getLocalViolations(): StudentViolation[] {
  try {
    const raw = localStorage.getItem(LS_VIOLATIONS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveLocalViolations(violations: StudentViolation[]): void {
  try {
    localStorage.setItem(LS_VIOLATIONS, JSON.stringify(violations));
  } catch {}
}

export async function fetchViolations(studentId?: string): Promise<StudentViolation[]> {
  const local = getLocalViolations();
  if (!supabase || !isSupabaseConfigured) {
    return studentId ? local.filter(v => v.student_id === studentId) : local;
  }

  try {
    let query = supabase.from('student_violations').select(`
      *,
      students ( first_name, last_name ),
      staff_profiles ( full_name )
    `).order('incident_date', { ascending: false });

    if (studentId && isValidUUID(studentId)) {
      query = query.eq('student_id', studentId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[Violations API] Supabase fetch error:', error.message);
      return studentId ? local.filter(v => v.student_id === studentId) : local;
    }

    if (data) {
      const mapped: StudentViolation[] = data.map((row: any) => ({
        id: row.id,
        student_id: row.student_id,
        student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : 'Student',
        reported_by: row.reported_by,
        reporter_name: row.staff_profiles?.full_name || 'Staff Member',
        title: row.title,
        description: row.description,
        severity: row.severity,
        incident_date: row.incident_date,
        created_at: row.created_at,
      }));
      saveLocalViolations(mapped);
      return mapped;
    }
    return local;
  } catch (err) {
    console.warn('[Violations API] Network note:', err);
    return local;
  }
}

export async function createViolation(v: {
  student_id: string;
  student_name?: string;
  reported_by?: string;
  reporter_name?: string;
  title: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
  incident_date?: string;
}): Promise<StudentViolation> {
  const newViolation: StudentViolation = {
    id: generateUUID(),
    student_id: v.student_id,
    student_name: v.student_name,
    reported_by: v.reported_by || 'f5d84000-0000-4000-8000-000000000001',
    reporter_name: v.reporter_name || 'Staff Member',
    title: v.title.trim(),
    description: v.description.trim(),
    severity: v.severity,
    incident_date: v.incident_date || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const current = getLocalViolations();
  saveLocalViolations([newViolation, ...current]);

  if (supabase && isSupabaseConfigured && isValidUUID(newViolation.student_id)) {
    try {
      await supabase.from('student_violations').insert({
        id: newViolation.id,
        student_id: newViolation.student_id,
        reported_by: isValidUUID(newViolation.reported_by) ? newViolation.reported_by : 'f5d84000-0000-4000-8000-000000000001',
        title: newViolation.title,
        description: newViolation.description,
        severity: newViolation.severity,
        incident_date: newViolation.incident_date,
      });
    } catch (err) {
      console.warn('[Violations API] Supabase insert note:', err);
    }
  }

  return newViolation;
}

export async function deleteViolation(id: string): Promise<void> {
  const current = getLocalViolations();
  saveLocalViolations(current.filter(v => v.id !== id));

  if (supabase && isSupabaseConfigured && isValidUUID(id)) {
    try {
      await supabase.from('student_violations').delete().eq('id', id);
    } catch (err) {
      console.warn('[Violations API] Supabase delete note:', err);
    }
  }
}
