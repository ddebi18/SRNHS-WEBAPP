import { useState, useCallback, useEffect, useRef } from 'react';
import { CaptureAngle, CapturedFrame } from '../types';

export type SessionStep = 'consent' | 'front' | 'left' | 'right' | 'review';

export interface UseFaceCaptureSessionReturn {
  currentStep: SessionStep;
  capturedFrames: Record<CaptureAngle, CapturedFrame | null>;
  consentConfirmed: boolean;
  isAllCaptured: boolean;
  setConsentConfirmed: (confirmed: boolean) => void;
  captureCurrentAngle: (videoElement: HTMLVideoElement) => Promise<void>;
  retakeAngle: (angle: CaptureAngle) => void;
  goToStep: (step: SessionStep) => void;
  resetSession: () => void;
}

export function useFaceCaptureSession(): UseFaceCaptureSessionReturn {
  const [currentStep, setCurrentStep] = useState<SessionStep>('front');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState<Record<CaptureAngle, CapturedFrame | null>>({
    front: null,
    left: null,
    right: null,
  });

  const capturedFramesRef = useRef(capturedFrames);
  capturedFramesRef.current = capturedFrames;

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

  const captureCurrentAngle = useCallback(async (video: HTMLVideoElement) => {
    if (currentStep === 'review' || currentStep === 'consent') return;
    const angle = currentStep as CaptureAngle;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to Blob
    const blob: Blob = await new Promise(resolve => {
      canvas.toBlob(b => resolve(b || new Blob()), 'image/jpeg', 0.92);
    });

    const previewUrl = URL.createObjectURL(blob);
    const newFrame: CapturedFrame = {
      id: `frame-${angle}-${Date.now()}`,
      angle,
      blob,
      previewUrl,
      capturedAt: new Date().toISOString(),
    };

    setCapturedFrames(prev => {
      // Revoke old URL if exists
      if (prev[angle]?.previewUrl) {
        URL.revokeObjectURL(prev[angle]!.previewUrl);
      }
      return { ...prev, [angle]: newFrame };
    });

    // Automatically advance to next step
    if (angle === 'front') {
      setCurrentStep('left');
    } else if (angle === 'left') {
      setCurrentStep('right');
    } else if (angle === 'right') {
      setCurrentStep('review');
    }
  }, [currentStep]);

  const retakeAngle = useCallback((angle: CaptureAngle) => {
    setCapturedFrames(prev => {
      if (prev[angle]?.previewUrl) {
        URL.revokeObjectURL(prev[angle]!.previewUrl);
      }
      return { ...prev, [angle]: null };
    });
    setCurrentStep(angle as SessionStep);
  }, []);

  const goToStep = useCallback((step: SessionStep) => {
    setCurrentStep(step);
  }, []);

  const resetSession = useCallback(() => {
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

  return {
    currentStep,
    capturedFrames,
    consentConfirmed,
    isAllCaptured,
    setConsentConfirmed,
    captureCurrentAngle,
    retakeAngle,
    goToStep,
    resetSession,
  };
}
