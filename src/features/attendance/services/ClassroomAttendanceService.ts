import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { AttendanceStatus, ClassroomAttendanceRecord } from '@/types/domain.types';
import { isValidUUID, generateUUID } from '@/features/faceRegistration/api';
import { activeNotificationAdapter } from '@/features/notifications/services';

const LS_ATTENDANCE_CACHE = 'srnhs_classroom_attendance_cache_v1';

function getLocalCache(): Record<string, ClassroomAttendanceRecord> {
  try {
    const raw = localStorage.getItem(LS_ATTENDANCE_CACHE);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveLocalCache(cache: Record<string, ClassroomAttendanceRecord>) {
  try {
    localStorage.setItem(LS_ATTENDANCE_CACHE, JSON.stringify(cache));
  } catch {}
}

export class ClassroomAttendanceService {
  /**
   * Fetch attendance records for a specific section, subject, and date.
   */
  async fetchAttendance(
    sectionId: string,
    subjectId?: string,
    dateStr?: string
  ): Promise<ClassroomAttendanceRecord[]> {
    const targetDate = dateStr || new Date().toISOString().split('T')[0]!;
    const localCache = getLocalCache();

    // Filter local cache as immediate fallback
    const localMatches = Object.values(localCache).filter(
      r => r.section_id === sectionId && r.date === targetDate && (!subjectId || r.subject_id === subjectId)
    );

    if (!supabase || !isSupabaseConfigured) {
      return localMatches;
    }

    try {
      let query = supabase
        .from('classroom_attendance')
        .select(`
          id, section_id, subject_id, student_id, date, status, marked_by, updated_at,
          students ( first_name, last_name, lrn, photo_urls ),
          staff_profiles ( full_name )
        `)
        .eq('section_id', sectionId)
        .eq('date', targetDate);

      if (subjectId && isValidUUID(subjectId)) {
        query = query.eq('subject_id', subjectId);
      }

      const { data, error } = await query;

      if (error) {
        console.warn('[Attendance Service] Supabase fetch attendance note:', error.message);
        return localMatches;
      }

      if (data && data.length > 0) {
        const records: ClassroomAttendanceRecord[] = data.map((row: any) => ({
          id: row.id,
          section_id: row.section_id,
          subject_id: row.subject_id,
          student_id: row.student_id,
          student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : 'Student',
          student_lrn: row.students?.lrn || '',
          student_photo: row.students?.photo_urls?.[0],
          date: row.date,
          status: row.status as AttendanceStatus,
          marked_by: row.marked_by,
          marked_by_name: row.staff_profiles?.full_name,
          updated_at: row.updated_at,
        }));

        // Update local cache
        records.forEach(r => {
          localCache[`${r.section_id}_${r.subject_id}_${r.student_id}_${r.date}`] = r;
        });
        saveLocalCache(localCache);

        return records;
      }

      return localMatches;
    } catch (err) {
      console.warn('[Attendance Service] Network note:', err);
      return localMatches;
    }
  }

  /**
   * Save or update a single attendance mark for a student.
   */
  async markAttendance(record: {
    section_id: string;
    subject_id?: string;
    student_id: string;
    student_name?: string;
    student_lrn?: string;
    guardian_phone?: string;
    subject_title?: string;
    date: string;
    status: AttendanceStatus;
    marked_by?: string;
  }): Promise<ClassroomAttendanceRecord> {
    const subjectId = record.subject_id && isValidUUID(record.subject_id)
      ? record.subject_id
      : '6a42c388-7f9a-4c91-a589-91efd368e001'; // Fallback to Gen Math

    const localCache = getLocalCache();
    const key = `${record.section_id}_${subjectId}_${record.student_id}_${record.date}`;

    const attendanceRecord: ClassroomAttendanceRecord = {
      id: localCache[key]?.id || generateUUID(),
      section_id: record.section_id,
      subject_id: subjectId,
      student_id: record.student_id,
      student_name: record.student_name,
      student_lrn: record.student_lrn,
      date: record.date,
      status: record.status,
      marked_by: record.marked_by,
      updated_at: new Date().toISOString(),
    };

    localCache[key] = attendanceRecord;
    saveLocalCache(localCache);

    // Persist to Supabase
    if (supabase && isSupabaseConfigured && isValidUUID(record.student_id)) {
      try {
        const payload: any = {
          section_id: record.section_id,
          subject_id: subjectId,
          student_id: record.student_id,
          date: record.date,
          status: record.status,
          updated_at: new Date().toISOString(),
        };
        if (record.marked_by && isValidUUID(record.marked_by)) {
          payload.marked_by = record.marked_by;
        }

        const { error } = await supabase
          .from('classroom_attendance')
          .upsert(payload, { onConflict: 'section_id,subject_id,student_id,date' });

        if (error) {
          console.warn('[Attendance Service] Supabase upsert note:', error.message);
        } else {
          console.log(`[Attendance Service] ✓ Upserted attendance for student ${record.student_id}`);
        }
      } catch (err) {
        console.warn('[Attendance Service] Cloud save note:', err);
      }
    }

    // Trigger Parent SMS Notification on Absence or Tardiness
    if (record.guardian_phone && (record.status === 'absent' || record.status === 'late')) {
      const isAbsent = record.status === 'absent';
      const eventType = isAbsent ? 'unexcused_absence' : 'tardiness';
      const message = isAbsent
        ? `[SRNHS Alert] ${record.student_name || 'Your child'} was marked Unexcused Absent in ${record.subject_title || 'class'} on ${record.date}. Please coordinate with the adviser.`
        : `[SRNHS Notice] ${record.student_name || 'Your child'} arrived Late for ${record.subject_title || 'class'} on ${record.date}.`;

      activeNotificationAdapter.sendAlert({
        student_id: record.student_id,
        student_name: record.student_name || 'Student',
        guardian_phone: record.guardian_phone,
        message,
        event_type: eventType,
      }).catch(err => {
        console.warn('[Attendance Service] SMS dispatch note:', err);
      });
    }

    return attendanceRecord;
  }
}

export const classroomAttendanceService = new ClassroomAttendanceService();
