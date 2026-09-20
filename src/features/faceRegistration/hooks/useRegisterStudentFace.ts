import { useState } from 'react';
import { FaceRegistrationPayload, FaceRegistrationResult } from '../types';
import { getStoredStudents, submitFaceRegistration } from '../api';
import { extractDescriptorsFromBlobs } from '@/features/attendance/lib/faceNetEngine';
import { findDuplicateStudentId } from '@/features/attendance/lib/faceNetMatcher';

export interface UseRegisterStudentFaceReturn {
  isSubmitting: boolean;
  error: string | null;
  qualityWarnings: string[];
  submit: (payload: FaceRegistrationPayload) => Promise<FaceRegistrationResult>;
  resetError: () => void;
}

export function useRegisterStudentFace(): UseRegisterStudentFaceReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([]);

  const resetError = () => {
    setError(null);
    setQualityWarnings([]);
  };

  const submit = async (payload: FaceRegistrationPayload): Promise<FaceRegistrationResult> => {
    setIsSubmitting(true);
    setError(null);
    setQualityWarnings([]);

    try {
      let faceDescriptors = payload.faceDescriptors;
      if (!faceDescriptors || faceDescriptors.length === 0) {
        const extracted = await extractDescriptorsFromBlobs(payload.frames.map(frame => frame.blob));
        if (extracted.length === 0) {
          throw new Error('No clear FaceNet embedding could be extracted. Recapture a closer, well-lit face.');
        }
        faceDescriptors = extracted.map(d => Array.from(d));
      }

      const gallery = getStoredStudents()
        .filter(s => s.id !== payload.studentId && s.faceDescriptors && s.faceDescriptors.length > 0)
        .map(s => ({ label: s.id, descriptors: s.faceDescriptors! }));

      for (const descriptor of faceDescriptors) {
        const duplicateId = findDuplicateStudentId(descriptor, gallery, payload.studentId);
        if (duplicateId) {
          const other = getStoredStudents().find(s => s.id === duplicateId);
          throw new Error(`This face already belongs to ${other?.name || 'another student'}. Registration blocked to prevent a false match.`);
        }
      }

      const result = await submitFaceRegistration({
        ...payload,
        faceDescriptors,
      });
      setIsSubmitting(false);

      if (result.qualityWarnings && result.qualityWarnings.length > 0) {
        setQualityWarnings(result.qualityWarnings);
      }

      return result;
    } catch (err: any) {
      setIsSubmitting(false);
      const msg = err.message || 'An unexpected error occurred while submitting face registration.';
      setError(msg);
      throw new Error(msg);
    }
  };

  return {
    isSubmitting,
    error,
    qualityWarnings,
    submit,
    resetError,
  };
}
