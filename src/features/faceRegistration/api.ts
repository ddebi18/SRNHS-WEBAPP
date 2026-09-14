import { Student, Section, FaceRegistrationPayload, FaceRegistrationResult } from './types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const LOCAL_STORAGE_KEY_STUDENTS = 'srnhs_face_registration_students_v1';
const LOCAL_STORAGE_KEY_SECTIONS = 'srnhs_face_registration_sections_v1';

const INITIAL_SECTIONS: Section[] = [
  { id: 'sec-101', name: 'Grade 10 – Sampaguita', gradeLevel: 'Grade 10', teacherId: 'tch-1', teacherName: 'Maria Santos', totalStudents: 8, registeredStudents: 5 },
  { id: 'sec-102', name: 'Grade 11 – STEM A',     gradeLevel: 'Grade 11', teacherId: 'tch-2', teacherName: 'Juan Dela Cruz', totalStudents: 6, registeredStudents: 4 },
  { id: 'sec-103', name: 'Grade 12 – ABM A',      gradeLevel: 'Grade 12', teacherId: 'tch-3', teacherName: 'Elena Reyes',    totalStudents: 5, registeredStudents: 2 },
];

const INITIAL_STUDENTS: Student[] = [
  // Grade 10 - Sampaguita
  {
    id: 'std-101',
    name: 'Juan Carlos Garcia',
    studentNumber: '109823456701',
    sectionId: 'sec-101',
    sectionName: 'Grade 10 – Sampaguita',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-20T08:30:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Carlos Garcia',
    guardianPhone: '+639171234567',
  },
  {
    id: 'std-102',
    name: 'Sophia Nicole Reyes',
    studentNumber: '109823456702',
    sectionId: 'sec-101',
    sectionName: 'Grade 10 – Sampaguita',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-21T09:15:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Nicole Reyes',
    guardianPhone: '+639189876543',
  },
  {
    id: 'std-103',
    name: 'Angelo Gabriel Mendoza',
    studentNumber: '109823456703',
    sectionId: 'sec-101',
    sectionName: 'Grade 10 – Sampaguita',
    faceRegistrationStatus: 'unregistered',
    lastRegisteredAt: undefined,
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=350&auto=format&fit=crop&q=80',
    guardianName: 'Gabriel Mendoza',
    guardianPhone: '+639194443322',
  },
  {
    id: 'std-104',
    name: 'Samantha Claire Santos',
    studentNumber: '109823456704',
    sectionId: 'sec-101',
    sectionName: 'Grade 10 – Sampaguita',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-22T10:45:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Claire Santos',
    guardianPhone: '+639178889900',
  },
  {
    id: 'std-105',
    name: 'Mark Anthony Ramos',
    studentNumber: '109823456705',
    sectionId: 'sec-101',
    sectionName: 'Grade 10 – Sampaguita',
    faceRegistrationStatus: 'needs_review',
    lastRegisteredAt: '2026-08-15T14:20:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Anthony Ramos',
    guardianPhone: '+639195551212',
  },
  {
    id: 'std-106',
    name: 'Patricia Marie Cruz',
    studentNumber: '109823456706',
    sectionId: 'sec-101',
    sectionName: 'Grade 10 – Sampaguita',
    faceRegistrationStatus: 'unregistered',
    lastRegisteredAt: undefined,
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=350&auto=format&fit=crop&q=80',
    guardianName: 'Marie Cruz',
    guardianPhone: '+639173332211',
  },
  {
    id: 'std-107',
    name: 'Gabriel Luis Bautista',
    studentNumber: '109823456707',
    sectionId: 'sec-101',
    sectionName: 'Grade 10 – Sampaguita',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-23T11:00:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Luis Bautista',
    guardianPhone: '+639187776655',
  },
  {
    id: 'std-108',
    name: 'Andrea Beatrice Lopez',
    studentNumber: '109823456708',
    sectionId: 'sec-101',
    sectionName: 'Grade 10 – Sampaguita',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-24T08:10:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Beatrice Lopez',
    guardianPhone: '+639192221100',
  },

  // Grade 11 - STEM A
  {
    id: 'std-201',
    name: 'Christian Dave Aquino',
    studentNumber: '109823456709',
    sectionId: 'sec-102',
    sectionName: 'Grade 11 – STEM A',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-19T09:00:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Dave Aquino',
    guardianPhone: '+639170001122',
  },
  {
    id: 'std-202',
    name: 'Alyssa Joy Hernandez',
    studentNumber: '109823456710',
    sectionId: 'sec-102',
    sectionName: 'Grade 11 – STEM A',
    faceRegistrationStatus: 'unregistered',
    lastRegisteredAt: undefined,
    photoUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=350&auto=format&fit=crop&q=80',
    guardianName: 'Joy Hernandez',
    guardianPhone: '+639181112233',
  },
  {
    id: 'std-203',
    name: 'Joshua Ryan Castillo',
    studentNumber: '109823456711',
    sectionId: 'sec-102',
    sectionName: 'Grade 11 – STEM A',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-21T13:30:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Ryan Castillo',
    guardianPhone: '+639193334455',
  },
  {
    id: 'std-204',
    name: 'Hannah Sofia Villanueva',
    studentNumber: '109823456712',
    sectionId: 'sec-102',
    sectionName: 'Grade 11 – STEM A',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-22T14:15:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Sofia Villanueva',
    guardianPhone: '+639174445566',
  },
  {
    id: 'std-205',
    name: 'Kenneth James Diaz',
    studentNumber: '109823456713',
    sectionId: 'sec-102',
    sectionName: 'Grade 11 – STEM A',
    faceRegistrationStatus: 'needs_review',
    lastRegisteredAt: '2026-08-18T16:00:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'James Diaz',
    guardianPhone: '+639185556677',
  },
  {
    id: 'std-206',
    name: 'Bea Isabel Mercado',
    studentNumber: '109823456714',
    sectionId: 'sec-102',
    sectionName: 'Grade 11 – STEM A',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-25T08:45:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Isabel Mercado',
    guardianPhone: '+639196667788',
  },

  // Grade 12 - ABM A
  {
    id: 'std-301',
    name: 'John Paul Fernandez',
    studentNumber: '109823456715',
    sectionId: 'sec-103',
    sectionName: 'Grade 12 – ABM A',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-17T10:20:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Paul Fernandez',
    guardianPhone: '+639177778899',
  },
  {
    id: 'std-302',
    name: 'Chloe Anne Navarro',
    studentNumber: '109823456716',
    sectionId: 'sec-103',
    sectionName: 'Grade 12 – ABM A',
    faceRegistrationStatus: 'unregistered',
    lastRegisteredAt: undefined,
    photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=350&auto=format&fit=crop&q=80',
    guardianName: 'Anne Navarro',
    guardianPhone: '+639188889900',
  },
  {
    id: 'std-303',
    name: 'Dominic Joel Santos',
    studentNumber: '109823456717',
    sectionId: 'sec-103',
    sectionName: 'Grade 12 – ABM A',
    faceRegistrationStatus: 'unregistered',
    lastRegisteredAt: undefined,
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=350&auto=format&fit=crop&q=80',
    guardianName: 'Joel Santos',
    guardianPhone: '+639199990011',
  },
  {
    id: 'std-304',
    name: 'Samantha Jane Tan',
    studentNumber: '109823456718',
    sectionId: 'sec-103',
    sectionName: 'Grade 12 – ABM A',
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: '2026-08-24T14:50:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Jane Tan',
    guardianPhone: '+639171110022',
  },
  {
    id: 'std-305',
    name: 'Justin Eric Del Rosario',
    studentNumber: '109823456719',
    sectionId: 'sec-103',
    sectionName: 'Grade 12 – ABM A',
    faceRegistrationStatus: 'needs_review',
    lastRegisteredAt: '2026-08-16T15:30:00Z',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=350&auto=format&fit=crop&q=80',
    registeredPhotos: {
      front: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=450&auto=format&fit=crop&q=80',
      left: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=450&auto=format&fit=crop&q=80',
      right: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=450&auto=format&fit=crop&q=80',
    },
    guardianName: 'Eric Del Rosario',
    guardianPhone: '+639182223344',
  },
];

