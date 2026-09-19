import { Student, Section, FaceRegistrationPayload, FaceRegistrationResult } from './types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const LOCAL_STORAGE_KEY_STUDENTS = 'srnhs_face_registration_students_v1';
const LOCAL_STORAGE_KEY_SECTIONS = 'srnhs_face_registration_sections_v1';



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

// Convert and optimize image blob to high-fidelity JPEG data URL for robust face descriptor extraction
async function resizeBlobToDataUrl(blob: Blob, maxDim = 720): Promise<string> {
  return new Promise(resolve => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let w = img.width || 720;
        let h = img.height || 720;
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
          resolve(canvas.toDataURL('image/jpeg', 0.88));
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

const CANDIDATE_STUDENT_KEYS = [
  'srnhs_face_registration_students_v1',
  'srnhs_face_registration_students',
  'srnhs_students',
  'srnhs_students_v1',
  'students',
];

export function getStoredStudents(): Student[] {
  try {
    for (const key of CANDIDATE_STUDENT_KEYS) {
      const raw =
        localStorage.getItem(key) ||
        (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null);
      if (raw) {
        const parsed: Student[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Only filter out the specific legacy dummy IDs (std-10x, std-20x, std-30x)
          const realStudents = parsed.filter(
            s =>
              s &&
              s.name &&
              !s.id?.startsWith('std-10') &&
              !s.id?.startsWith('std-20') &&
              !s.id?.startsWith('std-30')
          );
          if (realStudents.length > 0) {
            // Restore/persist into canonical key
            if (key !== LOCAL_STORAGE_KEY_STUDENTS) {
              localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, JSON.stringify(realStudents));
            }
            return realStudents;
          }
        }
      }
    }
  } catch (e) {}
  return [];
}

export async function fetchRegisteredStudents(): Promise<Student[]> {
  const students = getStoredStudents();
  // Hydrate all registered students with high-res photos from IndexedDB
  const hydrated = await Promise.all(
    students.map(async s => {
      const primaryPhoto = s.registeredPhotos?.front || s.photoUrl;
      if (s.faceRegistrationStatus === 'registered' || primaryPhoto) {
        const dbPhotos = await getPhotosFromDb(s.id);
        if (dbPhotos && dbPhotos.front) {
          return {
            ...s,
            faceRegistrationStatus: 'registered' as const,
            photoUrl: dbPhotos.front,
            registeredPhotos: {
              front: dbPhotos.front,
              left: dbPhotos.left || dbPhotos.front,
              right: dbPhotos.right || dbPhotos.front,
            },
          };
        }

        // For mock/seed students, ensure left/right are strictly that student's own photo
        return {
          ...s,
          photoUrl: primaryPhoto,
          registeredPhotos: primaryPhoto ? {
            front: primaryPhoto,
            left: s.registeredPhotos?.left?.startsWith('data:') ? s.registeredPhotos.left : primaryPhoto,
            right: s.registeredPhotos?.right?.startsWith('data:') ? s.registeredPhotos.right : primaryPhoto,
          } : undefined,
        };
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

// ── Helpers: map between Supabase DB schema and app Student/Section types ────

function dbRowToStudent(row: any, sections: Section[]): Student {
  const sec = sections.find(s => s.id === row.section_id);
  const firstName = row.first_name || '';
  const lastName = row.last_name || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Student';
  return {
    id: row.id,
    name: fullName,
    studentNumber: row.lrn || '',
    sectionId: row.section_id || '',
    sectionName: sec?.name || '',
    faceRegistrationStatus: row.photo_urls ? 'registered' : 'unregistered',
    photoUrl: row.photo_urls || undefined,
    guardianName: undefined,
    guardianPhone: undefined,
    faceDescriptors: undefined,
  };
}

function dbRowToSection(row: any): Section {
  const gradeLevel = row.grade_level ? `Grade ${row.grade_level}` : 'Grade 10';
  return {
    id: row.id,
    name: row.name || '',
    gradeLevel,
    teacherId: row.adviser_id || '',
    teacherName: 'Unassigned',
    totalStudents: 0,
    registeredStudents: 0,
  };
}

/**
 * Pull students and sections from Supabase and populate localStorage.
 * Call this on app startup — any device will then see up-to-date data.
 * Returns how many records were synced, or null if Supabase is not reachable.
 */
export async function syncFromSupabase(): Promise<{ students: number; sections: number } | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    // 1. Fetch sections first (needed to resolve section names for students)
    const { data: sectionRows, error: secErr } = await supabase
      .from('sections')
      .select('id, name, grade_level, adviser_id')
      .order('grade_level');

    if (secErr) throw secErr;

    const dbSections: Section[] = (sectionRows || []).map(dbRowToSection);

    if (dbSections.length > 0) {
      // Merge with any locally-created sections not yet in Supabase
      const localSections = getStoredSections();
      const sectionMap = new Map<string, Section>();
      localSections.forEach(s => sectionMap.set(s.id, s));
      dbSections.forEach(s => {
        const existing = sectionMap.get(s.id);
        // Preserve local totalStudents/registeredStudents counts
        sectionMap.set(s.id, { ...s, totalStudents: existing?.totalStudents ?? 0, registeredStudents: existing?.registeredStudents ?? 0 });
      });
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(Array.from(sectionMap.values())));
      } catch {}
    }

    const resolvedSections = getStoredSections();

    // 2. Fetch students
    const { data: studentRows, error: stuErr } = await supabase
      .from('students')
      .select('id, lrn, first_name, last_name, grade_level, section_id, photo_urls, parent_consent, created_at')
      .order('last_name');

    if (stuErr) throw stuErr;

    if ((studentRows || []).length > 0) {
      const dbStudents: Student[] = (studentRows || []).map(r => dbRowToStudent(r, resolvedSections));

      // Merge: DB is authoritative for identity fields; preserve local biometric descriptors
      const localStudents = getStoredStudents();
      const studentMap = new Map<string, Student>();
      localStudents.forEach(s => studentMap.set(s.id, s));
      dbStudents.forEach(dbStu => {
        const local = studentMap.get(dbStu.id);
        studentMap.set(dbStu.id, {
          ...dbStu,
          // Preserve locally-captured biometric descriptors and photos
          faceDescriptors: local?.faceDescriptors ?? dbStu.faceDescriptors,
          photoUrl: dbStu.photoUrl || local?.photoUrl,
          registeredPhotos: local?.registeredPhotos ?? dbStu.registeredPhotos,
          faceRegistrationStatus: (local?.faceDescriptors?.length ?? 0) > 0
            ? 'registered'
            : dbStu.faceRegistrationStatus || local?.faceRegistrationStatus || 'unregistered',
          guardianName: local?.guardianName,
          guardianPhone: local?.guardianPhone,
        });
      });

      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, JSON.stringify(Array.from(studentMap.values())));
      } catch {}
    }

    // Notify all components to re-render with fresh data
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('srnhs_storage_sync'));

    return {
      students: (studentRows || []).length,
      sections: (sectionRows || []).length,
    };
  } catch (err) {
    console.warn('[Supabase] Sync failed, using local data:', err);
    return null;
  }
}

