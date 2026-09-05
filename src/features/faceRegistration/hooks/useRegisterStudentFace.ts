import { useState } from 'react';
import { FaceRegistrationPayload, FaceRegistrationResult } from '../types';
import { submitFaceRegistration } from '../api';

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
      const result = await submitFaceRegistration(payload);
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
