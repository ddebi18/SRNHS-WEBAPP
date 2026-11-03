import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ClassQrSession, AttendanceStatus } from '@/types/domain.types';
import { isValidUUID } from '@/features/faceRegistration/api';

const LS_CLASS_QR_KEY = 'srnhs_class_qr_sessions_v1';

export function getLocalClassQrSessions(): ClassQrSession[] {
  try {
    const raw = localStorage.getItem(LS_CLASS_QR_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveLocalClassQrSessions(sessions: ClassQrSession[]): void {
  try {
    localStorage.setItem(LS_CLASS_QR_KEY, JSON.stringify(sessions));
  } catch {}
}

export function generateSecureToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const u = crypto.randomUUID().replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 10);
    return `cqr_${u}_${rand}`;
  }
  return `cqr_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
}

export async function createClassQrSession(params: {
  teacher_id: string;
  section_id: string;
  subject_id: string;
  school_year_id?: string | null;
  ttlSeconds?: number;
}): Promise<ClassQrSession> {
  const ttl = params.ttlSeconds || 90;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  const token = generateSecureToken();

  const newSession: ClassQrSession = {
    id: `cqr-sess-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    teacher_id: params.teacher_id,
    section_id: params.section_id,
    subject_id: params.subject_id,
    school_year_id: params.school_year_id || null,
    token,
    expires_at: expiresAt,
    revoked_at: null,
    created_at: now.toISOString(),
  };

  if (supabase && isSupabaseConfigured) {
    if (!isValidUUID(params.section_id) || !isValidUUID(params.subject_id) || !isValidUUID(params.teacher_id)) {
      throw new Error('A valid teacher, section, and subject are required to create a classroom QR session.');
    }

    const { error: revokeError } = await supabase
      .from('class_qr_sessions')
      .update({ revoked_at: now.toISOString() })
      .eq('teacher_id', params.teacher_id)
      .eq('section_id', params.section_id)
      .eq('subject_id', params.subject_id)
      .is('revoked_at', null);
    if (revokeError) throw new Error(`Could not rotate the previous QR session: ${revokeError.message}`);

    const { data, error } = await supabase
      .from('class_qr_sessions')
      .insert({
        teacher_id: params.teacher_id,
        section_id: params.section_id,
        subject_id: params.subject_id,
        school_year_id: (params.school_year_id && isValidUUID(params.school_year_id)) ? params.school_year_id : null,
        token,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Could not create a shared QR session${error ? `: ${error.message}` : '.'}`);
    }
    newSession.id = data.id;
  }

  const localSessions = getLocalClassQrSessions().map(s => (
    s.teacher_id === params.teacher_id &&
      s.section_id === params.section_id &&
      s.subject_id === params.subject_id &&
      !s.revoked_at
      ? { ...s, revoked_at: now.toISOString() }
      : s
  ));
  localSessions.push(newSession);
  saveLocalClassQrSessions(localSessions);

  return newSession;
}

export async function revokeClassQrSession(sessionId: string): Promise<void> {
  const nowStr = new Date().toISOString();
  const sessions = getLocalClassQrSessions().map(s => {
    if (s.id === sessionId || s.token === sessionId) {
      return { ...s, revoked_at: nowStr };
    }
    return s;
  });
  saveLocalClassQrSessions(sessions);

  if (supabase && isSupabaseConfigured) {
    try {
      let query = supabase.from('class_qr_sessions').update({ revoked_at: nowStr });
      if (isValidUUID(sessionId)) {
        query = query.eq('id', sessionId);
      } else {
        query = query.eq('token', sessionId);
      }
      await query;
    } catch (err) {
      console.warn('[ClassQR API] Supabase revoke error:', err);
    }
  }
}

export async function validateClassQrToken(token: string): Promise<{
  valid: boolean;
  session?: ClassQrSession;
  reason?: string;
}> {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Missing or invalid QR token.' };
  }

  // 1. Check local session cache
  const localSession = getLocalClassQrSessions().find(s => s.token === token);
  const now = new Date();

  if (localSession) {
    if (localSession.revoked_at) {
      return { valid: false, reason: 'This QR attendance session was ended or revoked by the teacher.' };
    }
    if (new Date(localSession.expires_at) <= now) {
      return { valid: false, reason: 'This QR code has expired. Please scan the current rotating QR on the teacher screen.' };
    }
    return { valid: true, session: localSession };
  }

  // 2. Query Supabase
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('class_qr_sessions')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (error || !data) {
        return { valid: false, reason: 'Attendance session not found or invalid token.' };
      }

      if (data.revoked_at) {
        return { valid: false, reason: 'This QR attendance session has been ended.' };
      }

      if (new Date(data.expires_at) <= now) {
        return { valid: false, reason: 'This QR code has expired. Please ask the teacher for the latest code.' };
      }

      return { valid: true, session: data as ClassQrSession };
    } catch (err) {
      console.warn('[ClassQR API] Token validation error:', err);
    }
  }

  return { valid: false, reason: 'Session not found or expired.' };
}

export async function recordStudentQrCheckIn(params: {
  token: string;
  lrn: string;
  birthdateOrLastName: string;
}): Promise<{
  success: boolean;
  studentName?: string;
  status?: AttendanceStatus;
  message?: string;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { success: false, message: 'QR attendance is unavailable because the server is not configured.' };
  }

  const { data, error } = await supabase.functions.invoke('class-qr-check-in', {
    body: {
      token: params.token.trim(),
      lrn: params.lrn.trim(),
      birthdateOrLastName: params.birthdateOrLastName.trim(),
    },
  });

  if (error) {
    let message = error.message || 'Attendance check-in failed.';
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const body = await context.clone().json().catch(() => null) as { message?: unknown } | null;
      if (typeof body?.message === 'string') message = body.message;
    }
    return { success: false, message };
  }

  if (!data || typeof data.success !== 'boolean') {
    throw new Error('The attendance server returned an invalid response.');
  }
  const statuses: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
  return {
    success: data.success,
    studentName: typeof data.studentName === 'string' ? data.studentName : undefined,
    status: statuses.includes(data.status) ? data.status as AttendanceStatus : undefined,
    message: typeof data.message === 'string' ? data.message : undefined,
  };
}

export interface ClassQrCheckin {
  id: string;
  student_id: string;
  section_id: string;
  subject_id: string;
  attendance_date: string;
  checked_in_at: string;
  student_name: string;
}

interface ClassQrCheckinQueryRow extends Omit<ClassQrCheckin, 'student_name'> {
  students: { first_name: string | null; last_name: string | null }[] | null;
}

function manilaDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function fetchClassQrCheckins(filters: {
  sectionId?: string;
  subjectId?: string;
} = {}): Promise<ClassQrCheckin[]> {
  if (!supabase || !isSupabaseConfigured) return [];

  let query = supabase
    .from('class_qr_checkins')
    .select('id, student_id, section_id, subject_id, attendance_date, checked_in_at, students(first_name, last_name)')
    .eq('attendance_date', manilaDate())
    .order('checked_in_at', { ascending: false });
  if (filters.sectionId && filters.sectionId !== 'all') query = query.eq('section_id', filters.sectionId);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load classroom QR attendance: ${error.message}`);

  return (data || []).map((row: ClassQrCheckinQueryRow) => ({
    id: row.id,
    student_id: row.student_id,
    section_id: row.section_id,
    subject_id: row.subject_id,
    attendance_date: row.attendance_date,
    checked_in_at: row.checked_in_at,
    student_name: `${row.students?.[0]?.first_name || ''} ${row.students?.[0]?.last_name || ''}`.trim() || 'Enrolled Student',
  }));
}
