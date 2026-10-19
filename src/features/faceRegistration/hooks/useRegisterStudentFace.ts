import { useState } from 'react';
import { FaceRegistrationPayload, FaceRegistrationResult } from '../types';
import { getStoredStudents, submitFaceRegistration } from '../api';
import {
  FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES,
  extractDescriptorsFromBlobsWithDiagnostics,
} from '@/features/attendance/lib/faceNetEngine';
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
        const attempts = await extractDescriptorsFromBlobsWithDiagnostics(payload.frames.map(frame => frame.blob));
        const extracted = attempts.flatMap(attempt => attempt.descriptor ? [attempt.descriptor] : []);
        if (extracted.length === 0) {
          const reasons = attempts.map((attempt, index) => (
            `${payload.frames[index]?.angle ?? `Frame ${index + 1}`}: ` +
            FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES[attempt.failure ?? 'inference_failed']
          ));
          throw new Error(
            `No FaceNet embedding could be extracted. ${reasons.join('; ')}. ` +
            'Retake the indicated angle(s); keep the full face visible, close, and evenly lit.'
          );
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
