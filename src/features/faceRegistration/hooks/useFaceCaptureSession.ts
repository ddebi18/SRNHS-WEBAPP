import { useState, useCallback, useEffect, useRef } from 'react';
import { CaptureAngle, CapturedFrame } from '../types';
import { FaceBox } from './useFaceDetection';
import {
  FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES,
  extractDescriptorsFromBlobsWithDiagnostics,
} from '@/features/attendance/lib/faceNetEngine';

export type SessionStep = 'consent' | 'front' | 'left' | 'right' | 'review';

export interface UseFaceCaptureSessionReturn {
  currentStep: SessionStep;
  capturedFrames: Record<CaptureAngle, CapturedFrame | null>;
  consentConfirmed: boolean;
  isAllCaptured: boolean;
  hasValidDescriptor: boolean;
  isValidatingCapture: boolean;
  captureErrors: Partial<Record<CaptureAngle, string>>;
  setConsentConfirmed: (confirmed: boolean) => void;
  captureCurrentAngle: (videoElement: HTMLVideoElement, faceBox?: FaceBox | null) => Promise<void>;
  retakeAngle: (angle: CaptureAngle) => void;
  goToStep: (step: SessionStep) => void;
  resetSession: () => void;
}

export function useFaceCaptureSession(): UseFaceCaptureSessionReturn {
  const [currentStep, setCurrentStep] = useState<SessionStep>('front');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [isValidatingCapture, setIsValidatingCapture] = useState(false);
  const [captureErrors, setCaptureErrors] = useState<Partial<Record<CaptureAngle, string>>>({});
  const [capturedFrames, setCapturedFrames] = useState<Record<CaptureAngle, CapturedFrame | null>>({
    front: null,
    left: null,
    right: null,
  });

  const capturedFramesRef = useRef(capturedFrames);
  capturedFramesRef.current = capturedFrames;
  const captureInProgressRef = useRef(false);
  const captureAttemptRef = useRef(0);

  // Cleanup object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(capturedFramesRef.current).forEach(frame => {
        if (frame?.previewUrl) {
          URL.revokeObjectURL(frame.previewUrl);
        }
      });
    };
  }, []);

  const captureCurrentAngle = useCallback(async (video: HTMLVideoElement, faceBox?: FaceBox | null) => {
    if (captureInProgressRef.current || currentStep === 'review' || currentStep === 'consent') return;
    const angle = currentStep as CaptureAngle;
    const captureAttempt = ++captureAttemptRef.current;
    captureInProgressRef.current = true;
    setIsValidatingCapture(true);
    setCaptureErrors(prev => {
      const next = { ...prev };
      delete next[angle];
      return next;
    });

    try {
      const sourceWidth = video.videoWidth || 1280;
      const sourceHeight = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the captured image.');

      if (faceBox && faceBox.width > 0 && faceBox.height > 0) {
        const padX = faceBox.width * 0.28;
        const padY = faceBox.height * 0.35;
        const sx = Math.max(0, faceBox.x - padX);
        const sy = Math.max(0, faceBox.y - padY);
        const sw = Math.min(sourceWidth - sx, faceBox.width + padX * 2);
        const sh = Math.min(sourceHeight - sy, faceBox.height + padY * 2);
        canvas.width = Math.max(1, Math.round(sw));
        canvas.height = Math.max(1, Math.round(sh));
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      } else {
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          result => result ? resolve(result) : reject(new Error('Could not encode the captured image.')),
          'image/jpeg',
          0.92
        );
      });
      const [attempt] = await extractDescriptorsFromBlobsWithDiagnostics([blob]);
      if (captureAttempt !== captureAttemptRef.current) return;
      if (!attempt?.descriptor) {
        const reason = FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES[attempt?.failure ?? 'inference_failed'];
        setCaptureErrors(prev => ({ ...prev, [angle]: reason }));
      }

      const previewUrl = URL.createObjectURL(blob);
      const newFrame: CapturedFrame = {
        id: `frame-${angle}-${Date.now()}`,
        angle,
        blob,
        descriptor: attempt?.descriptor ? Array.from(attempt.descriptor) : undefined,
        previewUrl,
        capturedAt: new Date().toISOString(),
      };

      setCapturedFrames(prev => {
        if (prev[angle]?.previewUrl) {
          URL.revokeObjectURL(prev[angle]!.previewUrl);
        }
        return { ...prev, [angle]: newFrame };
      });

      if (angle === 'front') {
        setCurrentStep('left');
      } else if (angle === 'left') {
        setCurrentStep('right');
      } else if (angle === 'right') {
        setCurrentStep('review');
      }
    } catch (error) {
      console.error('[FaceRegistration] Capture validation failed:', error);
      if (captureAttempt === captureAttemptRef.current) {
        setCaptureErrors(prev => ({
          ...prev,
          [angle]: 'Face analysis could not complete. Retry this capture.',
        }));
      }
    } finally {
      if (captureAttempt === captureAttemptRef.current) {
        captureInProgressRef.current = false;
        setIsValidatingCapture(false);
      }
    }
  }, [currentStep]);

  const retakeAngle = useCallback((angle: CaptureAngle) => {
    captureAttemptRef.current++;
    captureInProgressRef.current = false;
    setIsValidatingCapture(false);
    setCaptureErrors(prev => {
      const next = { ...prev };
      delete next[angle];
      return next;
    });
    setCapturedFrames(prev => {
      if (prev[angle]?.previewUrl) {
        URL.revokeObjectURL(prev[angle]!.previewUrl);
      }
      return { ...prev, [angle]: null };
    });
    setCurrentStep(angle as SessionStep);
  }, []);

  const goToStep = useCallback((step: SessionStep) => {
    captureAttemptRef.current++;
    captureInProgressRef.current = false;
    setIsValidatingCapture(false);
    setCurrentStep(step);
  }, []);

  const resetSession = useCallback(() => {
    captureAttemptRef.current++;
    captureInProgressRef.current = false;
    setIsValidatingCapture(false);
    setCaptureErrors({});
    Object.values(capturedFramesRef.current).forEach(frame => {
      if (frame?.previewUrl) {
        URL.revokeObjectURL(frame.previewUrl);
      }
    });
    setCapturedFrames({ front: null, left: null, right: null });
    setConsentConfirmed(false);
    setCurrentStep('front');
  }, []);

  const isAllCaptured = Boolean(
    capturedFrames.front && capturedFrames.left && capturedFrames.right
  );
  const hasValidDescriptor = Boolean(
    capturedFrames.front?.descriptor ||
    capturedFrames.left?.descriptor ||
    capturedFrames.right?.descriptor
  );

  return {
    currentStep,
    capturedFrames,
    consentConfirmed,
    isAllCaptured,
    hasValidDescriptor,
    isValidatingCapture,
    captureErrors,
    setConsentConfirmed,
    captureCurrentAngle,
    retakeAngle,
    goToStep,
    resetSession,
  };
}
