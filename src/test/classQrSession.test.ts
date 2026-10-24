import { describe, it, expect, beforeEach } from 'vitest';
import {
  createClassQrSession,
  revokeClassQrSession,
  validateClassQrToken,
  recordStudentQrCheckIn,
  saveLocalClassQrSessions,
} from '@/features/attendance/api/classQrApi';
import { saveStoredStudents } from '@/features/faceRegistration/api';

describe('Feature 2: Class QR Sessions & Student Scan Check-In', () => {
  const teacherId = 'teacher-101';
  const sectionId = 'sec-grade10-ruby';
  const subjectId = 'sub-math-10';

  beforeEach(() => {
    localStorage.clear();
    saveLocalClassQrSessions([]);

    // Seed mock students
    saveStoredStudents([
      {
        id: 'std-1',
        name: 'Juan Dela Cruz',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        studentNumber: '109823456701',
        sectionId: 'sec-grade10-ruby',
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
        sectionId: 'sec-grade10-emerald',
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

  it('successful check-in: verifies student LRN and last name, marking attendance', async () => {
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 90,
    });

    const res = await recordStudentQrCheckIn({
      token: session.token,
      lrn: '109823456701',
      birthdateOrLastName: 'Dela Cruz',
    });

    expect(res.success).toBe(true);
    expect(res.studentName).toBe('Juan Dela Cruz');
    expect(res.status).toBe('present');
  });

  it('rejects student not enrolled in that section', async () => {
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId, // Ruby
      subject_id: subjectId,
      ttlSeconds: 90,
    });

    // Maria is enrolled in Emerald, not Ruby
    const res = await recordStudentQrCheckIn({
      token: session.token,
      lrn: '109823456702',
      birthdateOrLastName: 'Santos',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('not enrolled');
  });

  it('prevents duplicate check-in for the same session', async () => {
    const session = await createClassQrSession({
      teacher_id: teacherId,
      section_id: sectionId,
      subject_id: subjectId,
      ttlSeconds: 90,
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
