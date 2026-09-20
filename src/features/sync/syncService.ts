import { getStoredSections, saveStoredSections, getStoredStudents, saveStoredStudents } from '@/features/faceRegistration/api';
import { Student, Section } from '@/features/faceRegistration/types';
import { FACE_DESCRIPTOR_VERSION } from '@/features/attendance/lib/faceNetMatcher';

export interface SyncPayload {
  version: 1;
  timestamp: number;
  sections: Section[];
  students: Student[];
}

/**
 * Export all local sections, students, and biometric descriptors as a compact sync payload.
 */
export function exportSyncPayload(): SyncPayload {
  const sections = getStoredSections();
  const students = getStoredStudents();

  // Strip massive base64 images if they exceed safe URL size for QR codes,
  // but preserve faceDescriptors (which are tiny ~800 bytes) and thumbnails.
  const optimizedStudents = students.map(s => ({
    ...s,
    // Keep photoUrl if it's reasonably sized or descriptor is present
    photoUrl: s.photoUrl && s.photoUrl.length < 50000 ? s.photoUrl : undefined,
    registeredPhotos: s.registeredPhotos ? {
      front: s.registeredPhotos.front && s.registeredPhotos.front.length < 50000 ? s.registeredPhotos.front : undefined,
    } : undefined,
  }));

  return {
    version: 1,
    timestamp: Date.now(),
    sections,
    students: optimizedStudents,
  };
}

/**
 * Import a sync payload into this device's local storage and trigger system refresh.
 */
export function importSyncPayload(payload: SyncPayload | string): { success: boolean; studentCount: number; sectionCount: number; error?: string } {
  try {
    const data: SyncPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;

    if (!data || !Array.isArray(data.sections) || !Array.isArray(data.students)) {
      return { success: false, studentCount: 0, sectionCount: 0, error: 'Invalid sync payload format.' };
    }

    // Merge or update sections
    if (data.sections.length > 0) {
      const existingSections = getStoredSections();
      const sectionMap = new Map<string, Section>();
      existingSections.forEach(s => sectionMap.set(s.id, s));
      data.sections.forEach(s => sectionMap.set(s.id, s));
      saveStoredSections(Array.from(sectionMap.values()));
    }

    // Merge or update students
    if (data.students.length > 0) {
      const existingStudents = getStoredStudents();
      const studentMap = new Map<string, Student>();
      existingStudents.forEach(s => studentMap.set(s.id, s));
      data.students.forEach(s => {
        const prev = studentMap.get(s.id);
        studentMap.set(s.id, {
          ...prev,
          ...s,
          faceRegistrationStatus: s.faceRegistrationStatus || prev?.faceRegistrationStatus || 'unregistered',
          faceDescriptors: s.faceDescriptors || prev?.faceDescriptors,
          photoUrl: s.photoUrl || prev?.photoUrl,
          registeredPhotos: s.registeredPhotos || prev?.registeredPhotos,
        });
      });
      saveStoredStudents(Array.from(studentMap.values()));
    }

    // Broadcast update event so all active components re-fetch immediately
    window.dispatchEvent(new CustomEvent('srnhs_storage_sync', { detail: data }));
    window.dispatchEvent(new Event('storage'));

    return {
      success: true,
      studentCount: data.students.length,
      sectionCount: data.sections.length,
    };
  } catch (err: any) {
    return { success: false, studentCount: 0, sectionCount: 0, error: err.message || 'Sync parse error' };
  }
}

/**
 * Generate a shareable URL that automatically syncs the phone when opened.
 */
export function generateSyncUrl(): string {
  const payload = exportSyncPayload();
  const json = JSON.stringify(payload);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  return `${origin}${pathname}#sync=${base64}`;
}

/**
 * Check if the current URL has a #sync= parameter, apply it, and clear the hash.
 */
export function checkAndApplyUrlSync(): { synced: boolean; studentCount?: number; sectionCount?: number } {
  try {
    if (typeof window === 'undefined') return { synced: false };
    const hash = window.location.hash;
    if (!hash || !hash.includes('sync=')) return { synced: false };

    const rawData = hash.split('sync=')[1];
    if (!rawData) return { synced: false };

    let jsonStr = '';
    try {
      jsonStr = decodeURIComponent(escape(atob(rawData)));
    } catch {
      jsonStr = decodeURIComponent(rawData);
    }

    const res = importSyncPayload(jsonStr);
    if (res.success) {
      // Clear the hash from the address bar without page reload
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return { synced: true, studentCount: res.studentCount, sectionCount: res.sectionCount };
    }
  } catch (e) {
    console.warn('URL sync note:', e);
  }
  return { synced: false };
}

/**
 * Assign precomputed or freshly captured face descriptors to a student in localStorage.
 */
export function assignStudentFaceDescriptors(studentId: string, descriptors: Float32Array[]): void {
  const students = getStoredStudents();
  const index = students.findIndex(s => s.id === studentId);
  if (index === -1) return;

  const serialized = descriptors.map(d => Array.from(d));
  students[index] = {
    ...students[index]!,
    faceRegistrationStatus: 'registered',
    faceDescriptors: serialized,
    faceDescriptorVersion: FACE_DESCRIPTOR_VERSION,
    lastRegisteredAt: new Date().toISOString(),
  };

  saveStoredStudents(students);
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('srnhs_storage_sync'));
}
