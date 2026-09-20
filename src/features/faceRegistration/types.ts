export type FaceRegistrationStatus = 'unregistered' | 'registered' | 'needs_review';

export interface RegisteredPhotos {
  front?: string;
  left?: string;
  right?: string;
}

export interface Student {
  id: string;
  name: string;
  studentNumber: string; // LRN
  sectionId: string;
  sectionName?: string;
  faceRegistrationStatus: FaceRegistrationStatus;
  lastRegisteredAt?: string; // ISO date
  photoUrl?: string;
  registeredPhotos?: RegisteredPhotos;
  guardianName?: string;
  guardianPhone?: string;
  faceDescriptors?: number[][];
  faceDescriptorVersion?: number;
}

export interface Section {
  id: string;
  name: string;
  gradeLevel: string;
  teacherId: string;
  teacherName?: string;
  totalStudents?: number;
  registeredStudents?: number;
}

export type CaptureAngle = 'front' | 'left' | 'right';

export interface CapturedFrame {
  id: string;
  angle: CaptureAngle;
  blob: Blob;
  previewUrl: string; // object URL for thumbnail display
  capturedAt: string;
}

export interface FaceRegistrationPayload {
  studentId: string;
  sectionId: string;
  frames: { angle: CaptureAngle; blob: Blob }[];
  consentConfirmed: boolean;
  faceDescriptors?: number[][];
}

export interface FaceRegistrationResult {
  success: boolean;
  studentId: string;
  message: string;
  qualityWarnings?: string[];
}
