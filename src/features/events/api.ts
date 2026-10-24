import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { SchoolEvent, EventAttendance, EventCheckInMethod } from '@/types/domain.types';
import { isValidUUID, getStoredStudents } from '@/features/faceRegistration/api';

const LS_EVENTS_KEY = 'srnhs_events_v1';
const LS_EVENT_ATT_KEY = 'srnhs_event_attendance_v1';

// ── Local storage helpers ─────────────────────────────────────────────────────

export function getLocalEvents(): SchoolEvent[] {
  try {
    const raw = localStorage.getItem(LS_EVENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLocalEvents(events: SchoolEvent[]): void {
  try {
    localStorage.setItem(LS_EVENTS_KEY, JSON.stringify(events));
  } catch {}
}

export function getLocalEventAttendance(eventId?: string): EventAttendance[] {
  try {
    const raw = localStorage.getItem(LS_EVENT_ATT_KEY);
    const all: EventAttendance[] = raw ? JSON.parse(raw) : [];
    return eventId ? all.filter(a => a.event_id === eventId) : all;
  } catch {}
  return [];
}

function saveLocalEventAttendance(records: EventAttendance[]): void {
  try {
    localStorage.setItem(LS_EVENT_ATT_KEY, JSON.stringify(records));
  } catch {}
}

// ── Events CRUD ───────────────────────────────────────────────────────────────

export async function fetchEvents(): Promise<SchoolEvent[]> {
  if (!supabase || !isSupabaseConfigured) {
    return getLocalEvents().sort((a, b) =>
      b.event_date.localeCompare(a.event_date)
    );
  }

  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    if (!error && data) {
      const events: SchoolEvent[] = data.map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        event_date: row.event_date,
        start_time: row.start_time ?? null,
        end_time: row.end_time ?? null,
        venue: row.venue ?? null,
        status: row.status,
        created_by: row.created_by ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      saveLocalEvents(events);
      return events;
    }
  } catch (err) {
    console.warn('[Events API] fetch error:', err);
  }

  return getLocalEvents().sort((a, b) => b.event_date.localeCompare(a.event_date));
}

export async function createEvent(input: {
  title: string;
  description?: string;
  event_date: string;
  start_time?: string;
  end_time?: string;
  venue?: string;
  status?: SchoolEvent['status'];
  created_by?: string;
}): Promise<SchoolEvent> {
  const now = new Date().toISOString();
  const localEvent: SchoolEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title: input.title,
    description: input.description ?? null,
    event_date: input.event_date,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    venue: input.venue ?? null,
    status: input.status ?? 'upcoming',
    created_by: input.created_by ?? null,
    created_at: now,
    updated_at: now,
  };

  const events = getLocalEvents();
  events.unshift(localEvent);
  saveLocalEvents(events);

  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('events')
        .insert({
          title: input.title,
          description: input.description ?? null,
          event_date: input.event_date,
          start_time: input.start_time ?? null,
          end_time: input.end_time ?? null,
          venue: input.venue ?? null,
          status: input.status ?? 'upcoming',
          created_by: (input.created_by && isValidUUID(input.created_by)) ? input.created_by : null,
        })
        .select()
        .single();

      if (!error && data) {
        localEvent.id = data.id;
        const saved = getLocalEvents().map(e => e.id === localEvent.id ? { ...e, id: data.id } : e);
        saveLocalEvents(saved);
      }
    } catch (err) {
      console.warn('[Events API] create error:', err);
    }
  }

  return localEvent;
}

export async function updateEventStatus(
  eventId: string,
  status: SchoolEvent['status']
): Promise<void> {
  const events = getLocalEvents().map(e =>
    e.id === eventId ? { ...e, status, updated_at: new Date().toISOString() } : e
  );
  saveLocalEvents(events);

  if (supabase && isSupabaseConfigured && isValidUUID(eventId)) {
    try {
      await supabase
        .from('events')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', eventId);
    } catch (err) {
      console.warn('[Events API] status update error:', err);
    }
  }
}

export async function deleteEvent(eventId: string): Promise<void> {
  const events = getLocalEvents().filter(e => e.id !== eventId);
  saveLocalEvents(events);
  const att = getLocalEventAttendance().filter(a => a.event_id !== eventId);
  saveLocalEventAttendance(att);

  if (supabase && isSupabaseConfigured && isValidUUID(eventId)) {
    try {
      await supabase.from('events').delete().eq('id', eventId);
    } catch (err) {
      console.warn('[Events API] delete error:', err);
    }
  }
}

