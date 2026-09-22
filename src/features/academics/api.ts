import { Room, Subject } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isValidUUID, generateUUID } from '@/features/faceRegistration/api';

const LS_ROOMS = 'srnhs_academics_rooms_v1';
const LS_SUBJECTS = 'srnhs_academics_subjects_v1';

// Seed initial rooms and subjects for local demo fallback
const INITIAL_ROOMS: Room[] = [
  { id: '4034821a-e87f-449e-b9b5-6f6a73c1d001', name: 'Room 101', building: 'Main Building', capacity: 45, created_at: new Date().toISOString() },
  { id: '4034821a-e87f-449e-b9b5-6f6a73c1d002', name: 'Room 204 (Science Lab)', building: 'Building A', capacity: 40, created_at: new Date().toISOString() },
  { id: '4034821a-e87f-449e-b9b5-6f6a73c1d003', name: 'Computer Lab 1', building: 'ICT Building', capacity: 50, created_at: new Date().toISOString() },
  { id: '4034821a-e87f-449e-b9b5-6f6a73c1d004', name: 'Turnstile Gate 01', building: 'Campus Entrance', capacity: 100, created_at: new Date().toISOString() },
];

const INITIAL_SUBJECTS: Subject[] = [
  { id: '6a42c388-7f9a-4c91-a589-91efd368e001', code: 'MATH-10', title: 'General Mathematics', description: 'Functions, business math, and logic', created_at: new Date().toISOString() },
  { id: '6a42c388-7f9a-4c91-a589-91efd368e002', code: 'ENG-10', title: 'English Communication', description: 'Literature and communicative English', created_at: new Date().toISOString() },
  { id: '6a42c388-7f9a-4c91-a589-91efd368e003', code: 'SCI-10', title: 'Integrated Science', description: 'Biology, physics, and earth sciences', created_at: new Date().toISOString() },
  { id: '6a42c388-7f9a-4c91-a589-91efd368e004', code: 'FIL-10', title: 'Filipino Panitikan', description: 'Panitikang Pilipino at gramatika', created_at: new Date().toISOString() },
];

// Helper: load local
export function getLocalRooms(): Room[] {
  try {
    const raw = localStorage.getItem(LS_ROOMS);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(LS_ROOMS, JSON.stringify(INITIAL_ROOMS));
  return INITIAL_ROOMS;
}

export function saveLocalRooms(rooms: Room[]): void {
  try { localStorage.setItem(LS_ROOMS, JSON.stringify(rooms)); } catch {}
}

export function getLocalSubjects(): Subject[] {
  try {
    const raw = localStorage.getItem(LS_SUBJECTS);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(LS_SUBJECTS, JSON.stringify(INITIAL_SUBJECTS));
  return INITIAL_SUBJECTS;
}

export function saveLocalSubjects(subjects: Subject[]): void {
  try { localStorage.setItem(LS_SUBJECTS, JSON.stringify(subjects)); } catch {}
}

// ── Rooms API ────────────────────────────────────────────────────────────────
export async function fetchRooms(): Promise<Room[]> {
  const local = getLocalRooms();
  if (!supabase || !isSupabaseConfigured) return local;

  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('[Academics API] Supabase fetch rooms note:', error.message);
      return local;
    }

    if (data && data.length > 0) {
      const mapped: Room[] = data.map(r => ({
        id: r.id,
        name: r.name,
        building: r.building,
        capacity: r.capacity || 40,
        created_at: r.created_at,
      }));
      saveLocalRooms(mapped);
      return mapped;
    } else {
      // If table is empty in cloud, push local seeds to Supabase
      for (const r of local) {
        await supabase.from('rooms').upsert({
          id: isValidUUID(r.id) ? r.id : generateUUID(),
          name: r.name,
          building: r.building,
          capacity: r.capacity,
        });
      }
      return local;
    }
  } catch (err) {
    console.warn('[Academics API] Network note:', err);
    return local;
  }
}

export async function createRoom(room: Omit<Room, 'id' | 'created_at'>): Promise<Room> {
  const newRoom: Room = {
    id: generateUUID(),
    name: room.name.trim(),
    building: room.building.trim(),
    capacity: room.capacity || 40,
    created_at: new Date().toISOString(),
  };

  // Update local
  const current = getLocalRooms();
  saveLocalRooms([newRoom, ...current]);

  // Persist to Supabase
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          id: newRoom.id,
          name: newRoom.name,
          building: newRoom.building,
          capacity: newRoom.capacity,
        })
        .select()
        .single();
      if (!error && data) {
        return {
          id: data.id,
          name: data.name,
          building: data.building,
          capacity: data.capacity,
          created_at: data.created_at,
        };
      }
    } catch (err) {
      console.warn('[Academics API] Error inserting room to Supabase:', err);
    }
  }

  return newRoom;
}

