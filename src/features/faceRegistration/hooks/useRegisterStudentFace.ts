import { useState } from 'react';
import { FaceRegistrationPayload, FaceRegistrationResult } from '../types';
import { getStoredStudents, submitFaceRegistration } from '../api';
import {
  FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES,
  extractDescriptorsFromBlobsWithDiagnostics,
} from '@/features/attendance/lib/faceNetEngine';
import { findDuplicateStudentId } from '@/features/attendance/lib/faceNetMatcher';
import {
  FACE_REGISTRATION_POSE_CHECK_ENABLED,
  getMinimumPoseDescriptorDistance,
  REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE,
} from '../lib/registrationChecks';

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
      const angleOrder = ['front', 'left', 'right'] as const;
      const frames = angleOrder.map(angle => payload.frames.find(frame => frame.angle === angle));
      if (payload.frames.length !== 3 || frames.some(frame => !frame)) {
        throw new Error('Capture front, left, and right angles before saving face registration.');
      }
      const orderedFrames = frames as NonNullable<(typeof frames)[number]>[];

      let faceDescriptors = payload.faceDescriptors;
      if (faceDescriptors !== undefined) {
        if (faceDescriptors.length !== 3) {
          throw new Error('Exactly three face descriptors are required: front, left, and right.');
        }
      } else {
        const attempts = await extractDescriptorsFromBlobsWithDiagnostics(orderedFrames.map(frame => frame.blob));
        if (attempts.length !== 3 || attempts.some(attempt => !attempt.descriptor)) {
          const reasons = attempts.map((attempt, index) => (
            `${orderedFrames[index]?.angle ?? `Frame ${index + 1}`}: ` +
            FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES[attempt.failure ?? 'inference_failed']
          ));
          throw new Error(
            `A descriptor is required for every capture. ${reasons.join('; ')}. ` +
            'Retake each indicated angle; keep the full face visible, close, and evenly lit.'
          );
        }
        faceDescriptors = attempts.map(attempt => Array.from(attempt.descriptor!));
      }

      if (FACE_REGISTRATION_POSE_CHECK_ENABLED &&
        getMinimumPoseDescriptorDistance(faceDescriptors) <= REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE) {
        throw new Error(
          `Two or more pose descriptors are suspiciously similar (minimum distance must exceed ` +
          `${REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE.toFixed(2)}). Retake the left and right views.`
        );
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
        frames: orderedFrames,
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