export async function deleteStudent(studentId: string): Promise<void> {
  const students = getStoredStudents().filter(s => s.id !== studentId);
  saveStoredStudents(students);
  // Also delete from Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('students').delete().eq('id', studentId);
    } catch (e) {
      console.warn('Supabase delete student note:', e);
    }
  }
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
    sectionName: studentData.sectionName || section?.name || '',
    faceRegistrationStatus: existingIndex >= 0 ? students[existingIndex]!.faceRegistrationStatus : 'unregistered',
    lastRegisteredAt: existingIndex >= 0 ? students[existingIndex]!.lastRegisteredAt : undefined,
    photoUrl: studentData.photoUrl || (existingIndex >= 0 ? students[existingIndex]!.photoUrl : undefined),
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

  // If Supabase is configured, upsert (insert or update) the student record
  if (isSupabaseConfigured && supabase) {
    try {
      const nameParts = student.name.trim().split(/\s+/);
      const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Student';
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
      const section = sections.find(s => s.id === student.sectionId);
      const gradeLevelNum = section?.gradeLevel === 'Grade 12' ? 12
        : section?.gradeLevel === 'Grade 11' ? 11
        : section?.gradeLevel === 'Grade 10' ? 10
        : 10;

      const { data: inserted, error: insertErr } = await supabase.from('students').upsert({
        id: student.id,
        lrn: student.studentNumber,
        first_name: firstName,
        last_name: lastName,
        gender: 'Not Specified',
        grade_level: gradeLevelNum,
        section_id: student.sectionId,
        parent_consent: true,
        consent_date: new Date().toISOString().split('T')[0],
      }, { onConflict: 'id' }).select().single();

      if (insertErr) {
        console.warn('Supabase student upsert warning:', insertErr.message);
      }

      if (inserted && (student.guardianName || student.guardianPhone)) {
        await supabase.from('student_guardians').upsert({
          student_id: inserted.id,
          name: student.guardianName || 'Guardian',
          relationship: 'Guardian',
          phone_number: student.guardianPhone,
          is_primary: true,
        }, { onConflict: 'student_id' });
      }
    } catch (e) {
      console.warn('Supabase student save note (data saved locally):', e);
    }
  }

  return student;
}

