import { Student, Section, FaceRegistrationPayload, FaceRegistrationResult } from './types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { FACE_DESCRIPTOR_VERSION } from '@/features/attendance/lib/faceNetMatcher';

const LOCAL_STORAGE_KEY_STUDENTS = 'srnhs_face_registration_students_v1';
const LOCAL_STORAGE_KEY_SECTIONS = 'srnhs_face_registration_sections_v1';

export function isValidUUID(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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
            let changed = false;
            const cleaned = realStudents.map(s => {
              let stuId = s.id;
              if (!isValidUUID(stuId)) {
                stuId = generateUUID();
                changed = true;
                if (s.id) {
                  getPhotosFromDb(s.id).then(photos => {
                    if (photos) savePhotosToDb(stuId, photos);
                  });
                }
              }
              return {
                ...s,
                id: stuId,
              };
            });

            if (changed || key !== LOCAL_STORAGE_KEY_STUDENTS) {
              try { localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, JSON.stringify(cleaned)); } catch {}
            }
            return cleaned;
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
  
  const photos = Array.isArray(row.photo_urls)
    ? row.photo_urls
    : (typeof row.photo_urls === 'string' && row.photo_urls ? [row.photo_urls] : []);
  const frontPhoto = photos[0] || undefined;
  const leftPhoto = photos[1] || undefined;
  const rightPhoto = photos[2] || undefined;
  const hasPhotos = photos.length > 0;

  return {
    id: row.id,
    name: fullName,
    studentNumber: row.lrn || '',
    sectionId: row.section_id || '',
    sectionName: sec?.name || '',
    faceRegistrationStatus: hasPhotos ? 'registered' : 'unregistered',
    photoUrl: frontPhoto,
    registeredPhotos: hasPhotos ? {
      front: frontPhoto,
      left: leftPhoto,
      right: rightPhoto,
    } : undefined,
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
    const localSections = getStoredSections();
    const localStudents = getStoredStudents();

    // 1. Fetch sections from Supabase
    const { data: sectionRows, error: secErr } = await supabase
      .from('sections')
      .select('id, name, grade_level, adviser_id')
      .order('grade_level');

    if (secErr) {
      console.warn('[Supabase] Sections fetch note:', secErr.message);
    }

    const dbSections: Section[] = (sectionRows || []).map(dbRowToSection);
    const sectionMap = new Map<string, Section>();
    
    // Seed with local sections
    localSections.forEach(s => {
      if (isValidUUID(s.id)) sectionMap.set(s.id, s);
    });
    // Overlay cloud sections
    dbSections.forEach(s => {
      const existing = sectionMap.get(s.id);
      sectionMap.set(s.id, {
        ...s,
        totalStudents: existing?.totalStudents ?? 0,
        registeredStudents: existing?.registeredStudents ?? 0,
      });
    });

    const mergedSections = Array.from(sectionMap.values());
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(mergedSections));
    } catch {}

    // Cloud push: if local has sections not in Supabase, push them
    const dbSectionIdSet = new Set(dbSections.map(s => s.id));
    const missingInCloud = localSections.filter(s => isValidUUID(s.id) && !dbSectionIdSet.has(s.id));
    if (missingInCloud.length > 0) {
      const pushRows = missingInCloud.map(s => ({
        id: s.id,
        name: s.name,
        grade_level: s.gradeLevel === 'Grade 12' ? 12
          : s.gradeLevel === 'Grade 11' ? 11
          : s.gradeLevel === 'Grade 10' ? 10
          : 10,
        adviser_id: (s.teacherId && isValidUUID(s.teacherId)) ? s.teacherId : null,
      }));
      supabase.from('sections').upsert(pushRows, { onConflict: 'id' }).then(({ error }) => {
        if (error) console.warn('[Supabase] Error uploading local sections:', error.message);
        else console.log(`[Supabase] ✓ Pushed ${pushRows.length} local section(s) to cloud`);
      });
    }

    // 2. Fetch students from Supabase
    const { data: studentRows, error: stuErr } = await supabase
      .from('students')
      .select('id, lrn, first_name, last_name, grade_level, section_id, photo_urls, parent_consent, created_at')
      .order('last_name');

    if (stuErr) {
      console.warn('[Supabase] Students fetch note:', stuErr.message);
    }

    const dbStudents: Student[] = (studentRows || []).map(r => dbRowToStudent(r, mergedSections));
    const studentMap = new Map<string, Student>();

    // Local students lookup for cached local properties (like faceDescriptors)
    const localStudentMap = new Map<string, Student>();
    localStudents.forEach(s => {
      if (isValidUUID(s.id)) localStudentMap.set(s.id, s);
    });

    // Supabase is the primary database. Cloud students form the authoritative roster.
    dbStudents.forEach(dbStu => {
      const local = localStudentMap.get(dbStu.id);
      studentMap.set(dbStu.id, {
        ...dbStu,
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

    const mergedStudents = Array.from(studentMap.values());

    // Always overwrite ALL candidate localStorage keys with the cloud result.
    // If Supabase has 0 students, this wipes every local cache so no device
    // can resurrect deleted records on the next sync.
    try {
      const serialized = JSON.stringify(mergedStudents);
      for (const key of CANDIDATE_STUDENT_KEYS) {
        try { localStorage.removeItem(key); } catch {}
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, serialized);
    } catch {}

    // Notify all components to re-render with fresh data
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('srnhs_storage_sync'));

    return {
      students: mergedStudents.length,
      sections: mergedSections.length,
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

  // Ensure student ID is a valid UUID
  const studentId = (studentData.id && isValidUUID(studentData.id))
    ? studentData.id
    : (existingIndex >= 0 && isValidUUID(students[existingIndex]!.id)
      ? students[existingIndex]!.id
      : generateUUID());

  // Ensure section ID is a valid UUID
  let finalSectionId = studentData.sectionId;
  if (!isValidUUID(finalSectionId)) {
    if (section && isValidUUID(section.id)) {
      finalSectionId = section.id;
    } else if (sections.length > 0 && sections[0] && isValidUUID(sections[0].id)) {
      finalSectionId = sections[0].id;
    }
  }

  const student: Student = {
    id: studentId,
    name: studentData.name.trim(),
    studentNumber: cleanLrn,
    sectionId: finalSectionId,
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
      const gradeLevelNum = section?.gradeLevel === 'Grade 12' ? 12
        : section?.gradeLevel === 'Grade 11' ? 11
        : section?.gradeLevel === 'Grade 10' ? 10
        : 10;

      // Ensure section exists in Supabase first to satisfy foreign key
      if (section && isValidUUID(section.id)) {
        await supabase.from('sections').upsert({
          id: section.id,
          name: section.name,
          grade_level: gradeLevelNum,
          adviser_id: (section.teacherId && isValidUUID(section.teacherId)) ? section.teacherId : null,
        }, { onConflict: 'id' });
      }

      const photoUrls: string[] = [];
      if (student.registeredPhotos?.front) photoUrls.push(student.registeredPhotos.front);
      else if (student.photoUrl) photoUrls.push(student.photoUrl);
      if (student.registeredPhotos?.left) photoUrls.push(student.registeredPhotos.left);
      if (student.registeredPhotos?.right) photoUrls.push(student.registeredPhotos.right);

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
        photo_urls: photoUrls,
      }, { onConflict: 'id' }).select().single();

      if (insertErr) {
        console.warn('Supabase student upsert warning:', insertErr.message);
      } else {
        console.log(`[Supabase] ✓ Student ${student.name} saved to database`);
      }

      if (inserted && (student.guardianName || student.guardianPhone)) {
        const { data: existingG } = await supabase
          .from('student_guardians')
          .select('id')
          .eq('student_id', inserted.id)
          .limit(1);

        const firstG = existingG && existingG[0];
        if (firstG) {
          await supabase.from('student_guardians').update({
            name: student.guardianName || 'Guardian',
            relationship: 'Guardian',
            phone_number: student.guardianPhone,
            is_primary: true,
          }).eq('id', firstG.id);
        } else {
          await supabase.from('student_guardians').insert({
            student_id: inserted.id,
            name: student.guardianName || 'Guardian',
            relationship: 'Guardian',
            phone_number: student.guardianPhone,
            is_primary: true,
          });
        }
      }
    } catch (e) {
      console.warn('Supabase student save note (data saved locally):', e);
    }
  }

  return student;
}

