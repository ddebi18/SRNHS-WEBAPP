import { describe, it, expect, beforeEach } from 'vitest';
import {
  lookupStudentByLrn,
  createAccessGrant,
  validateAccessToken,
  completeAccessGrant,
  resetLrnLookupRateLimit,
} from '@/features/tempAccess/api';
import { lrnSchema } from '@/features/tempAccess/api';
import { saveStoredStudents } from '@/features/faceRegistration/api';

describe('Temporary Access QR & Portal (Single-Use Scoped Access)', () => {
  const TEST_LRN = '109823456789';
  const TEST_STUDENT_ID = 'std-test-temp-01';

  beforeEach(() => {
    resetLrnLookupRateLimit();

    // Populate mock student in stored roster
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
      },
    ]);
  });

  describe('LRN Format & Rate Limiting (§2)', () => {
    it('accepts a valid 12-digit DepEd LRN format', () => {
      const res = lrnSchema.safeParse('109823456789');
      expect(res.success).toBe(true);
    });

    it('rejects invalid LRN format (non-numeric, shorter, longer)', () => {
      expect(lrnSchema.safeParse('12345').success).toBe(false);
      expect(lrnSchema.safeParse('10982345678A').success).toBe(false);
      expect(lrnSchema.safeParse('1098234567890123').success).toBe(false);
      expect(lrnSchema.safeParse('').success).toBe(false);
    });

    it('looks up student successfully by valid LRN', async () => {
      const student = await lookupStudentByLrn(TEST_LRN);
      expect(student).not.toBeNull();
      expect(student?.lrn).toBe(TEST_LRN);
      expect(student?.first_name).toBe('Maria Clara De Los');
      expect(student?.last_name).toBe('Santos');
    });

    it('returns null when looking up a non-existent student LRN', async () => {
      const student = await lookupStudentByLrn('999999999999');
      expect(student).toBeNull();
    });

    it('enforces rate limiting on repeated LRN lookup attempts', async () => {
      // 6 lookups allowed per window
      for (let i = 0; i < 6; i++) {
        await lookupStudentByLrn(TEST_LRN);
      }
      // 7th lookup must trigger rate limit error
      await expect(lookupStudentByLrn(TEST_LRN)).rejects.toThrow(/Rate limit exceeded/);
    });
  });

  describe('Access Grant Token Generation & Security (§2)', () => {
    it('creates a grant with a secure opaque token and does not embed the raw LRN in the token', async () => {
      const grant = await createAccessGrant({
        lrn: TEST_LRN,
        purpose: 'both',
        ttlMinutes: 60,
      });

      expect(grant.token).toBeDefined();
      expect(grant.token.length).toBeGreaterThanOrEqual(32);
      expect(grant.token).not.toContain(TEST_LRN); // Token is opaque random, never raw LRN
      expect(grant.status).toBe('pending');
      expect(grant.purpose).toBe('both');
    });
  });

  describe('Token Validation & Temporary Session Lifecycle (§3 & §4)', () => {
    it('validates an active, pending token and returns student scope', async () => {
      const grant = await createAccessGrant({
        lrn: TEST_LRN,
        purpose: 'face_registration',
        ttlMinutes: 60,
      });

      const val = await validateAccessToken(grant.token);
      expect(val.valid).toBe(true);
      expect(val.student?.lrn).toBe(TEST_LRN);
      expect(val.purpose).toBe('face_registration');
    });

    it('rejects an invalid or non-existent token', async () => {
      const val = await validateAccessToken('non_existent_token_1234567890abcdef');
      expect(val.valid).toBe(false);
      expect(val.reason).toBe('not_found');
    });

    it('rejects an expired token', async () => {
      const grant = await createAccessGrant({
        lrn: TEST_LRN,
        purpose: 'both',
        ttlMinutes: -10, // already expired
      });

      const val = await validateAccessToken(grant.token);
      expect(val.valid).toBe(false);
      expect(val.reason).toBe('expired');
    });
  });

  describe('Single-Use Grant Completion & Invalidation (§4)', () => {
    it('completes grant atomically, updates face/guardian, and marks token completed so it cannot be reused', async () => {
      const grant = await createAccessGrant({
        lrn: TEST_LRN,
        purpose: 'both',
        ttlMinutes: 60,
      });

      const mockEmbedding = [Array.from({ length: 128 }, (_, i) => i * 0.005)];

      const completeRes = await completeAccessGrant({
        token: grant.token,
        faceDescriptors: mockEmbedding,
        guardianDetails: {
          name: 'Maria Elena Santos',
          relationship: 'Mother',
          phone_number: '09171234567',
        },
      });

      expect(completeRes.success).toBe(true);
      expect(completeRes.status).toBe('completed');

      // Attempting to validate the token again must now fail as already_used
      const reValidate = await validateAccessToken(grant.token);
      expect(reValidate.valid).toBe(false);
      expect(reValidate.reason).toBe('already_used');

      // Attempting to complete with the same token again must fail
      const reuseRes = await completeAccessGrant({
        token: grant.token,
        faceDescriptors: mockEmbedding,
      });
      expect(reuseRes.success).toBe(false);
      expect(reuseRes.error).toContain('already completed');
    });
  });
});