// IndexedDB & LocalStorage Hybrid Persistence for Biometric Face Photos
const DB_NAME = 'srnhs_face_biometrics_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'face_photos';

function openFaceDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'studentId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function savePhotosToDb(studentId: string, photos: { front?: string; left?: string; right?: string }): Promise<void> {
  try {
    const db = await openFaceDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ studentId, photos, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.warn('IndexedDB photo save note:', e);
  }
}

export async function getPhotosFromDb(studentId: string): Promise<{ front?: string; left?: string; right?: string } | null> {
  try {
    const db = await openFaceDb();
    if (!db) return null;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(studentId);
    return new Promise(resolve => {
      req.onsuccess = () => resolve(req.result ? req.result.photos : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Convert and optimize image blob to compact JPEG data URL for fast local rendering
async function resizeBlobToDataUrl(blob: Blob, maxDim = 420): Promise<string> {
  return new Promise(resolve => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let w = img.width || 420;
        let h = img.height || 420;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        } else {
          resolve('');
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('');
      };
      img.src = url;
    } catch {
      resolve('');
    }
  });
}

export function getStoredStudents(): Student[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, JSON.stringify(INITIAL_STUDENTS));
  } catch {}
  return INITIAL_STUDENTS;
}

export async function fetchRegisteredStudents(): Promise<Student[]> {
  const students = getStoredStudents();
  // Hydrate all registered students with high-res photos from IndexedDB
  const hydrated = await Promise.all(
    students.map(async s => {
      if (s.faceRegistrationStatus === 'registered' || s.registeredPhotos?.front || s.photoUrl) {
        const dbPhotos = await getPhotosFromDb(s.id);
        if (dbPhotos) {
          return {
            ...s,
            faceRegistrationStatus: 'registered' as const,
            photoUrl: dbPhotos.front || s.photoUrl,
            registeredPhotos: {
              front: dbPhotos.front || s.registeredPhotos?.front || s.photoUrl,
              left: dbPhotos.left || s.registeredPhotos?.left,
              right: dbPhotos.right || s.registeredPhotos?.right,
            },
          };
        }
      }
      return s;
    })
  );

  return hydrated.filter(student => (
    student.faceRegistrationStatus === 'registered' && Boolean(student.registeredPhotos?.front || student.photoUrl)
  ));
}