export async function updateRoom(room: Room): Promise<Room> {
  const current = getLocalRooms();
  const updated = current.map(r => (r.id === room.id ? room : r));
  saveLocalRooms(updated);

  if (supabase && isSupabaseConfigured && isValidUUID(room.id)) {
    try {
      await supabase
        .from('rooms')
        .update({
          name: room.name,
          building: room.building,
          capacity: room.capacity,
        })
        .eq('id', room.id);
    } catch (err) {
      console.warn('[Academics API] Error updating room in Supabase:', err);
    }
  }

  return room;
}

export async function deleteRoom(id: string): Promise<void> {
  const current = getLocalRooms();
  saveLocalRooms(current.filter(r => r.id !== id));

  if (supabase && isSupabaseConfigured && isValidUUID(id)) {
    try {
      await supabase.from('rooms').delete().eq('id', id);
    } catch (err) {
      console.warn('[Academics API] Error deleting room from Supabase:', err);
    }
  }
}

// ── Subjects API ─────────────────────────────────────────────────────────────
export async function fetchSubjects(): Promise<Subject[]> {
  const local = getLocalSubjects();
  if (!supabase || !isSupabaseConfigured) return local;

  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .order('code', { ascending: true });

    if (error) {
      console.warn('[Academics API] Supabase fetch subjects note:', error.message);
      return local;
    }

    if (data && data.length > 0) {
      const mapped: Subject[] = data.map(s => ({
        id: s.id,
        code: s.code,
        title: s.title,
        description: s.description || undefined,
        created_at: s.created_at,
      }));
      saveLocalSubjects(mapped);
      return mapped;
    } else {
      // If table is empty in cloud, push local seeds to Supabase
      for (const s of local) {
        await supabase.from('subjects').upsert({
          id: isValidUUID(s.id) ? s.id : generateUUID(),
          code: s.code,
          title: s.title,
          description: s.description || null,
        });
      }
      return local;
    }
  } catch (err) {
    console.warn('[Academics API] Network note:', err);
    return local;
  }
}

export async function createSubject(subject: Omit<Subject, 'id' | 'created_at'>): Promise<Subject> {
  const newSubject: Subject = {
    id: generateUUID(),
    code: subject.code.trim().toUpperCase(),
    title: subject.title.trim(),
    description: subject.description?.trim() || undefined,
    created_at: new Date().toISOString(),
  };

  const current = getLocalSubjects();
  saveLocalSubjects([newSubject, ...current]);

  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .insert({
          id: newSubject.id,
          code: newSubject.code,
          title: newSubject.title,
          description: newSubject.description || null,
        })
        .select()
        .single();
      if (!error && data) {
        return {
          id: data.id,
          code: data.code,
          title: data.title,
          description: data.description || undefined,
          created_at: data.created_at,
        };
      }
    } catch (err) {
      console.warn('[Academics API] Error inserting subject to Supabase:', err);
    }
  }

  return newSubject;
}

export async function updateSubject(subject: Subject): Promise<Subject> {
  const current = getLocalSubjects();
  const updated = current.map(s => (s.id === subject.id ? subject : s));
  saveLocalSubjects(updated);

  if (supabase && isSupabaseConfigured && isValidUUID(subject.id)) {
    try {
      await supabase
        .from('subjects')
        .update({
          code: subject.code,
          title: subject.title,
          description: subject.description || null,
        })
        .eq('id', subject.id);
    } catch (err) {
      console.warn('[Academics API] Error updating subject in Supabase:', err);
    }
  }

  return subject;
}

export async function deleteSubject(id: string): Promise<void> {
  const current = getLocalSubjects();
  saveLocalSubjects(current.filter(s => s.id !== id));

  if (supabase && isSupabaseConfigured && isValidUUID(id)) {
    try {
      await supabase.from('subjects').delete().eq('id', id);
    } catch (err) {
      console.warn('[Academics API] Error deleting subject from Supabase:', err);
    }
  }
}
