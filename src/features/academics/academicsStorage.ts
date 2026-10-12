import { Room, Subject, Section } from '@/types/domain.types';
import { Section as FRSection } from '@/features/faceRegistration/types';
import {
  getStoredSections,
  saveStoredSections,
  getStoredStudents,
  generateUUID,
} from '@/features/faceRegistration/api';

export const LS_ROOMS = 'srnhs_academics_rooms_v1';
export const LS_SUBJECTS = 'srnhs_academics_subjects_v1';

export function getStoredRooms(): Room[] {
  try {
    const raw = localStorage.getItem(LS_ROOMS);
    if (raw) return JSON.parse(raw);
  } catch { }
  return [];
}

export function saveRooms(rooms: Room[]) {
  try {
    localStorage.setItem(LS_ROOMS, JSON.stringify(rooms));
  } catch { }
}

export function getStoredSubjects(): Subject[] {
  try {
    const raw = localStorage.getItem(LS_SUBJECTS);
    if (raw) return JSON.parse(raw);
  } catch { }
  return [];
}

export function saveSubjects(subjects: Subject[]) {
  try {
    localStorage.setItem(LS_SUBJECTS, JSON.stringify(subjects));
  } catch { }
}

export function toFRSection(sec: Section): FRSection {
  return {
    id: sec.id,
    name: sec.name,
    gradeLevel: `Grade ${sec.grade_level}`,
    teacherId: sec.adviser_id || '',
    teacherName: sec.adviser_name || 'Unassigned',
    totalStudents: 0,
    registeredStudents: 0,
  };
}

export const GRADE_LEVELS = [7, 8, 9, 10, 11, 12];

export { getStoredSections, saveStoredSections, getStoredStudents, generateUUID };