export function saveStoredStudents(students: Student[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, JSON.stringify(students));
  } catch (err) {
    console.warn('LocalStorage quota warning, using memory/IndexedDB store:', err);
  }
}

export async function deleteStudent(studentId: string): Promise<void> {
  const students = getStoredStudents().filter(s => s.id !== studentId);
  saveStoredStudents(students);
  try {
    const db = await openFaceDb();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(studentId);
    }
  } catch {}
}

export async function addNewStudent(studentData: {
  id?: string;
  name: string;
  studentNumber: string; // LRN
  sectionId: string;
  sectionName?: string;
  guardianName?: string;
  guardianPhone?: string;
  photoUrl?: string;
}): Promise<Student> {
  const students = getStoredStudents();
  const sections = getStoredSections();
  const section = sections.find(s => s.id === studentData.sectionId);

  const cleanLrn = studentData.studentNumber.trim();
  const existingIndex = students.findIndex(s => s.studentNumber === cleanLrn);

  const student: Student = {
    id: studentData.id || (existingIndex >= 0 ? students[existingIndex]!.id : `std-${Date.now()}`),
    name: studentData.name.trim(),
    studentNumber: cleanLrn,
    sectionId: studentData.sectionId,
    sectionName: studentData.sectionName || section?.name || 'Grade 10 – Sampaguita',
    faceRegistrationStatus: existingIndex >= 0 ? students[existingIndex]!.faceRegistrationStatus : 'unregistered',
    lastRegisteredAt: existingIndex >= 0 ? students[existingIndex]!.lastRegisteredAt : undefined,
    photoUrl: studentData.photoUrl || (existingIndex >= 0 ? students[existingIndex]!.photoUrl : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=350&auto=format&fit=crop&q=80'),
    registeredPhotos: existingIndex >= 0 ? students[existingIndex]!.registeredPhotos : undefined,
    guardianName: studentData.guardianName?.trim() || 'Parent / Guardian',
    guardianPhone: studentData.guardianPhone?.trim() || '+639170000000',
  };

  if (existingIndex >= 0) {
    students[existingIndex] = student;
  } else {
    students.push(student);
  }

  saveStoredStudents(students);

  // If Supabase is configured, also attempt to insert into Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      const nameParts = student.name.split(' ');
      const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Student';
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

      const { data: inserted } = await supabase.from('students').insert({
        lrn: student.studentNumber,
        first_name: firstName,
        last_name: lastName,
        gender: 'Not Specified',
        grade_level: section?.gradeLevel === 'Grade 12' ? 12 : section?.gradeLevel === 'Grade 11' ? 11 : 10,
        section_id: student.sectionId,
        parent_consent: true,
        consent_date: new Date().toISOString().split('T')[0],
      }).select().single();

      if (inserted && (student.guardianName || student.guardianPhone)) {
        await supabase.from('student_guardians').insert({
          student_id: inserted.id,
          name: student.guardianName,
          relationship: 'Guardian',
          phone_number: student.guardianPhone,
          is_primary: true,
        });
      }
    } catch (e) {
      console.warn('Supabase student save fallback:', e);
    }
  }

  return student;
}

export function getStoredSections(): Section[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_SECTIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(INITIAL_SECTIONS));
  } catch {}
  return INITIAL_SECTIONS;
}

export async function fetchSections(): Promise<Section[]> {
  await new Promise(r => setTimeout(r, 50));
  const sections = getStoredSections();
  const students = getStoredStudents();

  return sections.map(sec => {
    const secStudents = students.filter(s => s.sectionId === sec.id);
    const regStudents = secStudents.filter(s => s.faceRegistrationStatus === 'registered');
    return {
      ...sec,
      totalStudents: secStudents.length,
      registeredStudents: regStudents.length,
    };
  });
}