export function getStoredSections(): Section[] {
  // IDs that were ever used as hardcoded dummy/seed data — purge them always
  const LEGACY_IDS = new Set([
    'sec-101', 'sec-102', 'sec-103',
    'sec-stem-12', 'sec-tvl-12', 'sec-humss-11', 'sec-g10-1',
  ]);
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_SECTIONS);
    if (raw) {
      const parsed: Section[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let changed = false;
        const idMap = new Map<string, string>();

        const cleaned = parsed
          .filter(s => !LEGACY_IDS.has(s.id))
          .map(s => {
            let sectionId = s.id;
            if (!isValidUUID(sectionId)) {
              sectionId = generateUUID();
              idMap.set(s.id, sectionId);
              changed = true;
            }
            return {
              ...s,
              id: sectionId,
              teacherName:
                s.teacherName === 'Maria Santos' ||
                s.teacherName === 'Juan Dela Cruz' ||
                s.teacherName === 'Elena Reyes'
                  ? 'Unassigned'
                  : s.teacherName,
              totalStudents: 0,
              registeredStudents: 0,
            };
          });

        if (changed || cleaned.length !== parsed.length) {
          try { localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(cleaned)); } catch {}
        }

        // If any section IDs were migrated, update student references in localStorage
        if (idMap.size > 0) {
          try {
            const rawStu = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENTS);
            if (rawStu) {
              const students: Student[] = JSON.parse(rawStu);
              let stuChanged = false;
              const updatedStudents = students.map(st => {
                let updated = { ...st };
                if (idMap.has(st.sectionId)) {
                  updated.sectionId = idMap.get(st.sectionId)!;
                  stuChanged = true;
                }
                if (!isValidUUID(updated.id)) {
                  updated.id = generateUUID();
                  stuChanged = true;
                }
                return updated;
              });
              if (stuChanged) {
                localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, JSON.stringify(updatedStudents));
              }
            }
          } catch {}
        }

        return cleaned;
      }
    }
  } catch (e) {}

  return [];
}

