import * as XLSX from 'xlsx';
import { isValidLRN, isValidPHPhone, normalizePHPhone, StudentProfileInput } from '@/lib/validation';
import { Section } from '@/types/domain.types';
import { getStoredStudents } from '@/features/faceRegistration/api';
import { registerStudentWithProfile } from '../api';
import { fetchSectionSubjects } from '@/features/academics/api';

export interface BulkStudentRow {
  rowNumber: number;
  lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  birthdate: string;
  sex: 'Male' | 'Female' | 'Other';
  religion?: string;
  mother_tongue?: string;
  ethnic_group?: string;
  is_pwd?: boolean;
  is_4ps?: boolean;
  house_street?: string;
  barangay: string;
  city_municipality: string;
  province: string;
  zip_code?: string;
  prev_school_name?: string;
  prev_grade_level?: number;
  prev_general_average?: number;
  school_year_admitted?: string;
  grade_level: number;
  section_name: string;
  guardian_name: string;
  guardian_relationship: string;
  guardian_phone: string;
  guardian_email?: string;
  guardian_2_name?: string;
  guardian_2_relationship?: string;
  guardian_2_phone?: string;
  guardian_2_email?: string;
}

export interface RowValidationResult {
  row: BulkStudentRow;
  isValid: boolean;
  valid?: boolean;
  errors: string[];
  resolvedSectionId?: string;
}

export type BulkImportRow = BulkStudentRow;

export const BULK_TEMPLATE_HEADERS = [
  'LRN*',
  'First Name*',
  'Middle Name',
  'Last Name*',
  'Suffix',
  'Birth Date (YYYY-MM-DD)*',
  'Sex (Male/Female)*',
  'Religion',
  'Mother Tongue',
  'Ethnic Group',
  'PWD (Yes/No)',
  '4Ps (Yes/No)',
  'House/Street',
  'Barangay*',
  'City/Municipality*',
  'Province*',
  'ZIP Code',
  'Previous School',
  'Last Grade Level Completed',
  'General Average',
  'School Year Admitted',
  'Grade Level (7-12)*',
  'Section Name*',
  'Primary Guardian Name*',
  'Guardian Relationship*',
  'Guardian Phone (+639... / 09...)*',
  'Guardian Email',
  'Secondary Guardian Name',
  'Secondary Guardian Relationship',
  'Secondary Guardian Phone',
  'Secondary Guardian Email',
];