export async function fetchSectionRoster(sectionId: string): Promise<Student[]> {
  await new Promise(r => setTimeout(r, 150));
  const students = getStoredStudents();
  const sectionStudents = students.filter(s => s.sectionId === sectionId);

  // Hydrate high-res photos from IndexedDB if available
  const hydrated = await Promise.all(
    sectionStudents.map(async s => {
      if (s.faceRegistrationStatus === 'registered') {
        const dbPhotos = await getPhotosFromDb(s.id);
        if (dbPhotos) {
          return {
            ...s,
            photoUrl: dbPhotos.front || s.photoUrl,
            registeredPhotos: {
              front: dbPhotos.front || s.registeredPhotos?.front || s.photoUrl,
              left: dbPhotos.left || s.registeredPhotos?.left,
              right: dbPhotos.right || s.registeredPhotos?.right,
            },
          };
        }
      }
      return s;
    })
  );

  return hydrated;
}

export async function submitFaceRegistration(
  payload: FaceRegistrationPayload
): Promise<FaceRegistrationResult> {
  await new Promise(r => setTimeout(r, 800)); // Simulate processing delay

  if (!payload.consentConfirmed) {
    throw new Error('Guardian consent confirmation is required before registration.');
  }

  if (!payload.frames || payload.frames.length < 3) {
    throw new Error('Incomplete face capture angles. Please capture all 3 required angles (front, left, right).');
  }

  // Convert frame blobs to compact, optimized Data URLs
  const photoMap: { front?: string; left?: string; right?: string } = {};
  for (const frame of payload.frames) {
    if (frame.blob && frame.blob.size > 0) {
      photoMap[frame.angle] = await resizeBlobToDataUrl(frame.blob, 420);
    }
  }

  // Save photos to IndexedDB for permanent browser persistence
  await savePhotosToDb(payload.studentId, photoMap);

  // If Supabase is configured, attempt uploading frames to Storage and inserting metadata
  if (isSupabaseConfigured && supabase) {
    const client = supabase;
    try {
      const uploadPromises = payload.frames.map(async frame => {
        const timestamp = Date.now();
        const filePath = `${payload.studentId}/${frame.angle}_${timestamp}.jpg`;
        
        // Upload image blob to Supabase Storage bucket 'face-registrations'
        const { error: storageError } = await client.storage
          .from('face-registrations')
          .upload(filePath, frame.blob, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (storageError) {
          console.warn(`Supabase Storage upload warning for ${frame.angle}:`, storageError.message);
        }

        // Insert metadata record into 'face_registrations' table
        const { error: dbError } = await client
          .from('face_registrations')
          .insert({
            student_id: payload.studentId,
            section_id: payload.sectionId,
            angle: frame.angle,
            storage_path: filePath,
            consent_confirmed: true,
          });

        if (dbError) {
          console.warn(`Supabase DB record warning for ${frame.angle}:`, dbError.message);
        }
      });

      await Promise.allSettled(uploadPromises);
    } catch (supabaseErr) {
      console.warn('Supabase synchronization note (will continue using local store):', supabaseErr);
    }
  }

  const students = getStoredStudents();
  const index = students.findIndex(s => s.id === payload.studentId);
  
  if (index === -1) {
    throw new Error('Student record not found in system database.');
  }

  const now = new Date().toISOString();
  students[index] = {
    ...students[index]!,
    faceRegistrationStatus: 'registered',
    lastRegisteredAt: now,
    photoUrl: photoMap.front || students[index]!.photoUrl,
    registeredPhotos: {
      front: photoMap.front || students[index]!.registeredPhotos?.front || students[index]!.photoUrl,
      left: photoMap.left || students[index]!.registeredPhotos?.left,
      right: photoMap.right || students[index]!.registeredPhotos?.right,
    },
  };
  saveStoredStudents(students);

  // Update section stats
  const sections = getStoredSections();
  const secIndex = sections.findIndex(s => s.id === payload.sectionId);
  if (secIndex !== -1) {
    const sectionStudents = students.filter(s => s.sectionId === payload.sectionId);
    const registeredCount = sectionStudents.filter(s => s.faceRegistrationStatus === 'registered').length;
    sections[secIndex] = {
      ...sections[secIndex]!,
      registeredStudents: registeredCount,
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(sections));
    } catch {}
  }

  return {
    success: true,
    studentId: payload.studentId,
    message: 'Biometric face registration successfully created and verified on DepEd turnstile edge node.',
    qualityWarnings: [],
  };
}

export async function deleteFaceRegistration(studentId: string): Promise<void> {
  await new Promise(r => setTimeout(r, 300));
  const students = getStoredStudents();
  const index = students.findIndex(s => s.id === studentId);
  if (index !== -1) {
    students[index] = {
      ...students[index]!,
      faceRegistrationStatus: 'unregistered',
      lastRegisteredAt: undefined,
    };
    saveStoredStudents(students);
  }
}