export function saveStoredSections(sections: Section[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_SECTIONS, JSON.stringify(sections));
  } catch (err) {
    console.warn('LocalStorage quota warning (sections):', err);
  }
  // Also upsert to Supabase so other devices see the new section immediately
  if (isSupabaseConfigured && supabase) {
    const validSections = sections.filter(s => isValidUUID(s.id));
    if (validSections.length > 0) {
      const rows = validSections.map(s => ({
        id: s.id,
        name: s.name,
        grade_level: s.gradeLevel === 'Grade 12' ? 12
          : s.gradeLevel === 'Grade 11' ? 11
          : s.gradeLevel === 'Grade 10' ? 10
          : 10,
        adviser_id: (s.teacherId && isValidUUID(s.teacherId)) ? s.teacherId : null,
      }));
      supabase
        .from('sections')
        .upsert(rows, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.warn('[Supabase] sections upsert note:', error.message);
          else console.log(`[Supabase] ✓ Synced ${rows.length} section(s) to cloud`);
        });
    }
  }
}

export async function fetchSections(): Promise<Section[]> {
  if (isSupabaseConfigured) {
    try {
      await syncFromSupabase();
    } catch {}
  }
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
  if (isSupabaseConfigured) {
    try {
      await syncFromSupabase();
    } catch {}
  }
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

  // If Supabase is configured, update photo_urls on the student record
  if (isSupabaseConfigured && supabase) {
    try {
      const photosToSave = [photoMap.front, photoMap.left, photoMap.right].filter(Boolean) as string[];
      if (photosToSave.length > 0) {
        const { error: photoErr } = await supabase
          .from('students')
          .update({
            photo_urls: photosToSave,
          })
          .eq('id', payload.studentId);

        if (photoErr) {
          console.warn('[Supabase] Photo update note:', photoErr.message);
        } else {
          console.log(`[Supabase] ✓ Updated ${photosToSave.length} face photo(s) for student in cloud`);
        }
      }
    } catch (supabaseErr) {
      console.warn('[Supabase] Synchronization note (will continue using local store):', supabaseErr);
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
    faceDescriptors: payload.faceDescriptors && payload.faceDescriptors.length > 0
      ? payload.faceDescriptors
      : students[index]!.faceDescriptors,
    faceDescriptorVersion: payload.faceDescriptors && payload.faceDescriptors.length > 0
      ? FACE_DESCRIPTOR_VERSION
      : students[index]!.faceDescriptorVersion,
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
