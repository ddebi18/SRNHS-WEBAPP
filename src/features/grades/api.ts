import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Grade, StudentQuarterGrades } from '@/types/domain.types';
import { isValidUUID, getStoredStudents } from '@/features/faceRegistration/api';
import {
  computeFinalRating,
  getGradeRemark,
  computeGeneralAverage,
} from './lib/gradeCalculations';

const LS_GRADES_KEY = 'srnhs_grades_v1';

export function getLocalGrades(): Grade[] {
  try {
    const raw = localStorage.getItem(LS_GRADES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveLocalGrades(grades: Grade[]): void {
  try {
    localStorage.setItem(LS_GRADES_KEY, JSON.stringify(grades));
  } catch {}
}

export async function fetchGrades(
  sectionId: string,
  subjectId: string,
  schoolYearId?: string
): Promise<Grade[]> {
  const local = getLocalGrades().filter(
    g => g.section_id === sectionId && g.subject_id === subjectId && (!schoolYearId || g.school_year_id === schoolYearId)
  );

  if (!supabase || !isSupabaseConfigured || !isValidUUID(sectionId) || !isValidUUID(subjectId)) {
    return local;
  }

  try {
    let query = supabase
      .from('grades')
      .select('*')
      .eq('section_id', sectionId)
      .eq('subject_id', subjectId);

    if (schoolYearId && isValidUUID(schoolYearId)) {
      query = query.eq('school_year_id', schoolYearId);
    }

    const { data, error } = await query;
    if (!error && data) {
      // Merge with local state
      const cloudGrades: Grade[] = data.map((row: any) => ({
        id: row.id,
        student_id: row.student_id,
        subject_id: row.subject_id,
        section_id: row.section_id,
        school_year_id: row.school_year_id,
        quarter: row.quarter,
        grade: Number(row.grade),
        is_published: !!row.is_published,
        recorded_by: row.recorded_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      return cloudGrades;
    }
  } catch (err) {
    console.warn('[Grades API] Supabase fetch error, fallback to local:', err);
  }

  return local;
}

export async function saveGrades(
  gradesPayload: {
    student_id: string;
    subject_id: string;
    section_id: string;
    school_year_id?: string | null;
    quarter: 1 | 2 | 3 | 4;
    grade: number;
    is_published?: boolean;
    recorded_by?: string | null;
  }[]
): Promise<void> {
  if (!gradesPayload || gradesPayload.length === 0) return;

  // 1. Update local cache
  const local = getLocalGrades();
  const updatedLocal = [...local];

  for (const item of gradesPayload) {
    const existingIndex = updatedLocal.findIndex(
      g =>
        g.student_id === item.student_id &&
        g.subject_id === item.subject_id &&
        g.quarter === item.quarter &&
        (!item.school_year_id || g.school_year_id === item.school_year_id)
    );

    const record: Grade = {
      id: existingIndex >= 0 ? updatedLocal[existingIndex]!.id : `grd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      student_id: item.student_id,
      subject_id: item.subject_id,
      section_id: item.section_id,
      school_year_id: item.school_year_id || null,
      quarter: item.quarter,
      grade: item.grade,
      is_published: item.is_published ?? (existingIndex >= 0 ? updatedLocal[existingIndex]!.is_published : false),
      recorded_by: item.recorded_by || null,
      updated_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      updatedLocal[existingIndex] = record;
    } else {
      updatedLocal.push(record);
    }
  }

  saveLocalGrades(updatedLocal);

  // 2. Persist to Supabase if configured
  if (supabase && isSupabaseConfigured) {
    try {
      const recordsToUpsert = gradesPayload
        .filter(item => isValidUUID(item.student_id) && isValidUUID(item.subject_id) && isValidUUID(item.section_id))
        .map(item => ({
          student_id: item.student_id,
          subject_id: item.subject_id,
          section_id: item.section_id,
          school_year_id: (item.school_year_id && isValidUUID(item.school_year_id)) ? item.school_year_id : null,
          quarter: item.quarter,
          grade: item.grade,
          is_published: item.is_published ?? false,
          recorded_by: (item.recorded_by && isValidUUID(item.recorded_by)) ? item.recorded_by : null,
          updated_at: new Date().toISOString(),
        }));

      if (recordsToUpsert.length > 0) {
        const { error } = await supabase
          .from('grades')
          .upsert(recordsToUpsert, {
            onConflict: 'student_id,subject_id,school_year_id,quarter',
          });

        if (error) {
          console.warn('[Grades API] Supabase upsert error:', error.message);
        }
      }
    } catch (err) {
      console.warn('[Grades API] Exception upserting grades:', err);
    }
  }
}

export async function setQuarterPublicationStatus(
  sectionId: string,
  subjectId: string,
  quarter: 1 | 2 | 3 | 4,
  isPublished: boolean
): Promise<void> {
  const local = getLocalGrades();
  const updated = local.map(g => {
    if (g.section_id === sectionId && g.subject_id === subjectId && g.quarter === quarter) {
      return { ...g, is_published: isPublished, updated_at: new Date().toISOString() };
    }
    return g;
  });
  saveLocalGrades(updated);

  if (supabase && isSupabaseConfigured && isValidUUID(sectionId) && isValidUUID(subjectId)) {
    try {
      await supabase
        .from('grades')
        .update({ is_published: isPublished, updated_at: new Date().toISOString() })
        .eq('section_id', sectionId)
        .eq('subject_id', subjectId)
        .eq('quarter', quarter);
    } catch (err) {
      console.warn('[Grades API] Publication status update error:', err);
    }
  }
}

export async function fetchHydratedQuarterGrades(
  sectionId: string,
  subjectId: string,
  schoolYearId?: string
): Promise<StudentQuarterGrades[]> {
  const students = getStoredStudents().filter(
    (s: any) => s.sectionId === sectionId || s.section_id === sectionId
  );
  const grades = await fetchGrades(sectionId, subjectId, schoolYearId);

  return students.map((s: any) => {
    const studentGrades = grades.filter(g => g.student_id === s.id);
    const q1Obj = studentGrades.find(g => g.quarter === 1);
    const q2Obj = studentGrades.find(g => g.quarter === 2);
    const q3Obj = studentGrades.find(g => g.quarter === 3);
    const q4Obj = studentGrades.find(g => g.quarter === 4);

    const q1 = q1Obj ? q1Obj.grade : null;
    const q2 = q2Obj ? q2Obj.grade : null;
    const q3 = q3Obj ? q3Obj.grade : null;
    const q4 = q4Obj ? q4Obj.grade : null;

    const finalRating = computeFinalRating(q1, q2, q3, q4);
    const remark = getGradeRemark(finalRating);
    const is_published = !!(q1Obj?.is_published || q2Obj?.is_published || q3Obj?.is_published || q4Obj?.is_published);

    return {
      student_id: s.id,
      student_name: s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student',
      lrn: s.studentNumber || s.lrn || '—',
      q1,
      q2,
      q3,
      q4,
      final_rating: finalRating,
      remark,
      is_published,
    };
  });
}

export async function fetchGeneralAverages(
  sectionId: string,
  schoolYearId?: string
): Promise<{
  student_id: string;
  student_name: string;
  lrn: string;
  general_average: number | null;
  subject_ratings: { subject_id: string; final_rating: number | null }[];
  is_complete: boolean;
}[]> {
  const students = getStoredStudents().filter(
    (s: any) => s.sectionId === sectionId || s.section_id === sectionId
  );
  const allGrades = getLocalGrades().filter(
    g => g.section_id === sectionId && (!schoolYearId || g.school_year_id === schoolYearId)
  );

  return students.map((s: any) => {
    const studentGrades = allGrades.filter(g => g.student_id === s.id);
    // Group by subject_id
    const subjectMap: Record<string, { q1?: number; q2?: number; q3?: number; q4?: number }> = {};
    for (const g of studentGrades) {
      if (!subjectMap[g.subject_id]) subjectMap[g.subject_id] = {};
      if (g.quarter === 1) subjectMap[g.subject_id]!.q1 = g.grade;
      if (g.quarter === 2) subjectMap[g.subject_id]!.q2 = g.grade;
      if (g.quarter === 3) subjectMap[g.subject_id]!.q3 = g.grade;
      if (g.quarter === 4) subjectMap[g.subject_id]!.q4 = g.grade;
    }

    const subjectRatings = Object.entries(subjectMap).map(([subject_id, quarters]) => ({
      subject_id,
      final_rating: computeFinalRating(quarters.q1, quarters.q2, quarters.q3, quarters.q4),
    }));

    const finalRatingsList = subjectRatings.map(sr => sr.final_rating);
    const genAvg = computeGeneralAverage(finalRatingsList, false);
    const isComplete = subjectRatings.length > 0 && subjectRatings.every(sr => sr.final_rating !== null);

    return {
      student_id: s.id,
      student_name: s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student',
      lrn: s.studentNumber || s.lrn || '—',
      general_average: genAvg,
      subject_ratings: subjectRatings,
      is_complete: isComplete,
    };
  });
}
