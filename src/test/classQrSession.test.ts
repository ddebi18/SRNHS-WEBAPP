import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import {
  createClassQrSession,
  revokeClassQrSession,
  validateClassQrToken,
  recordStudentQrCheckIn,
  saveLocalClassQrSessions,
} from '@/features/attendance/api/classQrApi';
import { saveStoredStudents } from '@/features/faceRegistration/api';
import {
  matchesClassQrIdentity,
  parseClassQrCheckinInput,
} from '../../supabase/functions/_shared/classQrCheckin';

vi.mock('@/lib/supabase', () => {
  const query = {
    update: vi.fn(() => query),
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn().mockResolvedValue({ error: null }),
    single: vi.fn().mockResolvedValue({
      data: { id: '00000000-0000-4000-8000-000000000004' },
      error: null,
    }),
    then: (resolve: (value: { error: null }) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve, reject),
  };
  return {
    supabase: {
      from: vi.fn(() => query),
      functions: { invoke: vi.fn() },
    },
    isSupabaseConfigured: true,
  };
});

const invokeCheckin = vi.mocked(supabase!.functions.invoke);

function functionError(message: string) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

describe('Feature 2: Class QR Sessions & Student Scan Check-In', () => {
  const teacherId = '00000000-0000-4000-8000-000000000001';
  const sectionId = '00000000-0000-4000-8000-000000000002';
  const subjectId = '00000000-0000-4000-8000-000000000003';

  beforeEach(() => {
    localStorage.clear();
    invokeCheckin.mockReset();
    saveLocalClassQrSessions([]);

    // Seed mock students
    saveStoredStudents([
      {
        id: 'std-1',
        name: 'Juan Dela Cruz',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        studentNumber: '109823456701',
        sectionId,
        sectionName: 'Grade 10 - Ruby',
        birthdate: '2008-05-15',
        face_registered: true,
      },
      {
        id: 'std-2',
        name: 'Maria Santos',
        firstName: 'Maria',
        lastName: 'Santos',
        studentNumber: '109823456702',
        sectionId: '00000000-0000-4000-8000-000000000005',
        sectionName: 'Grade 10 - Emerald',
        birthdate: '2008-08-20',
        face_registered: true,
      },
    ] as any[]);
  });

  it('creates an active session with high-entropy token and short TTL', async () => {
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 90,
    });

    expect(session.token).toMatch(/^cqr_/);
    expect(session.revoked_at).toBeNull();
    expect(new Date(session.expires_at).getTime()).toBeGreaterThan(Date.now());

    const validation = await validateClassQrToken(session.token);
    expect(validation.valid).toBe(true);
    expect(validation.session?.token).toBe(session.token);
  });

  it('revoking a session immediately invalidates the token', async () => {
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 120,
    });

    await revokeClassQrSession(session.id);

    const validation = await validateClassQrToken(session.token);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('revoked');
  });

  it('generating a new session for the same class/subject automatically revokes previous active session', async () => {
    const firstSession = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 90,
    });

    const secondSession = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 90,
    });

    expect(firstSession.token).not.toBe(secondSession.token);

    // First session should now be revoked
    const firstVal = await validateClassQrToken(firstSession.token);
    expect(firstVal.valid).toBe(false);

    // Second session is active
    const secondVal = await validateClassQrToken(secondSession.token);
    expect(secondVal.valid).toBe(true);
  });

  it('rejects expired QR tokens', async () => {
    // Session with negative TTL (already expired)
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: -10,
    });

    const validation = await validateClassQrToken(session.token);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('expired');
  });

  it('submits check-in without requiring a local student roster', async () => {
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 90,
    });

    localStorage.clear();
    invokeCheckin.mockResolvedValue({
      data: {
        success: true,
        studentName: 'Juan Dela Cruz',
        status: 'present',
        message: 'Attendance marked as PRESENT!',
      },
      error: null,
    });

    const res = await recordStudentQrCheckIn({
      token: session.token,
      lrn: '109823456701',
      birthdateOrLastName: 'Dela Cruz',
    });

    expect(res.success).toBe(true);
    expect(res.studentName).toBe('Juan Dela Cruz');
    expect(res.status).toBe('present');
    expect(invokeCheckin).toHaveBeenCalledWith('class-qr-check-in', {
      body: {
        token: session.token,
        lrn: '109823456701',
        birthdateOrLastName: 'Dela Cruz',
      },
    });
  });

  it('rejects student not enrolled in that section', async () => {
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 90,
    });

    invokeCheckin.mockResolvedValue({
      data: null,
      error: functionError('You are not enrolled in this class section.') as never,
    });

    const res = await recordStudentQrCheckIn({
      token: session.token,
      lrn: '109823456702',
      birthdateOrLastName: 'Santos',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('not enrolled');
  });

  it('returns the server daily duplicate rejection', async () => {
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 90,
    });

    invokeCheckin
      .mockResolvedValueOnce({
        data: { success: true, studentName: 'Juan Dela Cruz', status: 'present' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: functionError('You have already checked in for this subject today.') as never,
      });

    const first = await recordStudentQrCheckIn({
      token: session.token,
      lrn: '109823456701',
      birthdateOrLastName: 'Dela Cruz',
    });
    expect(first.success).toBe(true);

    const second = await recordStudentQrCheckIn({
      token: session.token,
      lrn: '109823456701',
      birthdateOrLastName: 'Dela Cruz',
    });
    expect(second.success).toBe(false);
    expect(second.message).toContain('already checked in');
  });
});

describe('Class QR check-in server input validation', () => {
  it('requires a token, 12-digit LRN, and verifier', () => {
    expect(parseClassQrCheckinInput({
      token: ' active-token ',
      lrn: '109823456701',
      birthdateOrLastName: 'Dela Cruz',
    })).toEqual({
      token: 'active-token',
      lrn: '109823456701',
      verifier: 'Dela Cruz',
    });
    expect(parseClassQrCheckinInput({ token: 'token', lrn: '123', birthdateOrLastName: 'Name' })).toBeNull();
  });

  it('requires an exact last-name or birth-date match', () => {
    expect(matchesClassQrIdentity('Dela Cruz', '2008-05-15', 'dela cruz')).toBe(true);
    expect(matchesClassQrIdentity('Dela Cruz', '2008-05-15', '2008-05-15')).toBe(true);
    expect(matchesClassQrIdentity('Dela Cruz', '2008-05-15', 'Dela Cruz extra')).toBe(false);
  });
});
