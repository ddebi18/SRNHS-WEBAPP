import { describe, it, expect } from 'vitest';
import { validateBulkRows, BulkImportRow } from '@/features/students/lib/bulkImport';
import { Section, SectionSubject } from '@/types/domain.types';

describe('Bulk Student Upload Parser & Validation', () => {
  const sections: Section[] = [
    {
      id: 'sec-101',
      name: 'Rizal',
      grade_level: 10,
      created_at: new Date().toISOString(),
    },
    {
      id: 'sec-102',
      name: 'Bonifacio',
      grade_level: 10,
      created_at: new Date().toISOString(),
    },
  ];

  const sectionSubjects: SectionSubject[] = [
    {
      id: 'ss-1',
      section_id: 'sec-101',
      subject_id: 'sub-math',
      created_at: new Date().toISOString(),
    },
    // Note: sec-102 has 0 subjects (Rule A violation)
  ];

  const existingLrns = new Set<string>(['111111111111']);

  it('validates correct row and marks it valid', async () => {
    const rows: BulkImportRow[] = [
      {
        rowNumber: 2,
        lrn: '123456789012',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        birthdate: '2008-01-01',
        sex: 'Male',
        barangay: 'San Vicente',
        city_municipality: 'San Rafael',
        province: 'Bulacan',
        grade_level: 10,
        section_name: 'Rizal',
        guardian_name: 'Rosa Dela Cruz',
        guardian_relationship: 'Mother',
        guardian_phone: '09171234567',
      },
    ];

    const results = await validateBulkRows(rows, existingLrns, sections, sectionSubjects);
    expect(results).toHaveLength(1);
    expect(results[0]?.valid).toBe(true);
    expect(results[0]?.errors).toHaveLength(0);
    expect(results[0]?.resolvedSectionId).toBe('sec-101');
  });

  it('flags duplicate LRN against existing database records', async () => {
    const rows: BulkImportRow[] = [
      {
        rowNumber: 2,
        lrn: '111111111111', // in existingLrns
        first_name: 'Existing',
        last_name: 'Student',
        birthdate: '2008-01-01',
        sex: 'Male',
        barangay: 'San Vicente',
        city_municipality: 'San Rafael',
        province: 'Bulacan',
        grade_level: 10,
        section_name: 'Rizal',
        guardian_name: 'Rosa Dela Cruz',
        guardian_relationship: 'Mother',
        guardian_phone: '09171234567',
      },
    ];

    const results = await validateBulkRows(rows, existingLrns, sections, sectionSubjects);
    expect(results[0]?.valid).toBe(false);
    expect(results[0]?.errors.some((e: string) => e.includes('already exists in system'))).toBe(true);
  });

  it('flags duplicate LRN within the uploaded batch file', async () => {
    const rows: BulkImportRow[] = [
      {
        rowNumber: 2,
        lrn: '222222222222',
        first_name: 'Twin 1',
        last_name: 'Santos',
        birthdate: '2008-01-01',
        sex: 'Male',
        barangay: 'San Vicente',
        city_municipality: 'San Rafael',
        province: 'Bulacan',
        grade_level: 10,
        section_name: 'Rizal',
        guardian_name: 'Rosa',
        guardian_relationship: 'Mother',
        guardian_phone: '09171234567',
      },
      {
        rowNumber: 3,
        lrn: '222222222222', // duplicate within file
        first_name: 'Twin 2',
        last_name: 'Santos',
        birthdate: '2008-01-01',
        sex: 'Female',
        barangay: 'San Vicente',
        city_municipality: 'San Rafael',
        province: 'Bulacan',
        grade_level: 10,
        section_name: 'Rizal',
        guardian_name: 'Rosa',
        guardian_relationship: 'Mother',
        guardian_phone: '09171234567',
      },
    ];

    const results = await validateBulkRows(rows, existingLrns, sections, sectionSubjects);
    expect(results[0]?.valid).toBe(true);
    expect(results[1]?.valid).toBe(false);
    expect(results[1]?.errors.some((e: string) => e.includes('Duplicate LRN in this upload file'))).toBe(true);
  });

  it('enforces Rule A: blocks section with zero assigned subjects', async () => {
    const rows: BulkImportRow[] = [
      {
        rowNumber: 2,
        lrn: '333333333333',
        first_name: 'Pedro',
        last_name: 'Penduko',
        birthdate: '2008-01-01',
        sex: 'Male',
        barangay: 'San Vicente',
        city_municipality: 'San Rafael',
        province: 'Bulacan',
        grade_level: 10,
        section_name: 'Bonifacio', // sec-102 has 0 subjects
        guardian_name: 'Rosa',
        guardian_relationship: 'Mother',
        guardian_phone: '09171234567',
      },
    ];

    const results = await validateBulkRows(rows, existingLrns, sections, sectionSubjects);
    expect(results[0]?.valid).toBe(false);
    expect(results[0]?.errors.some((e: string) => e.includes('Rule A'))).toBe(true);
  });

  it('detects unknown section names and invalid Philippine mobile numbers', async () => {
    const rows: BulkImportRow[] = [
      {
        rowNumber: 2,
        lrn: '444444444444',
        first_name: 'Ana',
        last_name: 'Reyes',
        birthdate: '2008-01-01',
        sex: 'Female',
        barangay: 'San Vicente',
        city_municipality: 'San Rafael',
        province: 'Bulacan',
        grade_level: 10,
        section_name: 'NonExistentSection',
        guardian_name: 'Rosa',
        guardian_relationship: 'Mother',
        guardian_phone: '12345', // invalid
      },
    ];

    const results = await validateBulkRows(rows, existingLrns, sections, sectionSubjects);
    expect(results[0]?.valid).toBe(false);
    expect(results[0]?.errors.some((e: string) => e.includes('Unknown section'))).toBe(true);
    expect(results[0]?.errors.some((e: string) => e.includes('Invalid Philippine mobile number'))).toBe(true);
  });
});
