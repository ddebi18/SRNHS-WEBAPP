import { useState, useCallback, useEffect, useRef } from 'react';
import { CaptureAngle, CapturedFrame } from '../types';
import {
  FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES,
  type FaceDescriptorExtractionPass,
  extractDescriptorsFromBlobsWithDiagnostics,
} from '@/features/attendance/lib/faceNetEngine';
import { FACE_DIAGNOSTICS_ENABLED } from '@/features/attendance/lib/faceOptimizationFlags';
import {
  FACE_REGISTRATION_POSE_CHECK_ENABLED,
  getMinimumPoseDescriptorDistance,
  imageQualityGuidance,
  REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE,
  type RegistrationCapturePreview,
} from '../lib/registrationChecks';

export type SessionStep = 'consent' | 'front' | 'left' | 'right' | 'review';

const CAPTURE_PREVIEW_MAX_AGE_MS = 500;

function yieldToMain(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export interface UseFaceCaptureSessionReturn {
  currentStep: SessionStep;
  capturedFrames: Record<CaptureAngle, CapturedFrame | null>;
  consentConfirmed: boolean;
  isAllCaptured: boolean;
  hasAllDescriptors: boolean;
  isValidatingCapture: boolean;
  captureProgress: string | null;
  captureErrors: Partial<Record<CaptureAngle, string>>;
  setConsentConfirmed: (confirmed: boolean) => void;
  captureCurrentAngle: (preview: RegistrationCapturePreview | null) => Promise<void>;
  retakeAngle: (angle: CaptureAngle) => void;
  goToStep: (step: SessionStep) => void;
  resetSession: () => void;
}

export function useFaceCaptureSession(): UseFaceCaptureSessionReturn {
  const [currentStep, setCurrentStep] = useState<SessionStep>('front');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [isValidatingCapture, setIsValidatingCapture] = useState(false);
  const [captureProgress, setCaptureProgress] = useState<string | null>(null);
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

  const captureCurrentAngle = useCallback(async (preview: RegistrationCapturePreview | null) => {
    if (captureInProgressRef.current || currentStep === 'review' || currentStep === 'consent') return;
    const angle = currentStep as CaptureAngle;
    const captureStartedAt = FACE_DIAGNOSTICS_ENABLED ? performance.now() : 0;
    const descriptorPasses: FaceDescriptorExtractionPass[] = [];
    const timings = {
      frameCopyMs: preview?.frameCopyMs ?? 0,
      poseMs: preview?.poseMs ?? 0,
      qualityCopyMs: preview?.qualityCopyMs ?? 0,
      sharpnessMs: preview?.sharpnessMs ?? 0,
      brightnessMs: preview?.brightnessMs ?? 0,
      blobEncodingMs: 0,
      descriptorExtractionMs: 0,
      descriptorSeparationMs: 0,
      stateUpdateMs: 0,
    };
    const captureAttempt = ++captureAttemptRef.current;
    captureInProgressRef.current = true;
    setIsValidatingCapture(true);
    setCaptureProgress('Checking pose...');
    setCaptureErrors(prev => {
      const next = { ...prev };
      delete next[angle];
      return next;
    });

    try {
      await yieldToMain();
      if (!preview || preview.angle !== angle ||
        performance.now() - preview.sampledAt > CAPTURE_PREVIEW_MAX_AGE_MS) {
        setCaptureErrors(prev => ({
          ...prev,
          [angle]: 'Hold still and try again so the latest checked frame can be captured.',
        }));
        return;
      }
      if (FACE_REGISTRATION_POSE_CHECK_ENABLED) {
        if (!preview.poseCheck.accepted) {
          setCaptureErrors(prev => ({ ...prev, [angle]: preview.poseCheck.guidance }));
          return;
        }
        setCaptureProgress('Checking image...');
        await yieldToMain();
        const qualityError = preview.quality ? imageQualityGuidance(preview.quality) : 'Hold still and try again.';
        if (qualityError) {
          setCaptureErrors(prev => ({ ...prev, [angle]: qualityError }));
          return;
        }
      }

      setCaptureProgress('Reading face...');
      await yieldToMain();
      const encodeStartedAt = FACE_DIAGNOSTICS_ENABLED ? performance.now() : 0;
      const blob = await new Promise<Blob>((resolve, reject) => {
        preview.canvas.toBlob(
          result => result ? resolve(result) : reject(new Error('Could not encode the captured image.')),
          'image/jpeg',
          0.92
        );
      });
      timings.blobEncodingMs = FACE_DIAGNOSTICS_ENABLED
        ? performance.now() - encodeStartedAt
        : 0;
      const extractionStartedAt = FACE_DIAGNOSTICS_ENABLED ? performance.now() : 0;
      const [attempt] = await extractDescriptorsFromBlobsWithDiagnostics([blob], {
        maxPasses: 2,
        onPassStart: async step => {
          setCaptureProgress(step === 'initial' ? 'Reading face (first pass)...' : 'Reading face (retry)...');
          await yieldToMain();
        },
        onPassComplete: FACE_DIAGNOSTICS_ENABLED
          ? pass => descriptorPasses.push(pass)
          : undefined,
      });
      timings.descriptorExtractionMs = FACE_DIAGNOSTICS_ENABLED
        ? performance.now() - extractionStartedAt
        : 0;
      if (captureAttempt !== captureAttemptRef.current) return;
      if (!attempt?.descriptor) {
        const failure = attempt?.failure ?? 'inference_failed';
        const guidance: Record<typeof failure, string> = {
          no_face_detected: 'Keep your face centered and try again.',
          inconsistent_landmarks: 'Adjust your position and try again.',
          below_minimum_face_size: 'Move closer to the camera.',
          below_detection_confidence: 'Hold still and try again.',
          inference_failed: 'Face analysis failed. Retry this capture.',
        };
        const detail = FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES[failure];
        setCaptureErrors(prev => ({
          ...prev,
          [angle]: `${guidance[failure]} Hold still and try again. (${detail})`,
        }));
        return;
      }

      setCaptureProgress('Checking descriptor separation...');
      await yieldToMain();
      const separationStartedAt = FACE_DIAGNOSTICS_ENABLED ? performance.now() : 0;
      const existingDescriptors = (['front', 'left', 'right'] as const)
        .flatMap(existingAngle => {
          if (existingAngle === angle) return [];
          const descriptor = capturedFramesRef.current[existingAngle]?.descriptor;
          return descriptor ? [descriptor] : [];
        });
      const allDescriptors = [...existingDescriptors, Array.from(attempt.descriptor)];
      const minimumDistance = getMinimumPoseDescriptorDistance(allDescriptors);
      timings.descriptorSeparationMs = FACE_DIAGNOSTICS_ENABLED
        ? performance.now() - separationStartedAt
        : 0;
      if (FACE_REGISTRATION_POSE_CHECK_ENABLED &&
        minimumDistance <= REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE) {
        setCaptureErrors(prev => ({
          ...prev,
          [angle]: 'This view is too similar to a previous capture. Turn slightly and try again.',
        }));
        return;
      }

      const previewUrl = URL.createObjectURL(blob);
      const newFrame: CapturedFrame = {
        id: `frame-${angle}-${Date.now()}`,
        angle,
        blob,
        descriptor: Array.from(attempt.descriptor),
        previewUrl,
        capturedAt: new Date().toISOString(),
      };

      setCaptureProgress('Saving capture...');
      await yieldToMain();
      const stateUpdateStartedAt = FACE_DIAGNOSTICS_ENABLED ? performance.now() : 0;
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
      timings.stateUpdateMs = FACE_DIAGNOSTICS_ENABLED
        ? performance.now() - stateUpdateStartedAt
        : 0;
    } catch (error) {
      console.error('[FaceRegistration] Capture validation failed:', error);
      if (captureAttempt === captureAttemptRef.current) {
        setCaptureErrors(prev => ({
          ...prev,
          [angle]: 'Face analysis could not complete. Retry this capture.',
        }));
      }
    } finally {
      if (FACE_DIAGNOSTICS_ENABLED) {
        const totalMs = performance.now() - captureStartedAt;
        const phases = [
          ['frameCopy', timings.frameCopyMs],
          ['poseEstimate', timings.poseMs],
          ['qualityDownscaleAndReadback', timings.qualityCopyMs],
          ['brightness', timings.brightnessMs],
          ['sharpness', timings.sharpnessMs],
          ['blobEncoding', timings.blobEncodingMs],
          ['descriptorExtraction', timings.descriptorExtractionMs],
          ['descriptorSeparation', timings.descriptorSeparationMs],
          ['stateUpdate', timings.stateUpdateMs],
        ] as const;
        const biggestContributor = [...phases].sort((a, b) => b[1] - a[1])[0];
        console.info('[FaceRegistration] Capture timing', {
          angle,
          totalCaptureMs: Number(totalMs.toFixed(1)),
          biggestContributor: biggestContributor?.[0] ?? null,
          phases: Object.fromEntries(phases.map(([name, durationMs]) => [
            name,
            Number(durationMs.toFixed(1)),
          ])),
          descriptorPasses: descriptorPasses.map(pass => ({
            step: pass.step,
            detector: pass.detector,
            sourceStep: pass.sourceStep,
            durationMs: Number(pass.durationMs.toFixed(1)),
            result: pass.result,
            failure: pass.failure,
          })),
          previewPhasesPrecedeCapture: true,
        });
      }
      if (captureAttempt === captureAttemptRef.current) {
        captureInProgressRef.current = false;
        setIsValidatingCapture(false);
        setCaptureProgress(null);
      }
    }
  }, [currentStep]);

  const retakeAngle = useCallback((angle: CaptureAngle) => {
    captureAttemptRef.current++;
    captureInProgressRef.current = false;
    setIsValidatingCapture(false);
    setCaptureProgress(null);
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
    setCaptureProgress(null);
    setCurrentStep(step);
  }, []);

  const resetSession = useCallback(() => {
    captureAttemptRef.current++;
    captureInProgressRef.current = false;
    setIsValidatingCapture(false);
    setCaptureProgress(null);
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
  const hasAllDescriptors = Boolean(
    capturedFrames.front?.descriptor &&
    capturedFrames.left?.descriptor &&
    capturedFrames.right?.descriptor
  );

  return {
    currentStep,
    capturedFrames,
    consentConfirmed,
    isAllCaptured,
    hasAllDescriptors,
    isValidatingCapture,
    captureProgress,
    captureErrors,
    setConsentConfirmed,
    captureCurrentAngle,
    retakeAngle,
    goToStep,
    resetSession,
  };
}
