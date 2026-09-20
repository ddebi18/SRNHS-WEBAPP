import { useState, useCallback, useEffect, useRef } from 'react';
import { CaptureAngle, CapturedFrame } from '../types';
import { FaceBox } from './useFaceDetection';

export type SessionStep = 'consent' | 'front' | 'left' | 'right' | 'review';

export interface UseFaceCaptureSessionReturn {
  currentStep: SessionStep;
  capturedFrames: Record<CaptureAngle, CapturedFrame | null>;
  consentConfirmed: boolean;
  isAllCaptured: boolean;
  setConsentConfirmed: (confirmed: boolean) => void;
  captureCurrentAngle: (videoElement: HTMLVideoElement, faceBox?: FaceBox | null) => Promise<void>;
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

  const captureCurrentAngle = useCallback(async (video: HTMLVideoElement, faceBox?: FaceBox | null) => {
    if (currentStep === 'review' || currentStep === 'consent') return;
    const angle = currentStep as CaptureAngle;

    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
