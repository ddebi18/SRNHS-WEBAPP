import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Room, Subject, Section, SchoolYear, GradeLevel, TrackStrand, SectionSubject } from '@/types/domain.types';
import {
  getStoredRooms,
  saveRooms,
  getStoredSubjects,
  saveSubjects,
  getStoredSections,
  saveStoredSections,
  toFRSection,
  generateUUID,
} from './academicsStorage';
import { isValidUUID, getStoredStudents } from '@/features/faceRegistration/api';

// ─── School Years API ────────────────────────────────────────────────────────

const LS_SCHOOL_YEARS = 'srnhs_academics_school_years_v1';

export function getLocalSchoolYears(): SchoolYear[] {
  try {
    const raw = localStorage.getItem(LS_SCHOOL_YEARS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [
    { id: 'sy-2026-2027', name: 'S.Y. 2026-2027', is_active: true, start_date: '2026-06-01', end_date: '2027-03-31' },
    { id: 'sy-2025-2026', name: 'S.Y. 2025-2026', is_active: false, start_date: '2025-06-01', end_date: '2026-03-31' },
  ];
}

export function saveLocalSchoolYears(years: SchoolYear[]): void {
  try {
    localStorage.setItem(LS_SCHOOL_YEARS, JSON.stringify(years));
  } catch {}
}

export async function fetchSchoolYears(): Promise<SchoolYear[]> {
  const local = getLocalSchoolYears();
  if (!supabase || !isSupabaseConfigured) return local;

  try {
    const { data, error } = await supabase
      .from('school_years')
      .select('*')
      .order('name', { ascending: false });

    if (!error && data && data.length > 0) {
      saveLocalSchoolYears(data);
      return data;
    }
  } catch (err) {
    console.warn('[Academics API] School years fetch note:', err);
  }
  return local;
}

// ─── Grade Levels API ────────────────────────────────────────────────────────

export async function fetchGradeLevels(): Promise<GradeLevel[]> {
  const defaultLevels: GradeLevel[] = [
    { id: 'gl-7', level: 7, name: 'Grade 7' },
    { id: 'gl-8', level: 8, name: 'Grade 8' },
    { id: 'gl-9', level: 9, name: 'Grade 9' },
    { id: 'gl-10', level: 10, name: 'Grade 10' },
    { id: 'gl-11', level: 11, name: 'Grade 11' },
    { id: 'gl-12', level: 12, name: 'Grade 12' },
  ];

  if (!supabase || !isSupabaseConfigured) return defaultLevels;

  try {
    const { data, error } = await supabase
      .from('grade_levels')
      .select('*')
      .order('level');

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn('[Academics API] Grade levels fetch note:', err);
  }
  return defaultLevels;
}

// ─── Tracks & Strands API ───────────────────────────────────────────────────

export async function fetchTracksStrands(): Promise<TrackStrand[]> {
  const defaultTracks: TrackStrand[] = [
    { id: 'ts-jhs', code: 'JHS', name: 'Junior High School General Curriculum', track_type: 'JHS' },
    { id: 'ts-stem', code: 'STEM', name: 'Science, Technology, Engineering, and Mathematics', track_type: 'Academic' },
    { id: 'ts-abm', code: 'ABM', name: 'Accountancy, Business, and Management', track_type: 'Academic' },
    { id: 'ts-humss', code: 'HUMSS', name: 'Humanities and Social Sciences', track_type: 'Academic' },
    { id: 'ts-gas', code: 'GAS', name: 'General Academic Strand', track_type: 'Academic' },
    { id: 'ts-ict', code: 'TVL-ICT', name: 'Technical-Vocational-Livelihood (ICT)', track_type: 'TVL' },
    { id: 'ts-he', code: 'TVL-HE', name: 'Technical-Vocational-Livelihood (Home Economics)', track_type: 'TVL' },
  ];

  if (!supabase || !isSupabaseConfigured) return defaultTracks;

  try {
    const { data, error } = await supabase
      .from('tracks_strands')
      .select('*')
      .order('code');

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn('[Academics API] Tracks fetch note:', err);
  }
  return defaultTracks;
}

// ─── Subjects API ───────────────────────────────────────────────────────────

export async function fetchSubjects(): Promise<Subject[]> {
  const local = getStoredSubjects();
  if (!supabase || !isSupabaseConfigured) return local;

  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .order('title');

    if (!error && data) {
      const mapped = data.map((r: any) => ({
        id: r.id,
        code: r.code,
        title: r.title || r.name || 'Subject',
        name: r.title || r.name || 'Subject',
        description: r.description,
        created_at: r.created_at || new Date().toISOString(),
      }));
      saveSubjects(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('[Academics API] Subjects fetch note:', err);
  }
  return local;
}

// ─── Rooms API ──────────────────────────────────────────────────────────────

export async function fetchRooms(): Promise<Room[]> {
  const local = getStoredRooms();
  if (!supabase || !isSupabaseConfigured) return local;

  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('name');

    if (!error && data) {
      saveRooms(data);
      return data;
    }
  } catch (err) {
    console.warn('[Academics API] Rooms fetch note:', err);
  }
  return local;
}

// ─── Sections API ───────────────────────────────────────────────────────────

export async function fetchSections(): Promise<Section[]> {
  const frSecs = getStoredSections();
  const local: Section[] = frSecs.map(fr => ({
    id: fr.id,
    grade_level: parseInt(fr.gradeLevel.replace('Grade ', ''), 10) || 10,
    name: fr.name,
    adviser_id: fr.teacherId || null,
    adviser_name: fr.teacherName !== 'Unassigned' ? fr.teacherName : undefined,
    created_at: new Date().toISOString(),
  }));

  if (!supabase || !isSupabaseConfigured) return local;

  try {
    const { data, error } = await supabase
      .from('sections')
      .select('id, name, grade_level, adviser_id, staff_profiles(full_name)')
      .order('grade_level');

    if (!error && data) {
      const cloudSections: Section[] = data.map((r: any) => ({
        id: r.id,
        name: r.name,
        grade_level: r.grade_level,
        adviser_id: r.adviser_id,
        adviser_name: r.staff_profiles?.full_name || '',
        created_at: new Date().toISOString(),
      }));
      saveStoredSections(cloudSections.map(toFRSection));
      return cloudSections;
    }
  } catch (err) {
    console.warn('[Academics API] Sections fetch note:', err);
  }
  return local;
}

// ─── Section Subjects (Rule A: Many-to-Many) ────────────────────────────────

const LS_SECTION_SUBJECTS = 'srnhs_section_subjects_v1';

export function getLocalSectionSubjects(): SectionSubject[] {
  try {
    const raw = localStorage.getItem(LS_SECTION_SUBJECTS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveLocalSectionSubjects(list: SectionSubject[]): void {
  try {
    localStorage.setItem(LS_SECTION_SUBJECTS, JSON.stringify(list));
  } catch {}
}

export async function fetchSectionSubjects(sectionId: string): Promise<SectionSubject[]> {
  const local = getLocalSectionSubjects().filter(ss => ss.section_id === sectionId);
  if (!supabase || !isSupabaseConfigured || !isValidUUID(sectionId)) return local;

  try {
    const { data, error } = await supabase
      .from('section_subjects')
      .select('*, subjects(*)')
      .eq('section_id', sectionId);

    if (!error && data) {
      const mapped = data.map((r: any) => ({
        id: r.id,
        section_id: r.section_id,
        subject_id: r.subject_id,
        created_at: r.created_at,
        subject: r.subjects,
      }));
      // Merge into local cache
      const other = getLocalSectionSubjects().filter(ss => ss.section_id !== sectionId);
      saveLocalSectionSubjects([...other, ...mapped]);
      return mapped;
    }
  } catch (err) {
    console.warn('[Academics API] Section subjects fetch note:', err);
  }
  return local;
}

export async function assignSubjectToSection(sectionId: string, subjectId: string): Promise<void> {
  const local = getLocalSectionSubjects();
  const exists = local.some(ss => ss.section_id === sectionId && ss.subject_id === subjectId);
  if (!exists) {
    const newEntry: SectionSubject = {
      id: generateUUID(),
      section_id: sectionId,
      subject_id: subjectId,
      created_at: new Date().toISOString(),
    };
    saveLocalSectionSubjects([...local, newEntry]);
  }

  if (supabase && isSupabaseConfigured && isValidUUID(sectionId) && isValidUUID(subjectId)) {
    try {
      await supabase.from('section_subjects').upsert({
        section_id: sectionId,
        subject_id: subjectId,
      }, { onConflict: 'section_id,subject_id' });
    } catch (err) {
      console.warn('[Academics API] Subject assignment error:', err);
    }
  }
}

export async function removeSubjectFromSection(sectionId: string, subjectId: string): Promise<void> {
  // Check Rule B: if section has enrolled students and this is the last subject, block removal!
  const current = await fetchSectionSubjects(sectionId);
  if (current.length <= 1) {
    const students = getStoredStudents();
    const enrolledInSec = students.filter((s: { sectionId?: string }) => s.sectionId === sectionId).length;
    if (enrolledInSec > 0) {
      throw new Error(`Cannot remove the last subject from this section because ${enrolledInSec} student(s) are currently enrolled (Rule B).`);
    }
  }

  const local = getLocalSectionSubjects().filter(
    ss => !(ss.section_id === sectionId && ss.subject_id === subjectId)
  );
  saveLocalSectionSubjects(local);

  if (supabase && isSupabaseConfigured && isValidUUID(sectionId) && isValidUUID(subjectId)) {
    const { error } = await supabase
      .from('section_subjects')
      .delete()
      .eq('section_id', sectionId)
      .eq('subject_id', subjectId);

    if (error) {
      throw new Error(error.message);
    }
  }
}

// ─── Rule B Section Lock Checker ────────────────────────────────────────────

async function checkSectionLockedAsync(sectionId: string): Promise<{ locked: boolean; studentCount: number; reason?: string }> {
  const students = getStoredStudents();
  const count = students.filter((s: { sectionId?: string }) => s.sectionId === sectionId).length;

  if (count > 0) {
    return {
      locked: true,
      studentCount: count,
      reason: `Locked with ${count} enrolled student(s). Grade level, track/strand, and school year cannot be modified, and deletion is blocked (Rule B).`,
    };
  }

  if (supabase && isSupabaseConfigured && isValidUUID(sectionId)) {
    try {
      const { count: cloudCount, error } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('section_id', sectionId);

      if (!error && (cloudCount || 0) > 0) {
        return {
          locked: true,
          studentCount: cloudCount || 0,
          reason: `Locked with ${cloudCount} enrolled student(s) in cloud database (Rule B).`,
        };
      }
    } catch {
      return { locked: false, studentCount: 0 };
    }
  }

  return { locked: false, studentCount: 0 };
}

export function isSectionLocked(count: number): boolean;
export function isSectionLocked(sectionId: string): Promise<{ locked: boolean; studentCount: number; reason?: string }>;
export function isSectionLocked(
  input: string | number
): boolean | Promise<{ locked: boolean; studentCount: number; reason?: string }> {
  if (typeof input === 'number') {
    return input > 0;
  }
  return checkSectionLockedAsync(input);
}