export function generateTemplateBlob(): Blob {
  const sampleRows = [
    [
      '109823456789',
      'Juan',
      'Santos',
      'Dela Cruz',
      '',
      '2010-05-15',
      'Male',
      'Roman Catholic',
      'Tagalog',
      '',
      'No',
      'No',
      'Blk 1 Lot 2 Sampaguita St.',
      'San Roque',
      'Antipolo',
      'Rizal',
      '1870',
      'San Roque Elem',
      '9',
      '88.5',
      '2026-2027',
      '10',
      'Rizal',
      'Maria Dela Cruz',
      'Mother',
      '09171234567',
      'maria.delacruz@example.com',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([BULK_TEMPLATE_HEADERS, ...sampleRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students_Template');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function parseBulkFile(file: File): Promise<BulkStudentRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File does not contain any readable sheets.');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('First worksheet could not be parsed.');

  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rawRows.length < 2) {
    throw new Error('File is empty or only contains headers.');
  }

  const parsed: BulkStudentRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || r.length === 0 || r.every(cell => !cell || String(cell).trim() === '')) {
      continue;
    }

    let birthStr = '';
    const rawBirth = r[5];
    if (rawBirth instanceof Date) {
      birthStr = rawBirth.toISOString().split('T')[0] || '';
    } else if (typeof rawBirth === 'string') {
      birthStr = rawBirth.trim();
    } else if (rawBirth) {
      birthStr = String(rawBirth).trim();
    }

    parsed.push({
      rowNumber: i + 1,
      lrn: String(r[0] ?? '').trim().replace(/['"]/g, ''),
      first_name: String(r[1] ?? '').trim(),
      middle_name: String(r[2] ?? '').trim() || undefined,
      last_name: String(r[3] ?? '').trim(),
      suffix: String(r[4] ?? '').trim() || undefined,
      birthdate: birthStr,
      sex: String(r[6] ?? '').toLowerCase().startsWith('f') ? 'Female' : 'Male',
      religion: String(r[7] ?? '').trim() || undefined,
      mother_tongue: String(r[8] ?? '').trim() || undefined,
      ethnic_group: String(r[9] ?? '').trim() || undefined,
      is_pwd: String(r[10] ?? '').toLowerCase().includes('yes'),
      is_4ps: String(r[11] ?? '').toLowerCase().includes('yes'),
      house_street: String(r[12] ?? '').trim() || undefined,
      barangay: String(r[13] ?? '').trim(),
      city_municipality: String(r[14] ?? '').trim(),
      province: String(r[15] ?? '').trim(),
      zip_code: String(r[16] ?? '').trim() || undefined,
      prev_school_name: String(r[17] ?? '').trim() || undefined,
      prev_grade_level: r[18] ? parseInt(String(r[18]), 10) || undefined : undefined,
      prev_general_average: r[19] ? parseFloat(String(r[19])) || undefined : undefined,
      school_year_admitted: String(r[20] ?? '').trim() || undefined,
      grade_level: parseInt(String(r[21] ?? '10'), 10) || 10,
      section_name: String(r[22] ?? '').trim(),
      guardian_name: String(r[23] ?? '').trim(),
      guardian_relationship: String(r[24] ?? 'Parent').trim(),
      guardian_phone: String(r[25] ?? '').trim().replace(/['"\s-]/g, ''),
      guardian_email: String(r[26] ?? '').trim() || undefined,
      guardian_2_name: String(r[27] ?? '').trim() || undefined,
      guardian_2_relationship: String(r[28] ?? 'Guardian').trim() || undefined,
      guardian_2_phone: String(r[29] ?? '').trim().replace(/['"\s-]/g, '') || undefined,
      guardian_2_email: String(r[30] ?? '').trim() || undefined,
    });
  }

  return parsed;
}

export async function validateBulkRows(
  rows: BulkStudentRow[],
  arg2: Section[] | Set<string>,
  arg3?: Section[] | Set<string>,
  arg4?: any[]
): Promise<RowValidationResult[]> {
  let sections: Section[] = [];
  let existingLrns: Set<string>;
  let sectionSubjectsList: any[] = [];

  if (Array.isArray(arg2)) {
    sections = arg2;
    if (arg3 instanceof Set) {
      existingLrns = arg3;
    } else {
      existingLrns = new Set(getStoredStudents().map(s => s.studentNumber));
    }
    if (Array.isArray(arg4)) sectionSubjectsList = arg4;
  } else if (arg2 instanceof Set) {
    existingLrns = arg2;
    if (Array.isArray(arg3)) {
      sections = arg3;
    }
    if (Array.isArray(arg4)) sectionSubjectsList = arg4;
  } else {
    existingLrns = new Set(getStoredStudents().map(s => s.studentNumber));
  }

  const seenInFile = new Set<string>();

  // Cache section subjects to check Rule A during validation
  const sectionSubjectCountMap = new Map<string, number>();
  if (sectionSubjectsList.length > 0) {
    for (const sec of sections) {
      const count = sectionSubjectsList.filter(ss => ss.section_id === sec.id).length;
      sectionSubjectCountMap.set(sec.id, count);
    }
  } else {
    for (const sec of sections) {
      try {
        const subjs = await fetchSectionSubjects(sec.id);
        sectionSubjectCountMap.set(sec.id, subjs.length);
      } catch {
        sectionSubjectCountMap.set(sec.id, 1);
      }
    }
  }

  const results: RowValidationResult[] = [];

  for (const row of rows) {
    const errors: string[] = [];

    // LRN validation
    if (!isValidLRN(row.lrn)) {
      errors.push('LRN must be exactly 12 numeric digits');
    } else {
      if (existingLrns.has(row.lrn)) {
        errors.push(`LRN ${row.lrn} already exists in system / registered in database`);
      }
      if (seenInFile.has(row.lrn)) {
        errors.push(`Duplicate LRN in this upload file (${row.lrn})`);
      }
      seenInFile.add(row.lrn);
    }

    // Required fields
    if (!row.first_name) errors.push('First name is required');
    if (!row.last_name) errors.push('Last name is required');
    if (!row.birthdate || isNaN(Date.parse(row.birthdate))) errors.push('Valid birth date is required (YYYY-MM-DD)');
    if (!row.barangay) errors.push('Barangay is required');
    if (!row.city_municipality) errors.push('City/Municipality is required');
    if (!row.province) errors.push('Province is required');

    // Guardian validation
    if (!row.guardian_name) errors.push('Primary guardian name is required');
    if (!isValidPHPhone(row.guardian_phone)) {
      errors.push('Invalid Philippine mobile number (Guardian phone)');
    }

    // Section resolution
    const secTarget = sections.find(
      s =>
        s.name.toLowerCase().trim() === row.section_name.toLowerCase().trim() &&
        s.grade_level === row.grade_level
    ) || sections.find(
      s => s.name.toLowerCase().trim() === row.section_name.toLowerCase().trim()
    );

    let resolvedSecId: string | undefined = undefined;

    if (!secTarget) {
      errors.push(`Unknown section "${row.section_name}"`);
    } else {
      resolvedSecId = secTarget.id;
      // Rule A check
      const subCount = sectionSubjectCountMap.get(secTarget.id) ?? 0;
      if (subCount === 0 && (sectionSubjectCountMap.size > 0 || sectionSubjectsList.length > 0)) {
        errors.push(`Section "${secTarget.name}" has zero subjects assigned (Rule A block)`);
      }
    }

    results.push({
      row,
      isValid: errors.length === 0,
      valid: errors.length === 0,
      errors,
      resolvedSectionId: resolvedSecId,
    });
  }

  return results;
}

export async function executeBulkImport(
  validatedRows: RowValidationResult[]
): Promise<{ importedCount: number; skippedCount: number; errors: { row: number; lrn: string; error: string }[] }> {
  let importedCount = 0;
  let skippedCount = 0;
  const errors: { row: number; lrn: string; error: string }[] = [];

  for (const item of validatedRows) {
    if (!item.isValid || !item.resolvedSectionId) {
      skippedCount++;
      errors.push({
        row: item.row.rowNumber,
        lrn: item.row.lrn,
        error: item.errors.join('; '),
      });
      continue;
    }

    try {
      const payload: StudentProfileInput = {
        lrn: item.row.lrn,
        first_name: item.row.first_name,
        middle_name: item.row.middle_name,
        last_name: item.row.last_name,
        suffix: item.row.suffix,
        birthdate: item.row.birthdate,
        sex: item.row.sex,
        religion: item.row.religion,
        mother_tongue: item.row.mother_tongue,
        ethnic_group: item.row.ethnic_group,
        is_pwd: Boolean(item.row.is_pwd),
        is_4ps: Boolean(item.row.is_4ps),
        house_street: item.row.house_street,
        barangay: item.row.barangay,
        city_municipality: item.row.city_municipality,
        province: item.row.province,
        zip_code: item.row.zip_code,
        prev_school_name: item.row.prev_school_name,
        prev_grade_level: item.row.prev_grade_level,
        prev_general_average: item.row.prev_general_average,
        school_year_admitted: item.row.school_year_admitted,
        grade_level: item.row.grade_level,
        section_id: item.resolvedSectionId,
        guardians: [
          {
            full_name: item.row.guardian_name,
            relationship: item.row.guardian_relationship,
            mobile_number: normalizePHPhone(item.row.guardian_phone),
            email: item.row.guardian_email,
            is_primary: true,
          },
          {
            full_name: item.row.guardian_2_name || `${item.row.last_name} Secondary Guardian`,
            relationship: item.row.guardian_2_relationship || 'Secondary Guardian',
            mobile_number: item.row.guardian_2_phone
              ? normalizePHPhone(item.row.guardian_2_phone)
              : normalizePHPhone(item.row.guardian_phone),
            email: item.row.guardian_2_email,
            is_primary: false,
          },
        ],
      };

      await registerStudentWithProfile(payload);
      importedCount++;
    } catch (err: any) {
      skippedCount++;
      errors.push({
        row: item.row.rowNumber,
        lrn: item.row.lrn,
        error: err.message || 'Database error during registration',
      });
    }
  }

  return { importedCount, skippedCount, errors };
}

export function generateErrorReportCsv(errors: { row: number; lrn: string; error: string }[]): Blob {
  const header = ['Row Number', 'LRN', 'Validation Error'];
  const rows = errors.map(e => [e.row, `"${e.lrn}"`, `"${e.error.replace(/"/g, '""')}"`]);
  const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}
