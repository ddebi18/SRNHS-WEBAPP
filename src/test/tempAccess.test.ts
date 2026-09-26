import { describe, it, expect, beforeEach } from 'vitest';
import {
  lrnSchema,
  verifierSchema,
  claimFormSchema,
  createSharedSession,
  revokeSession,
  validateTempSession,
  claimTempSession,
  completeTempClaim,
  resetLrnLookupRateLimit,
  GENERIC_VERIFICATION_ERROR,
} from '@/features/tempAccess/api';
import { saveStoredStudents } from '@/features/faceRegistration/api';

describe('Shared-Session Temporary Access & Verification (§1-§4)', () => {
  const TEST_LRN = '109823456789';
  const TEST_STUDENT_ID = 'std-test-temp-01';
  const TEST_LAST_NAME = 'Santos';

  beforeEach(() => {
    resetLrnLookupRateLimit();

    // Populate mock student in stored roster with both last_name and birthDate
    saveStoredStudents([
      {
        id: TEST_STUDENT_ID,
        name: 'Maria Clara De Los Santos',
        studentNumber: TEST_LRN,
        sectionId: 'sec-10-rizal',
        sectionName: 'Grade 10 - Rizal',
        faceRegistrationStatus: 'unregistered',
        guardianName: 'Capitan Tiago',
        guardianPhone: '+639171112233',
        birthDate: '2008-05-15',
      } as any,
    ]);
  });

  describe('Zod Schema Validation for LRN & Secondary Verifier (§4 & §5)', () => {
    it('accepts valid 12-digit DepEd LRN format', () => {
      expect(lrnSchema.safeParse('109823456789').success).toBe(true);
    });

    it('rejects invalid LRN format (non-numeric, shorter, longer, empty)', () => {
      expect(lrnSchema.safeParse('12345').success).toBe(false);
      expect(lrnSchema.safeParse('10982345678A').success).toBe(false);
      expect(lrnSchema.safeParse('1098234567890123').success).toBe(false);
      expect(lrnSchema.safeParse('').success).toBe(false);
    });

    it('accepts valid verifiers (birth date or last name)', () => {
      expect(verifierSchema.safeParse('2008-05-15').success).toBe(true);
      expect(verifierSchema.safeParse('Santos').success).toBe(true);
    });

    it('rejects empty or whitespace-only verifier', () => {
      expect(verifierSchema.safeParse('').success).toBe(false);
      expect(verifierSchema.safeParse('   ').success).toBe(false);
    });

    it('validates claimFormSchema compound inputs', () => {
      expect(
        claimFormSchema.safeParse({
          lrn: '109823456789',
          verifier: 'Santos',
        }).success
      ).toBe(true);

      expect(
        claimFormSchema.safeParse({
          lrn: '109823456789',
          verifier: '',
        }).success
      ).toBe(false);

      expect(
        claimFormSchema.safeParse({
          lrn: 'invalid-lrn',
          verifier: 'Santos',
        }).success
      ).toBe(false);
    });
  });

  describe('Shared Session Creation & Staff Management (§3)', () => {
    it('creates a shared session with high-entropy token not bound to a single LRN', async () => {
      const session = await createSharedSession({
        label: 'Grade 7 Enrollment Day',
        purpose: 'both',
        ttlMinutes: 240,
        maxUses: 100,
      });

      expect(session.token).toBeDefined();
      expect(session.token.length).toBeGreaterThanOrEqual(32);
      expect(session.is_shared).toBe(true);
      expect(session.is_active).toBe(true);
      expect(session.label).toBe('Grade 7 Enrollment Day');
      expect(session.max_uses).toBe(100);
      expect(session.use_count).toBe(0);
      expect(session.lrn).toBeUndefined(); // Shared session is not pre-bound to an LRN
    });

    it('allows staff to revoke an active session early', async () => {
      const session = await createSharedSession({
        label: 'Short Lived Session',
        ttlMinutes: 60,
      });

      const revoked = await revokeSession(session.id);
      expect(revoked).toBe(true);

      const val = await validateTempSession(session.token);
      expect(val.valid).toBe(false);
      expect(val.reason).toBe('revoked');
    });
  });

  describe('Session Validation Lifecycle (§2)', () => {
    it('validates active session and returns minimal non-sensitive metadata', async () => {
      const session = await createSharedSession({
        label: 'Campus Gate Open Session',
        purpose: 'face_registration',
        ttlMinutes: 120,
      });

      const val = await validateTempSession(session.token);
      expect(val.valid).toBe(true);
      expect(val.label).toBe('Campus Gate Open Session');
      expect(val.purpose).toBe('face_registration');
      expect(val.is_active).toBe(true);
    });

    it('rejects an expired session token', async () => {
      const session = await createSharedSession({
        ttlMinutes: -10, // already expired in the past
      });

      const val = await validateTempSession(session.token);
      expect(val.valid).toBe(false);
      expect(val.reason).toBe('expired');
    });

    it('rejects an invalid or non-existent token', async () => {
      const val = await validateTempSession('non_existent_token_1234567890abcdef');
      expect(val.valid).toBe(false);
      expect(val.reason).toBe('not_found');
    });
  });

  describe('Student Identification & Verification (Claim Flow) (§2 & §4)', () => {
    it('happy path: student claims session using valid LRN and Last Name verifier', async () => {
      const session = await createSharedSession({ ttlMinutes: 60 });

      const claimRes = await claimTempSession({
        token: session.token,
        lrn: TEST_LRN,
        verifier: TEST_LAST_NAME,
      });

      expect(claimRes.success).toBe(true);
      expect(claimRes.claim_token).toBeDefined();
      expect(claimRes.claim_token).not.toBe(session.token); // Scoped claim token differs from shared session token
      expect(claimRes.student?.lrn).toBe(TEST_LRN);
      expect(claimRes.student?.last_name).toBe(TEST_LAST_NAME);
    });

    it('happy path: student claims session using valid LRN and Birth Date verifier', async () => {
      const session = await createSharedSession({ ttlMinutes: 60 });

      const claimRes = await claimTempSession({
        token: session.token,
        lrn: TEST_LRN,
        verifier: '2008-05-15',
      });

      expect(claimRes.success).toBe(true);
      expect(claimRes.claim_token).toBeDefined();
      expect(claimRes.student?.lrn).toBe(TEST_LRN);
    });

    it('rejects non-existent LRN with generic error (no LRN enumeration oracle)', async () => {
      const session = await createSharedSession({ ttlMinutes: 60 });

      await expect(
        claimTempSession({
          token: session.token,
          lrn: '999999999999',
          verifier: 'Santos',
        })
      ).rejects.toThrow(GENERIC_VERIFICATION_ERROR);
    });

    it('rejects verifier mismatch with generic error', async () => {
      const session = await createSharedSession({ ttlMinutes: 60 });

      await expect(
        claimTempSession({
          token: session.token,
          lrn: TEST_LRN,
          verifier: 'WrongLastNameOrDate',
        })
      ).rejects.toThrow(GENERIC_VERIFICATION_ERROR);
    });

    it('prevents double-claiming the same session with the same LRN', async () => {
      const session = await createSharedSession({ ttlMinutes: 60 });

      // First claim succeeds
      const firstClaim = await claimTempSession({
        token: session.token,
        lrn: TEST_LRN,
        verifier: TEST_LAST_NAME,
      });
      expect(firstClaim.success).toBe(true);

      // Second claim attempt by same student on same grant fails
      await expect(
        claimTempSession({
          token: session.token,
          lrn: TEST_LRN,
          verifier: TEST_LAST_NAME,
        })
      ).rejects.toThrow(GENERIC_VERIFICATION_ERROR);
    });

    it('enforces rate-limiting after repeated failed attempts', async () => {
      const session = await createSharedSession({ ttlMinutes: 60 });

      // 5 failed attempts with bad verifier
      for (let i = 0; i < 5; i++) {
        try {
          await claimTempSession({
            token: session.token,
            lrn: TEST_LRN,
            verifier: `WrongAttempt${i}`,
          });
        } catch {
          // Expected failure
        }
      }

      // Next attempt (even with correct details) must fail due to rate-limiting
      await expect(
        claimTempSession({
          token: session.token,
          lrn: TEST_LRN,
          verifier: TEST_LAST_NAME,
        })
      ).rejects.toThrow(GENERIC_VERIFICATION_ERROR);
    });
  });

  describe('Scoped Claim Completion (§2 & §4)', () => {
    it('completes claim with face biometrics & guardian info, then locks further edits', async () => {
      const session = await createSharedSession({ ttlMinutes: 60 });

      const claimRes = await claimTempSession({
        token: session.token,
        lrn: TEST_LRN,
        verifier: TEST_LAST_NAME,
      });

      const claimToken = claimRes.claim_token!;
      const mockEmbedding = [Array.from({ length: 128 }, (_, i) => i * 0.005)];

      const completeRes = await completeTempClaim({
        claimToken,
        faceDescriptors: mockEmbedding,
        guardianDetails: {
          name: 'Maria Elena Santos',
          relationship: 'Mother',
          phone_number: '09171234567',
        },
      });

      expect(completeRes.success).toBe(true);
      expect(completeRes.status).toBe('completed');

      // Attempting to complete with the same claim token again must fail
      const reuseRes = await completeTempClaim({
        claimToken,
        faceDescriptors: mockEmbedding,
      });
      expect(reuseRes.success).toBe(false);
      expect(reuseRes.error).toContain('already been completed');
    });
  });
});