// ── Event Attendance ──────────────────────────────────────────────────────────

export async function fetchEventAttendance(eventId: string): Promise<EventAttendance[]> {
  if (!supabase || !isSupabaseConfigured || !isValidUUID(eventId)) {
    return getLocalEventAttendance(eventId);
  }

  try {
    const { data, error } = await supabase
      .from('event_attendance')
      .select(`
        id, event_id, student_id, checked_in_at, method, recorded_by, notes, created_at,
        students(lrn, first_name, last_name, middle_name, sections(name))
      `)
      .eq('event_id', eventId)
      .order('checked_in_at', { ascending: true });

    if (!error && data) {
      const records: EventAttendance[] = data.map((row: any) => ({
        id: row.id,
        event_id: row.event_id,
        student_id: row.student_id,
        student_name: row.students
          ? [row.students.first_name, row.students.middle_name, row.students.last_name]
              .filter(Boolean).join(' ')
          : undefined,
        student_lrn: row.students?.lrn,
        section_name: row.students?.sections?.name,
        checked_in_at: row.checked_in_at,
        method: row.method,
        recorded_by: row.recorded_by ?? null,
        notes: row.notes ?? null,
        created_at: row.created_at,
      }));

      // Merge with local (keep local ones not yet in cloud)
      const existing = getLocalEventAttendance().filter(a => a.event_id !== eventId);
      saveLocalEventAttendance([...existing, ...records]);
      return records;
    }
  } catch (err) {
    console.warn('[Events API] attendance fetch error:', err);
  }

  return getLocalEventAttendance(eventId);
}

/**
 * Records attendance for a single student at an event.
 * Deduplicates by (event_id, student_id).
 */
export async function recordEventAttendance(params: {
  eventId: string;
  studentId: string;
  studentName?: string;
  studentLrn?: string;
  sectionName?: string;
  method: EventCheckInMethod;
  recordedBy?: string;
  notes?: string;
}): Promise<{ success: boolean; message: string; record?: EventAttendance }> {
  const existing = getLocalEventAttendance(params.eventId);
  if (existing.some(a => a.student_id === params.studentId)) {
    return { success: false, message: 'Student already checked in to this event.' };
  }

  const now = new Date().toISOString();
  const localRecord: EventAttendance = {
    id: `evtatt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    event_id: params.eventId,
    student_id: params.studentId,
    student_name: params.studentName,
    student_lrn: params.studentLrn,
    section_name: params.sectionName,
    checked_in_at: now,
    method: params.method,
    recorded_by: params.recordedBy ?? null,
    notes: params.notes ?? null,
    created_at: now,
  };

  const allAtt = getLocalEventAttendance();
  allAtt.push(localRecord);
  saveLocalEventAttendance(allAtt);

  if (supabase && isSupabaseConfigured && isValidUUID(params.eventId) && isValidUUID(params.studentId)) {
    try {
      const { data, error } = await supabase
        .from('event_attendance')
        .insert({
          event_id: params.eventId,
          student_id: params.studentId,
          method: params.method,
          recorded_by: (params.recordedBy && isValidUUID(params.recordedBy)) ? params.recordedBy : null,
          notes: params.notes ?? null,
        })
        .select()
        .single();

      if (!error && data) {
        localRecord.id = data.id;
      }
    } catch (err) {
      console.warn('[Events API] attendance insert error:', err);
    }
  }

  return { success: true, message: 'Attendance recorded.', record: localRecord };
}

/**
 * Resolves a student by LRN for event check-in.
 */
export function resolveStudentByLrn(lrn: string): {
  id: string; name: string; lrn: string; sectionName?: string;
} | null {
  const clean = lrn.trim();
  const students = getStoredStudents();
  const s = students.find((st: any) => {
    const sLrn = (st.studentNumber || st.lrn || '').trim();
    return sLrn === clean;
  });

  if (!s) return null;

  const name = (s as any).name ||
    [(s as any).firstName, (s as any).middleName, (s as any).lastName].filter(Boolean).join(' ') ||
    'Student';

  return {
    id: s.id,
    name,
    lrn: clean,
    sectionName: s.sectionName || undefined,
  };
}
