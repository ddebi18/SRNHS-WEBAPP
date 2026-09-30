import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  Section,
  Subject,
  Room,
  StaffProfile,
  TeacherAssignment,
  TeachingAssignmentInput,
} from '@/types/domain.types';

// ── Query Keys ──────────────────────────────────────────────────────────────
export const facultyKeys = {
  all: ['faculty'] as const,
  teachers: () => [...facultyKeys.all, 'teachers'] as const,
  sections: () => ['sections'] as const,
  subjects: () => ['subjects'] as const,
  rooms: () => ['rooms'] as const,
  assignments: () => ['teaching_assignments'] as const,
};

// ── Fallback Seed Data ──────────────────────────────────────────────────────
const FALLBACK_SUBJECTS: Subject[] = [
  { id: 'sub-1', title: 'General Mathematics', name: 'General Mathematics', code: 'GEN-MATH', created_at: '' },
  { id: 'sub-2', title: 'Science & Technology', name: 'Science & Technology', code: 'SCI-TECH', created_at: '' },
  { id: 'sub-3', title: 'English for Academic & Professional Purposes', name: 'English for Academic & Professional Purposes', code: 'EAPP', created_at: '' },
  { id: 'sub-4', title: 'Filipino: Komunikasyon at Pananaliksik', name: 'Filipino: Komunikasyon at Pananaliksik', code: 'FIL-KOM', created_at: '' },
  { id: 'sub-5', title: 'Physical Education and Health', name: 'Physical Education and Health', code: 'PE-HEALTH', created_at: '' },
  { id: 'sub-6', title: 'Empowerment Technologies (ICT)', name: 'Empowerment Technologies (ICT)', code: 'EMP-TECH', created_at: '' },
];

const FALLBACK_ROOMS: Room[] = [
  { id: 'rm-1', name: 'Room 101', building: 'Building A', capacity: 45, created_at: '' },
  { id: 'rm-2', name: 'Room 102', building: 'Building A', capacity: 45, created_at: '' },
  { id: 'rm-3', name: 'Room 201', building: 'Building B', capacity: 45, created_at: '' },
  { id: 'rm-4', name: 'Science Laboratory', building: 'Main Building', capacity: 50, created_at: '' },
  { id: 'rm-5', name: 'Computer Laboratory', building: 'ICT Building', capacity: 40, created_at: '' },
  { id: 'rm-6', name: 'School Gymnasium', building: 'Sports Complex', capacity: 200, created_at: '' },
];

// ── 1. Fetch Teachers ────────────────────────────────────────────────────────
export async function fetchTeachers(): Promise<StaffProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, email, full_name, role, department, is_active, created_at, updated_at')
    .eq('role', 'teacher')
    .eq('is_active', true)
    .order('full_name');

  if (error) throw new Error(error.message);
  return (data as StaffProfile[]) || [];
}

export function useTeachers() {
  return useQuery({
    queryKey: facultyKeys.teachers(),
    queryFn: fetchTeachers,
  });
}

// ── 2. Fetch Sections ────────────────────────────────────────────────────────
export async function fetchSections(): Promise<Section[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sections')
    .select(`
      id,
      name,
      grade_level,
      adviser_id,
      created_at,
      adviser:staff_profiles!sections_adviser_id_fkey(id, full_name, email)
    `)
    .order('grade_level')
    .order('name');

  if (error) {
    // If the foreign key alias fails, fallback to simple select
    const fallback = await supabase
      .from('sections')
      .select('id, name, grade_level, adviser_id, created_at')
      .order('grade_level')
      .order('name');
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data as Section[]) || [];
  }

  return ((data as any[]) || []).map(row => ({
    id: row.id,
    name: row.name,
    grade_level: row.grade_level,
    adviser_id: row.adviser_id,
    adviser_name: row.adviser?.full_name || undefined,
    created_at: row.created_at,
  }));
}

export function useSections() {
  return useQuery({
    queryKey: facultyKeys.sections(),
    queryFn: fetchSections,
  });
}

// ── 3. Fetch Subjects ────────────────────────────────────────────────────────
export async function fetchSubjects(): Promise<Subject[]> {
  if (!supabase) return FALLBACK_SUBJECTS;
  const { data, error } = await supabase
    .from('subjects')
    .select('id, title, code, description, created_at')
    .order('title');

  if (error) {
    console.warn('[faculty api] subjects table query failed, using baseline:', error.message);
    return FALLBACK_SUBJECTS;
  }
  if (!data || data.length === 0) {
    return FALLBACK_SUBJECTS;
  }
  return data.map((s: any) => ({
    id: s.id,
    title: s.title || s.name || 'Untitled Subject',
    name: s.name || s.title || 'Untitled Subject',
    code: s.code || null,
    description: s.description,
    created_at: s.created_at,
  }));
}

export function useSubjects() {
  return useQuery({
    queryKey: facultyKeys.subjects(),
    queryFn: fetchSubjects,
  });
}

