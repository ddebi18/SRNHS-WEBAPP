import { Student, StudentGuardian, StudentViolation, Guardian } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isValidUUID, generateUUID, getStoredStudents, saveStoredStudents, getStoredSections } from '@/features/faceRegistration/api';
import { StudentProfileInput, studentProfileSchema, normalizePHPhone } from '@/lib/validation';
import { logUserAction } from '@/lib/auditLogger';

const LS_VIOLATIONS = 'srnhs_student_violations_v1';

export function getLocalViolations(): StudentViolation[] {
  try {
    const raw = localStorage.getItem(LS_VIOLATIONS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveLocalViolations(violations: StudentViolation[]): void {
  try {
    localStorage.setItem(LS_VIOLATIONS, JSON.stringify(violations));
  } catch {}
}

export async function fetchViolations(studentId?: string): Promise<StudentViolation[]> {
  const local = getLocalViolations();
  if (!supabase || !isSupabaseConfigured) {
    return studentId ? local.filter(v => v.student_id === studentId) : local;
  }

  try {
    let query = supabase.from('student_violations').select(`
      *,
      students ( first_name, last_name ),
      staff_profiles ( full_name )
    `).order('incident_date', { ascending: false });

    if (studentId && isValidUUID(studentId)) {
      query = query.eq('student_id', studentId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[Violations API] Supabase fetch error:', error.message);
      return studentId ? local.filter(v => v.student_id === studentId) : local;
    }

    if (data) {
      const mapped: StudentViolation[] = data.map((row: any) => ({
        id: row.id,
        student_id: row.student_id,
        student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : 'Student',
        reported_by: row.reported_by,
        reporter_name: row.staff_profiles?.full_name || 'Staff Member',
        title: row.title,
        description: row.description,
        severity: row.severity,
        incident_date: row.incident_date,
        created_at: row.created_at,
      }));
      saveLocalViolations(mapped);
      return mapped;
    }
    return local;
  } catch (err) {
    console.warn('[Violations API] Network note:', err);
    return local;
  }
}

export async function createViolation(v: {
  student_id: string;
  student_name?: string;
  reported_by?: string;
  reporter_name?: string;
  title: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
  incident_date?: string;
}): Promise<StudentViolation> {
  const newViolation: StudentViolation = {
    id: generateUUID(),
    student_id: v.student_id,
    student_name: v.student_name,
    reported_by: v.reported_by || 'f5d84000-0000-4000-8000-000000000001',
    reporter_name: v.reporter_name || 'Staff Member',
    title: v.title.trim(),
    description: v.description.trim(),
    severity: v.severity,
    incident_date: v.incident_date || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const current = getLocalViolations();
  saveLocalViolations([newViolation, ...current]);

  if (supabase && isSupabaseConfigured && isValidUUID(newViolation.student_id)) {
    try {
      await supabase.from('student_violations').insert({
        id: newViolation.id,
        student_id: newViolation.student_id,
        reported_by: isValidUUID(newViolation.reported_by) ? newViolation.reported_by : 'f5d84000-0000-4000-8000-000000000001',
        title: newViolation.title,
        description: newViolation.description,
        severity: newViolation.severity,
        incident_date: newViolation.incident_date,
      });
    } catch (err) {
      console.warn('[Violations API] Supabase insert note:', err);
    }
  }

  return newViolation;
}

export async function deleteViolation(id: string): Promise<void> {
  const current = getLocalViolations();
  saveLocalViolations(current.filter(v => v.id !== id));

  if (supabase && isSupabaseConfigured && isValidUUID(id)) {
    try {
      await supabase.from('student_violations').delete().eq('id', id);
    } catch (err) {
      console.warn('[Violations API] Supabase delete note:', err);
    }
  }
}

// ─── Complete Student Profiling & Enrollment Operations ──────────────────────

export async function fetchStudentGuardians(studentId: string): Promise<Guardian[]> {
  if (supabase && isSupabaseConfigured && isValidUUID(studentId)) {
    try {
      const { data, error } = await supabase
        .from('guardians')
        .select('*')
        .eq('student_id', studentId)
        .order('is_primary', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((g: any) => ({
          id: g.id,
          student_id: g.student_id,
          name: g.full_name,
          full_name: g.full_name,
          relationship: g.relationship,
          phone_number: g.mobile_number,
          mobile_number: g.mobile_number,
          email: g.email,
          address: g.address,
          is_primary: g.is_primary,
          created_at: g.created_at,
          updated_at: g.updated_at,
        }));
      }

      // Fallback to legacy student_guardians table if guardians table is empty
      const { data: legacyG } = await supabase
        .from('student_guardians')
        .select('*')
        .eq('student_id', studentId);

      if (legacyG && legacyG.length > 0) {
        return legacyG.map((g: any) => ({
          id: g.id,
          student_id: g.student_id,
          name: g.name,
          full_name: g.name,
          relationship: g.relationship,
          phone_number: g.phone_number,
          mobile_number: g.phone_number,
          is_primary: g.is_primary ?? true,
          created_at: g.created_at,
        }));
      }
    } catch (err) {
      console.warn('[Students API] Guardian fetch note:', err);
    }
  }

  // Local fallback from stored student
  const students = getStoredStudents();
  const st = students.find(s => s.id === studentId);
  if (st && (st.guardianName || st.guardianPhone)) {
    return [{
      id: `g-${st.id}`,
      student_id: st.id,
      name: st.guardianName || 'Primary Guardian',
      full_name: st.guardianName || 'Primary Guardian',
      relationship: 'Guardian',
      phone_number: st.guardianPhone || '',
      mobile_number: st.guardianPhone || '',
      is_primary: true,
      created_at: new Date().toISOString(),
    }];
  }
  return [];
}

export async function registerStudentWithProfile(input: StudentProfileInput): Promise<Student> {
  // Validate schema
  const parsed = studentProfileSchema.parse(input);
  const studentId = generateUUID();
  const sections = getStoredSections();
  const sec = sections.find(s => s.id === parsed.section_id);
  const sectionName = sec?.name || 'Section';

  // Normalize guardians
  const guardians: StudentGuardian[] = parsed.guardians.map(g => ({
    id: g.id && isValidUUID(g.id) ? g.id : generateUUID(),
    student_id: studentId,
    name: g.full_name.trim(),
    full_name: g.full_name.trim(),
    relationship: g.relationship.trim(),
    phone_number: normalizePHPhone(g.mobile_number),
    mobile_number: normalizePHPhone(g.mobile_number),
    email: g.email?.trim() || null,
    address: g.address?.trim() || null,
    is_primary: Boolean(g.is_primary),
    created_at: new Date().toISOString(),
  }));

  const primaryG = guardians.find(g => g.is_primary) || guardians[0];

  const studentRecord: Student = {
    id: studentId,
    lrn: parsed.lrn.trim(),
    first_name: parsed.first_name.trim(),
    middle_name: parsed.middle_name?.trim() || null,
    last_name: parsed.last_name.trim(),
    suffix: parsed.suffix?.trim() || null,
    gender: parsed.sex,
    sex: parsed.sex,
    birthdate: parsed.birthdate,
    religion: parsed.religion?.trim() || null,
    mother_tongue: parsed.mother_tongue?.trim() || null,
    ethnic_group: parsed.ethnic_group?.trim() || null,
    is_pwd: parsed.is_pwd,
    is_4ps: parsed.is_4ps,
    house_street: parsed.house_street?.trim() || null,
    barangay: parsed.barangay.trim(),
    city_municipality: parsed.city_municipality.trim(),
    province: parsed.province.trim(),
    zip_code: parsed.zip_code?.trim() || null,
    prev_school_name: parsed.prev_school_name?.trim() || null,
    prev_grade_level: parsed.prev_grade_level ?? null,
    prev_general_average: parsed.prev_general_average ?? null,
    school_year_admitted: parsed.school_year_admitted?.trim() || null,
    grade_level: parsed.grade_level,
    section_id: parsed.section_id,
    section_name: sectionName,
    parent_consent: true,
    consent_date: new Date().toISOString().split('T')[0],
    photo_urls: [],
    guardians,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Sync to Supabase if configured
  if (supabase && isSupabaseConfigured) {
    try {
      const { error: stuErr } = await supabase.from('students').insert({
        id: studentRecord.id,
        lrn: studentRecord.lrn,
        first_name: studentRecord.first_name,
        middle_name: studentRecord.middle_name,
        last_name: studentRecord.last_name,
        suffix: studentRecord.suffix,
        gender: studentRecord.gender,
        sex: studentRecord.sex,
        birthdate: studentRecord.birthdate,
        religion: studentRecord.religion,
        mother_tongue: studentRecord.mother_tongue,
        ethnic_group: studentRecord.ethnic_group,
        is_pwd: studentRecord.is_pwd,
        is_4ps: studentRecord.is_4ps,
        house_street: studentRecord.house_street,
        barangay: studentRecord.barangay,
        city_municipality: studentRecord.city_municipality,
        province: studentRecord.province,
        zip_code: studentRecord.zip_code,
        prev_school_name: studentRecord.prev_school_name,
        prev_grade_level: studentRecord.prev_grade_level,
        prev_general_average: studentRecord.prev_general_average,
        school_year_admitted: studentRecord.school_year_admitted,
        grade_level: studentRecord.grade_level,
        section_id: studentRecord.section_id,
        parent_consent: true,
        consent_date: studentRecord.consent_date,
        photo_urls: [],
      });

      if (stuErr) {
        console.warn('[Students API] Supabase student insert warning:', stuErr.message);
        throw new Error(stuErr.message);
      }

      // Insert into guardians table
      const guardianPayloads = guardians.map(g => ({
        id: g.id,
        student_id: studentRecord.id,
        full_name: g.full_name || g.name,
        relationship: g.relationship,
        mobile_number: g.mobile_number || g.phone_number,
        email: g.email || null,
        address: g.address || null,
        is_primary: g.is_primary,
      }));

      try {
        await supabase.from('guardians').insert(guardianPayloads);
      } catch (e) {
        console.warn('[Students API] guardians insert note:', e);
      }

      // Backward compatible student_guardians insert
      if (primaryG) {
        try {
          await supabase.from('student_guardians').insert({
            id: primaryG.id,
            student_id: studentRecord.id,
            name: primaryG.name,
            relationship: primaryG.relationship,
            phone_number: primaryG.phone_number,
            is_primary: true,
          });
        } catch {}
      }

      // Initial enrollment record
      try {
        await supabase.from('enrollments').insert({
          student_id: studentRecord.id,
          grade_level: studentRecord.grade_level,
          section_id: studentRecord.section_id,
          status: 'enrolled',
          effective_date: new Date().toISOString().split('T')[0],
          is_current: true,
        });
      } catch (e) {
        console.warn('[Students API] initial enrollment record note:', e);
      }
    } catch (err: any) {
      if (err.message && err.message.includes('Rule A')) {
        throw err;
      }
      console.warn('[Students API] Supabase error during registration, keeping local record:', err);
    }
  }

  // Update local storage so face registration and student list reflect immediately
  const existing = getStoredStudents();
  saveStoredStudents([
    {
      id: studentRecord.id,
      name: `${studentRecord.first_name} ${studentRecord.last_name}`,
      studentNumber: studentRecord.lrn,
      sectionId: studentRecord.section_id,
      sectionName: studentRecord.section_name,
      faceRegistrationStatus: 'unregistered',
      guardianName: primaryG?.name,
      guardianPhone: primaryG?.phone_number,
    },
    ...existing,
  ]);

  logUserAction({
    action: 'student.profile_saved',
    entity_type: 'student',
    entity_id: studentRecord.id,
    metadata: {
      lrn: studentRecord.lrn,
      grade_level: studentRecord.grade_level,
      section_id: studentRecord.section_id,
    },
  }).catch(() => {});

  return studentRecord;
}

// ── Guardian Management & Invite API ───────────────────────────────────────

export async function manageGuardianInvite(params: {
  action: 'invite' | 'resend' | 'revoke';
  guardian_id: string;
  student_id: string;
  full_name?: string;
  email?: string;
  mobile_number?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.functions.invoke('create-guardian', {
        body: params,
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        return { success: false, error: msg };
      }
      return { success: true, message: data?.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to manage guardian invite' };
    }
  }

  // Fallback / local storage simulation for test or local development
  const now = new Date().toISOString();
  const guardiansKey = `guardians_${params.student_id}`;
  const existing: Guardian[] = JSON.parse(localStorage.getItem(guardiansKey) || '[]');
  const updated = existing.map(g => {
    if (g.id === params.guardian_id) {
      if (params.action === 'revoke') {
        return { ...g, user_id: null, invited_at: null, activated_at: null, updated_at: now };
      } else {
        return { ...g, user_id: `auth-${g.id}`, invited_at: now, updated_at: now };
      }
    }
    return g;
  });
  localStorage.setItem(guardiansKey, JSON.stringify(updated));
  logUserAction({
    action: `guardian.${params.action}`,
    entity_type: 'guardian',
    entity_id: params.guardian_id,
    metadata: {
      student_id: params.student_id,
      email: params.email,
    },
  }).catch(() => {});
  return { success: true, message: params.action === 'revoke' ? 'Invite revoked.' : 'Invite sent.' };
}

// ── Guardian Portal Queries ────────────────────────────────────────────────

export async function fetchGuardianLinkedStudents(): Promise<Array<{ student: Student; guardian: Guardian }>> {
  if (!supabase || !isSupabaseConfigured) {
    const students = getStoredStudents();
    if (students.length > 0) {
      const s = students[0]!;
      return [{
        student: {
          id: s.id,
          lrn: s.studentNumber,
          first_name: s.name.split(' ')[0] || 'Student',
          last_name: s.name.split(' ').slice(1).join(' ') || '',
          gender: 'Not Specified',
          grade_level: 10,
          section_id: s.sectionId,
          section_name: s.sectionName || 'Section 1',
          photo_urls: [],
          parent_consent: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        guardian: {
          id: 'g-local-1',
          student_id: s.id,
          full_name: s.guardianName || 'Parent Guardian',
          relationship: 'Parent',
          mobile_number: s.guardianPhone || '09171234567',
          is_primary: true,
          created_at: new Date().toISOString(),
        },
      }];
    }
    return [];
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: guardianRows, error: gErr } = await supabase
      .from('guardians')
      .select('*, students(*)')
      .eq('user_id', user.id);

    if (gErr || !guardianRows) return [];

    return guardianRows.map((row: any) => ({
      guardian: row as Guardian,
      student: {
        id: row.students.id,
        lrn: row.students.lrn,
        first_name: row.students.first_name,
        middle_name: row.students.middle_name,
        last_name: row.students.last_name,
        suffix: row.students.suffix,
        birthdate: row.students.birthdate,
        sex: row.students.sex,
        gender: row.students.sex || 'Not Specified',
        grade_level: row.students.grade_level,
        section_id: row.students.section_id,
        photo_urls: [],
        parent_consent: true,
        created_at: row.students.created_at,
        updated_at: row.students.updated_at,
      } as unknown as Student,
    }));
  } catch (err) {
    console.warn('[Students API] fetchGuardianLinkedStudents error:', err);
    return [];
  }
}