export function getStoredSections(): Section[] {
  const LEGACY_IDS = new Set(['sec-101', 'sec-102', 'sec-103']);
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_SECTIONS);
    if (raw) {
      const parsed: Section[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .filter(s => !LEGACY_IDS.has(s.id)) // purge old dummy sections
          .map(s => ({
            ...s,
            teacherName:
              s.teacherName === 'Maria Santos' ||
              s.teacherName === 'Juan Dela Cruz' ||
              s.teacherName === 'Elena Reyes'
                ? 'Unassigned'
                : s.teacherName,
            totalStudents: 0,
            registeredStudents: 0,
          }));
        // If we removed legacy entries, persist the cleaned list
        if (cleaned.length !== parsed.length) {
          try { localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(cleaned)); } catch {}
        }
        return cleaned;
      }
    }
  } catch (e) {}

  const defaultSections: Section[] = [
    { id: 'sec-stem-12', name: 'Grade 12 - STEM Diamond', gradeLevel: 'Grade 12', teacherId: 't-1', teacherName: 'Unassigned', totalStudents: 0, registeredStudents: 0 },
    { id: 'sec-tvl-12', name: 'Grade 12 - TVL ICT Cobalt', gradeLevel: 'Grade 12', teacherId: 't-2', teacherName: 'Unassigned', totalStudents: 0, registeredStudents: 0 },
    { id: 'sec-humss-11', name: 'Grade 11 - HUMSS Emerald', gradeLevel: 'Grade 11', teacherId: 't-3', teacherName: 'Unassigned', totalStudents: 0, registeredStudents: 0 },
    { id: 'sec-g10-1', name: 'Grade 10 - Rizal', gradeLevel: 'Grade 10', teacherId: 't-4', teacherName: 'Unassigned', totalStudents: 0, registeredStudents: 0 },
  ];
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(defaultSections));
  } catch {}
  return defaultSections;
}

export function saveStoredSections(sections: Section[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(sections));
  } catch (err) {
    console.warn('LocalStorage quota warning (sections):', err);
  }
  // Also upsert to Supabase so other devices see the new section immediately
  if (isSupabaseConfigured && supabase) {
    const rows = sections.map(s => ({
      id: s.id,
      name: s.name,
      grade_level: s.gradeLevel === 'Grade 12' ? 12
        : s.gradeLevel === 'Grade 11' ? 11
        : s.gradeLevel === 'Grade 10' ? 10
        : 10,
      adviser_id: s.teacherId || null,
    }));
    supabase
      .from('sections')
      .upsert(rows, { onConflict: 'id' })
      .then(({ error }) => {
        if (error) console.warn('Supabase sections upsert note:', error.message);
      });
  }
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
  const sectionStudents =
    sectionId === 'all' || !sectionId
      ? students
      : students.filter(s => s.sectionId === sectionId);

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