// ── 4. Fetch Rooms ───────────────────────────────────────────────────────────
export async function fetchRooms(): Promise<Room[]> {
  if (!supabase) return FALLBACK_ROOMS;
  const { data, error } = await supabase
    .from('rooms')
    .select('id, name, building, capacity, created_at')
    .order('name');

  if (error) {
    console.warn('[faculty api] rooms table query failed, using baseline:', error.message);
    return FALLBACK_ROOMS;
  }
  if (!data || data.length === 0) {
    return FALLBACK_ROOMS;
  }
  return data as Room[];
}

export function useRooms() {
  return useQuery({
    queryKey: facultyKeys.rooms(),
    queryFn: fetchRooms,
  });
}

// ── 5. Fetch Teaching Assignments ───────────────────────────────────────────
export async function fetchTeachingAssignments(): Promise<TeacherAssignment[]> {
  if (!supabase) return [];

  // Query with relational joins
  const { data, error } = await supabase
    .from('teaching_assignments')
    .select(`
      id,
      teacher_id,
      section_id,
      subject_id,
      room_id,
      days,
      start_time,
      end_time,
      created_at,
      teacher:staff_profiles!teaching_assignments_teacher_id_fkey(id, full_name, email),
      section:sections!teaching_assignments_section_id_fkey(id, name, grade_level),
      subject:subjects!teaching_assignments_subject_id_fkey(id, title, code),
      room:rooms!teaching_assignments_room_id_fkey(id, name, building)
    `)
    .order('start_time');

  if (error) {
    // If table doesn't exist yet (before migration push), return empty array
    if (error.message?.includes('teaching_assignments') || error.code === '42P01') {
      console.info('[faculty api] teaching_assignments table not ready yet, run `supabase db push`');
      return [];
    }

    // Try a simple select without aliases if join alias failed
    const simple = await supabase
      .from('teaching_assignments')
      .select('*')
      .order('start_time');

    if (simple.error) {
      console.warn('[faculty api] fetchTeachingAssignments error:', simple.error.message);
      return [];
    }

    return (simple.data || []).map((row: any) => ({
      id: row.id,
      teacher_id: row.teacher_id,
      section_id: row.section_id,
      subject_id: row.subject_id,
      room_id: row.room_id,
      days: row.days || [],
      schedule_day: (row.days || []).join(', '),
      start_time: row.start_time,
      end_time: row.end_time,
      created_at: row.created_at,
    }));
  }

  return ((data as any[]) || []).map(row => {
    const secName = row.section ? `Grade ${row.section.grade_level} - ${row.section.name}` : undefined;
    const roomName = row.room ? `${row.room.name} (${row.room.building})` : undefined;
    const subjTitle = row.subject?.title || row.subject?.name;

    return {
      id: row.id,
      teacher_id: row.teacher_id,
      teacher_name: row.teacher?.full_name,
      teacher_email: row.teacher?.email,
      section_id: row.section_id,
      section_name: secName,
      grade_level: row.section?.grade_level,
      subject_id: row.subject_id,
      subject_title: subjTitle,
      subject_code: row.subject?.code,
      room_id: row.room_id,
      room_name: roomName,
      room_building: row.room?.building,
      days: row.days || [],
      schedule_day: (row.days || []).join(', '),
      start_time: row.start_time,
      end_time: row.end_time,
      created_at: row.created_at,
    };
  });
}

export function useTeachingAssignments() {
  return useQuery({
    queryKey: facultyKeys.assignments(),
    queryFn: fetchTeachingAssignments,
  });
}

// ── 6. Create Assignment Mutation ───────────────────────────────────────────
export function useCreateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TeachingAssignmentInput) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('teaching_assignments')
        .insert({
          teacher_id: input.teacher_id,
          section_id: input.section_id,
          subject_id: input.subject_id,
          room_id: input.room_id,
          days: input.days,
          start_time: input.start_time,
          end_time: input.end_time,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: facultyKeys.assignments() });
    },
  });
}

// ── 7. Update Assignment Mutation ───────────────────────────────────────────
export function useUpdateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: TeachingAssignmentInput & { id: string }) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('teaching_assignments')
        .update({
          teacher_id: input.teacher_id,
          section_id: input.section_id,
          subject_id: input.subject_id,
          room_id: input.room_id,
          days: input.days,
          start_time: input.start_time,
          end_time: input.end_time,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: facultyKeys.assignments() });
    },
  });
}

// ── 8. Delete Assignment Mutation ───────────────────────────────────────────
export function useDeleteAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { error } = await supabase
        .from('teaching_assignments')
        .delete()
        .eq('id', id);

      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: facultyKeys.assignments() });
    },
  });
}

// ── 9. Assign Section Adviser Mutation ──────────────────────────────────────
export function useAssignAdviser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sectionId,
      adviserId,
    }: {
      sectionId: string;
      adviserId: string | null;
    }) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { error } = await supabase
        .from('sections')
        .update({ adviser_id: adviserId })
        .eq('id', sectionId);

      if (error) throw new Error(error.message);
      return { sectionId, adviserId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: facultyKeys.sections() });
      queryClient.invalidateQueries({ queryKey: facultyKeys.assignments() });
    },
  });
}
