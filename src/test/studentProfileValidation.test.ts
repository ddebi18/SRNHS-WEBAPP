import { describe, it, expect } from 'vitest';
import { studentProfileSchema, guardianValidationSchema, isProfileComplete } from '@/lib/validation';
import { Student } from '@/types/domain.types';

describe('Student Profile Validation & Completeness', () => {
  const validProfile = {
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    lrn: '123456789012',
    birthdate: '2008-05-15',
    sex: 'Male' as const,
    barangay: 'San Vicente',
    city_municipality: 'San Rafael',
    province: 'Bulacan',
    middle_name: 'Santos',
    religion: 'Roman Catholic',
    mother_tongue: 'Tagalog',
    is_pwd: false,
    is_4ps: true,
    prev_school_name: 'San Rafael Elementary School',
    prev_grade_level: 6,
    prev_general_average: 90.5,
    grade_level: 10,
    section_id: 'sec-101',
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

  it('validates a complete student profile with 12-digit LRN and at least 2 guardians', () => {
    const result = studentProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it('enforces at least two guardians rule (rejects single-guardian profile)', () => {
    const singleGuardian = studentProfileSchema.safeParse({
      ...validProfile,
      guardians: [validProfile.guardians[0]],
    });
    expect(singleGuardian.success).toBe(false);
    if (!singleGuardian.success) {
      expect(singleGuardian.error.errors[0]?.message).toContain('at least two guardians');
    }
  });

  it('rejects invalid LRNs (non-12 digits or non-numeric)', () => {
    const shortLrn = studentProfileSchema.safeParse({ ...validProfile, lrn: '12345' });
    expect(shortLrn.success).toBe(false);

    const nonNumeric = studentProfileSchema.safeParse({ ...validProfile, lrn: '12345678901a' });
    expect(nonNumeric.success).toBe(false);
  });

  it('rejects missing required core fields: first_name, last_name, birthdate, sex, address', () => {
    const missingBirthdate = studentProfileSchema.safeParse({ ...validProfile, birthdate: '' });
    expect(missingBirthdate.success).toBe(false);

    const missingBarangay = studentProfileSchema.safeParse({ ...validProfile, barangay: '' });
    expect(missingBarangay.success).toBe(false);

    const missingProvince = studentProfileSchema.safeParse({ ...validProfile, province: '' });
    expect(missingProvince.success).toBe(false);
  });

  it('validates guardian mobile number format (PH mobile)', () => {
    const validGuardian = {
      full_name: 'Maria Dela Cruz',
      relationship: 'Mother',
      mobile_number: '09171234567',
      is_primary: true,
    };
    expect(guardianValidationSchema.safeParse(validGuardian).success).toBe(true);

    const validPlus63 = {
      ...validGuardian,
      mobile_number: '+639171234567',
    };
    expect(guardianValidationSchema.safeParse(validPlus63).success).toBe(true);

    const invalidNumber = {
      ...validGuardian,
      mobile_number: '12345',
    };
    expect(guardianValidationSchema.safeParse(invalidNumber).success).toBe(false);
  });

  it('accurately identifies whether a student profile is complete or legacy/incomplete', () => {
    const completeStudent: Partial<Student> = {
      id: 'std-1',
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      lrn: '123456789012',
      grade_level: 10,
      section_id: 'sec-1',
      birthdate: '2008-05-15',
      sex: 'Male',
      barangay: 'San Vicente',
      city_municipality: 'San Rafael',
      province: 'Bulacan',
    };
    expect(isProfileComplete(completeStudent)).toBe(true);

    const legacyStudent: Partial<Student> = {
      id: 'std-2',
      first_name: 'Maria',
      last_name: 'Santos',
      lrn: '123456789013',
      grade_level: 10,
      section_id: 'sec-1',
      // Missing birthdate, sex, and barangay/city/province
    };
    expect(isProfileComplete(legacyStudent)).toBe(false);
  });
});
