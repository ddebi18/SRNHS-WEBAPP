import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  FacultyAttendanceSummary,
  FacultyGradesStatus,
  Violation,
  UserLog,
} from '@/types/domain.types';
import { fetchUserLogs } from '@/lib/auditLogger';

/**
 * Fetch attendance summary metrics for a faculty member.
 */
export async function fetchFacultyAttendanceSummary(
  teacherId: string,
  startDate?: string,
  endDate?: string
): Promise<FacultyAttendanceSummary> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('get_faculty_attendance_summary', {
        p_teacher_id: teacherId,
        p_start_date: startDate || '1970-01-01',
        p_end_date: endDate || '2099-12-31',
      });

      if (!error && data && data.length > 0) {
        const row = data[0];
        return {
          total_sessions_held: Number(row.total_sessions_held || 0),
          total_attendees_marked: Number(row.total_attendees_marked || 0),
          present_count: Number(row.present_count || 0),
          late_count: Number(row.late_count || 0),
          absent_count: Number(row.absent_count || 0),
          excused_count: Number(row.excused_count || 0),
          overall_attendance_rate: Number(row.overall_attendance_rate || 0),
        };
      }
      console.warn('[FacultyReports] RPC attendance error:', error?.message);
    } catch (e) {
      console.warn('[FacultyReports] Attendance RPC call failed:', e);
    }
  }

  // Local storage fallback for tests & local dev
  try {
    const rawClass = localStorage.getItem('srnhs_classroom_attendance_records') || '[]';
    const records: any[] = JSON.parse(rawClass);
    const teacherRecords = records.filter(r => !teacherId || r.marked_by === teacherId || r.teacher_id === teacherId);

    const total = teacherRecords.length;
    const present = teacherRecords.filter(r => r.status === 'present').length;
    const late = teacherRecords.filter(r => r.status === 'late').length;
    const absent = teacherRecords.filter(r => r.status === 'absent').length;
    const excused = teacherRecords.filter(r => r.status === 'excused').length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 100;

    // Unique dates = sessions held
    const uniqueDates = new Set(teacherRecords.map(r => r.date));

    return {
      total_sessions_held: uniqueDates.size || (total > 0 ? 1 : 0),
      total_attendees_marked: total,
      present_count: present,
      late_count: late,
      absent_count: absent,
      excused_count: excused,
      overall_attendance_rate: rate,
    };
  } catch {
    return {
      total_sessions_held: 0,
      total_attendees_marked: 0,
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      excused_count: 0,
      overall_attendance_rate: 0,
    };
  }
}

/**
 * Fetch grade submission progress across assigned sections and learning areas.
 */
export async function fetchFacultyGradesStatus(
  teacherId: string,
  schoolYearId?: string
): Promise<FacultyGradesStatus[]> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('get_faculty_grades_status', {
        p_teacher_id: teacherId,
        p_school_year_id: schoolYearId || null,
      });

      if (!error && data) {
        return data as FacultyGradesStatus[];
      }
      console.warn('[FacultyReports] RPC grades error:', error?.message);
    } catch (e) {
      console.warn('[FacultyReports] Grades RPC call failed:', e);
    }
  }

  // Fallback for tests/local mode
  return [
    {
      section_id: 'sec-01',
      section_name: 'Grade 10 - Rizal',
      grade_level: 10,
      subject_id: 'sub-01',
      subject_code: 'ENG-10',
      subject_title: 'English 10',
      total_enrolled: 42,
      q1_entered: 42,
      q1_published: true,
      q2_entered: 42,
      q2_published: true,
      q3_entered: 38,
      q3_published: false,
      q4_entered: 0,
      q4_published: false,
    },
    {
      section_id: 'sec-02',
      section_name: 'Grade 10 - Bonifacio',
      grade_level: 10,
      subject_id: 'sub-01',
      subject_code: 'ENG-10',
      subject_title: 'English 10',
      total_enrolled: 40,
      q1_entered: 40,
      q1_published: true,
      q2_entered: 40,
      q2_published: true,
      q3_entered: 0,
      q3_published: false,
      q4_entered: 0,
      q4_published: false,
    },
  ];
}

/**
 * Fetch violations logged by this faculty member.
 */
export async function fetchFacultyViolations(teacherId: string): Promise<Violation[]> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('violations')
        .select(`
          id,
          student_id,
          violation_type_id,
          occurred_at,
          location,
          notes,
          status,
          source,
          created_at,
          students(first_name, last_name, lrn),
          violation_types(name, code)
        `)
        .eq('reported_by', teacherId)
        .order('occurred_at', { ascending: false });

      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          student_id: row.student_id,
          student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : undefined,
          student_lrn: row.students?.lrn,
          violation_type_id: row.violation_type_id,
          violation_type_name: row.violation_types?.name,
          violation_type_code: row.violation_types?.code,
          occurred_at: row.occurred_at,
          location: row.location,
          notes: row.notes,
          status: row.status,
          source: row.source,
          created_at: row.created_at,
        }));
      }
    } catch (e) {
      console.warn('[FacultyReports] Violations query failed:', e);
    }
  }

  // Local storage fallback
  try {
    const raw = localStorage.getItem('srnhs_violations_v1') || '[]';
    const all: Violation[] = JSON.parse(raw);
    return all.filter(v => !teacherId || v.reported_by === teacherId);
  } catch {
    return [];
  }
}

/**
 * Fetch recent activity audit logs for this faculty member.
 */
export async function fetchFacultyActivityLogs(
  teacherId: string,
  limit: number = 30
): Promise<UserLog[]> {
  const res = await fetchUserLogs({
    user_id: teacherId,
    limit,
  });
  return res.data;
}
