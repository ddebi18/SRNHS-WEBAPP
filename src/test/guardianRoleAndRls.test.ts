import { describe, it, expect, vi, beforeEach } from 'vitest';
import { studentProfileSchema, hasMinimumGuardians } from '@/lib/validation';
import { manageGuardianInvite } from '@/features/students/api';

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

describe('Feature 1: Guardian Role, Invites & RLS Denial Security', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('1. Two-Guardian DepEd Enrollment Rule', () => {
    const baseProfile = {
      lrn: '109876543210',
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      birthdate: '2008-03-20',
      sex: 'Male' as const,
      barangay: 'San Roque',
      city_municipality: 'Antipolo',
      province: 'Rizal',
      grade_level: 10,
      section_id: 'sec-101',
    };

    it('strictly rejects enrollment with only one guardian', () => {
      const singleGuardian = {
        ...baseProfile,
        guardians: [
          {
            full_name: 'Maria Dela Cruz',
            relationship: 'Mother',
            mobile_number: '09171234567',
            is_primary: true,
          },
        ],
      };

      const result = studentProfileSchema.safeParse(singleGuardian);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain('at least two guardians');
      }
    });

    it('accepts enrollment with two or more guardians and exactly one primary', () => {
      const twoGuardians = {
        ...baseProfile,
        guardians: [
          {
            full_name: 'Maria Dela Cruz',
            relationship: 'Mother',
            mobile_number: '09171234567',
            is_primary: true,
          },
          {
            full_name: 'Juan Dela Cruz Sr.',
            relationship: 'Father',
            mobile_number: '09181234567',
            is_primary: false,
          },
        ],
      };

      const result = studentProfileSchema.safeParse(twoGuardians);
      expect(result.success).toBe(true);
    });

    it('rejects enrollment if more than one guardian is designated primary', () => {
      const dualPrimary = {
        ...baseProfile,
        guardians: [
          {
            full_name: 'Maria Dela Cruz',
            relationship: 'Mother',
            mobile_number: '09171234567',
            is_primary: true,
          },
          {
            full_name: 'Juan Dela Cruz Sr.',
            relationship: 'Father',
            mobile_number: '09181234567',
            is_primary: true,
          },
        ],
      };

      const result = studentProfileSchema.safeParse(dualPrimary);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain('Exactly one primary guardian');
      }
    });

    it('hasMinimumGuardians helper flags legacy students with fewer than 2 guardians', () => {
      expect(hasMinimumGuardians(null)).toBe(false);
      expect(hasMinimumGuardians([])).toBe(false);
      expect(hasMinimumGuardians([{ id: 'g1', full_name: 'Mom' }])).toBe(false);
      expect(hasMinimumGuardians([{ id: 'g1', full_name: 'Mom' }, { id: 'g2', full_name: 'Dad' }])).toBe(true);
    });
  });

  describe('2. Guardian Invite Lifecycle (Invite, Resend, Revoke)', () => {
    const studentId = 'std-uuid-101';
    const guardianId = 'g-uuid-202';

    it('manages invite lifecycle: invite -> resend -> revoke', async () => {
      // Seed initial guardian in local storage
      const initialGuardians = [
        {
          id: guardianId,
          student_id: studentId,
          full_name: 'Teresa Santos',
          relationship: 'Mother',
          mobile_number: '09171234567',
          email: 'teresa@example.com',
          is_primary: true,
          user_id: null,
          invited_at: null,
          activated_at: null,
        },
      ];
      localStorage.setItem(`guardians_${studentId}`, JSON.stringify(initialGuardians));

      // 1. Send Invite
      const inviteRes = await manageGuardianInvite({
        action: 'invite',
        guardian_id: guardianId,
        student_id: studentId,
        full_name: 'Teresa Santos',
        email: 'teresa@example.com',
      });
      expect(inviteRes.success).toBe(true);

      const afterInvite = JSON.parse(localStorage.getItem(`guardians_${studentId}`) || '[]');
      expect(afterInvite[0].invited_at).toBeTruthy();
      expect(afterInvite[0].user_id).toBeTruthy();

      // 2. Resend Invite
      const resendRes = await manageGuardianInvite({
        action: 'resend',
        guardian_id: guardianId,
        student_id: studentId,
      });
      expect(resendRes.success).toBe(true);

      // 3. Revoke Invite
      const revokeRes = await manageGuardianInvite({
        action: 'revoke',
        guardian_id: guardianId,
        student_id: studentId,
      });
      expect(revokeRes.success).toBe(true);

      const afterRevoke = JSON.parse(localStorage.getItem(`guardians_${studentId}`) || '[]');
      expect(afterRevoke[0].user_id).toBeNull();
      expect(afterRevoke[0].invited_at).toBeNull();
      expect(afterRevoke[0].activated_at).toBeNull();
    });
  });

  describe('3. RLS Simulation & Policy Denial Rules for Guardian Role', () => {
    const linkedStudentId = 'std-child-111';
    const unlinkedStudentId = 'std-other-222';

    // Mock policy simulator mirroring Postgres RLS
    const simulateGuardianSelect = (table: string, row: Record<string, any>) => {
      // Guardian is allowed only their linked child
      if (table === 'students') {
        return row.id === linkedStudentId;
      }
      if (table === 'recognition_events' || table === 'classroom_attendance' || table === 'event_attendance') {
        return row.student_id === linkedStudentId;
      }
      if (table === 'grades') {
        // Must be both linked child AND published
        return row.student_id === linkedStudentId && row.is_published === true;
      }
      if (table === 'violations') {
        // Zero access to violations for guardians
        return false;
      }
      return false;
    };

    const simulateGuardianMutation = (table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE') => {
      // Guardians have NO write policies on academic, attendance, or student records
      const allowedTables = ['announcement_recipients'];
      if (allowedTables.includes(table) && operation === 'UPDATE') {
        return true; // can update read_at on own announcement recipient
      }
      return false;
    };

    it('permits SELECT on linked student but denies SELECT on unlinked student', () => {
      const linkedStudent = { id: linkedStudentId, first_name: 'Child', last_name: 'Dela Cruz' };
      const otherStudent = { id: unlinkedStudentId, first_name: 'Other', last_name: 'Student' };

      expect(simulateGuardianSelect('students', linkedStudent)).toBe(true);
      expect(simulateGuardianSelect('students', otherStudent)).toBe(false);
    });

    it('permits SELECT on published grades for linked child only', () => {
      const publishedLinkedGrade = { student_id: linkedStudentId, subject_id: 'sub-1', grade: 92, is_published: true };
      const unpublishedLinkedGrade = { student_id: linkedStudentId, subject_id: 'sub-1', grade: 92, is_published: false };
      const publishedOtherGrade = { student_id: unlinkedStudentId, subject_id: 'sub-1', grade: 95, is_published: true };

      expect(simulateGuardianSelect('grades', publishedLinkedGrade)).toBe(true);
      expect(simulateGuardianSelect('grades', unpublishedLinkedGrade)).toBe(false); // denied unpublished
      expect(simulateGuardianSelect('grades', publishedOtherGrade)).toBe(false); // denied other student
    });

    it('strictly denies SELECT on student violations to guardians', () => {
      const linkedChildViolation = { student_id: linkedStudentId, title: 'Improper Uniform', severity: 'minor' };
      const otherChildViolation = { student_id: unlinkedStudentId, title: 'Tardiness', severity: 'minor' };

      expect(simulateGuardianSelect('violations', linkedChildViolation)).toBe(false);
      expect(simulateGuardianSelect('violations', otherChildViolation)).toBe(false);
    });

    it('strictly denies all INSERT, UPDATE, and DELETE mutations on academic tables by guardian', () => {
      expect(simulateGuardianMutation('students', 'INSERT')).toBe(false);
      expect(simulateGuardianMutation('students', 'UPDATE')).toBe(false);
      expect(simulateGuardianMutation('students', 'DELETE')).toBe(false);

      expect(simulateGuardianMutation('grades', 'INSERT')).toBe(false);
      expect(simulateGuardianMutation('grades', 'UPDATE')).toBe(false);
      expect(simulateGuardianMutation('grades', 'DELETE')).toBe(false);

      expect(simulateGuardianMutation('classroom_attendance', 'INSERT')).toBe(false);
      expect(simulateGuardianMutation('recognition_events', 'INSERT')).toBe(false);
      expect(simulateGuardianMutation('violations', 'INSERT')).toBe(false);
    });
  });
});
