import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ClassQrSession, AttendanceStatus } from '@/types/domain.types';
import { isValidUUID, getStoredStudents } from '@/features/faceRegistration/api';
import { mockRecognitionAdapter } from '../services/MockRecognitionAdapter';

const LS_CLASS_QR_KEY = 'srnhs_class_qr_sessions_v1';
const LS_CHECKINS_KEY = 'srnhs_class_qr_checkins_v1';

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

  // 1. Revoke existing active sessions for this teacher + section + subject
  const localSessions = getLocalClassQrSessions().map(s => {
    if (
      s.teacher_id === params.teacher_id &&
      s.section_id === params.section_id &&
      s.subject_id === params.subject_id &&
      !s.revoked_at
    ) {
      return { ...s, revoked_at: now.toISOString() };
    }
    return s;
  });

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

  localSessions.push(newSession);
  saveLocalClassQrSessions(localSessions);

  // 2. Persist to Supabase if configured
  if (supabase && isSupabaseConfigured && isValidUUID(params.section_id) && isValidUUID(params.subject_id)) {
    try {
      // Revoke in cloud
      await supabase
        .from('class_qr_sessions')
        .update({ revoked_at: now.toISOString() })
        .eq('teacher_id', params.teacher_id)
        .eq('section_id', params.section_id)
        .eq('subject_id', params.subject_id)
        .is('revoked_at', null);

      // Insert new session
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

      if (!error && data) {
        newSession.id = data.id;
      }
    } catch (err) {
      console.warn('[ClassQR API] Supabase session creation note:', err);
    }
  }

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
  lateThresholdDate?: Date;
}): Promise<{
  success: boolean;
  studentName?: string;
  status?: AttendanceStatus;
  message?: string;
}> {
  const tokenValidation = await validateClassQrToken(params.token);
  if (!tokenValidation.valid || !tokenValidation.session) {
    return { success: false, message: tokenValidation.reason || 'Invalid QR session.' };
  }

  const session = tokenValidation.session;
  const cleanLrn = params.lrn.trim();
  const verifier = params.birthdateOrLastName.trim().toLowerCase();

  // Find student in roster
  const allStudents = getStoredStudents();
  const student = allStudents.find((s: any) => {
    const sLrn = (s.studentNumber || s.lrn || '').trim();
    return sLrn === cleanLrn;
  });

  if (!student) {
    return { success: false, message: 'Student record not found. Please verify your 12-digit LRN.' };
  }

  // Verify identity (birthdate YYYY-MM-DD or last name)
  const studentLastName = ((student as any).lastName || (student as any).last_name || '').trim().toLowerCase();
  const studentDob = ((student as any).birthdate || (student as any).birth_date || '').trim().toLowerCase();

  const isLastNameMatch = studentLastName && (studentLastName === verifier || verifier.includes(studentLastName));
  const isDobMatch = studentDob && studentDob === verifier;

  if (!isLastNameMatch && !isDobMatch) {
    return { success: false, message: 'Identity verification failed. Please check your Last Name or Birth Date.' };
  }

  // Rule: Verify student is enrolled in that specific section!
  const studentSecId = student.sectionId || (student as any).section_id;
  if (studentSecId && studentSecId !== session.section_id) {
    return {
      success: false,
      message: 'Access denied: You are not enrolled in this class section.',
    };
  }

  // Rule: Prevent duplicate scan for this session or day
  const todayStr = new Date().toISOString().split('T')[0];
  const checkinKey = `chk_${session.id}_${student.id}_${todayStr}`;
  const rawCheckins = localStorage.getItem(LS_CHECKINS_KEY);
  const checkins: Record<string, string> = rawCheckins ? JSON.parse(rawCheckins) : {};

  if (checkins[checkinKey]) {
    return {
      success: false,
      message: 'You have already checked in for this classroom session today.',
    };
  }

  // Compute Present vs Late
  const now = new Date();
  let status: AttendanceStatus = 'present';
  if (params.lateThresholdDate && now > params.lateThresholdDate) {
    status = 'late';
  }

  // Mark in local checkins
  checkins[checkinKey] = now.toISOString();
  localStorage.setItem(LS_CHECKINS_KEY, JSON.stringify(checkins));

  const studentFullName = student.name || `${ (student as any).firstName || ''} ${ (student as any).lastName || ''}`.trim() || 'Student';

  // Log to attendance pipeline via Mock / Supabase
  try {
    await mockRecognitionAdapter.logManualEvent({
      student_id: student.id,
      student_name: studentFullName,
      student_lrn: cleanLrn,
      event_type: 'entry',
      section_name: student.sectionName || undefined,
      subject_id: session.subject_id,
    });
  } catch (err) {
    console.warn('[ClassQR API] Attendance event note:', err);
  }

  return {
    success: true,
    studentName: studentFullName,
    status,
    message: `Attendance marked as ${status.toUpperCase()}!`,
  };
}
