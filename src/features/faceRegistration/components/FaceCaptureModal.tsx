import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { CaptureAngle, Student } from '../types';
import { useCamera } from '../hooks/useCamera';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { useFaceCaptureSession } from '../hooks/useFaceCaptureSession';
import { useRegisterStudentFace } from '../hooks/useRegisterStudentFace';
import { CameraPreview } from './CameraPreview';
import { LivenessStepBanner } from './LivenessStepBanner';
import { CaptureProgressDots } from './CaptureProgressDots';
import { CapturedFrameThumbnails } from './CapturedFrameThumbnails';
import { ConsentConfirmCheckbox } from './ConsentConfirmCheckbox';
import { CaptureControls } from './CaptureControls';
import {
  FACE_DIAGNOSTICS_ENABLED,
  FACE_REGISTRATION_SCRFD_500M_ENABLED,
} from '@/features/attendance/lib/faceOptimizationFlags';
import {
  checkRegistrationPose,
  FACE_REGISTRATION_POSE_CHECK_ENABLED,
  getRegistrationPreviewAgeMs,
  imageQualityGuidance,
  measureDownscaledCanvasQuality,
  type RegistrationCapturePreview,
} from '../lib/registrationChecks';

interface FaceCaptureModalProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (studentId: string) => void;
}

export const FaceCaptureModal: React.FC<FaceCaptureModalProps> = ({
  student,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const { stream, isLoading: isCameraLoading, errorMessage, start: startCamera, stop: stopCamera } = useCamera();

  const {
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
  } = useFaceCaptureSession();

  const activeAngle = (currentStep === 'review' || currentStep === 'consent') ? 'front' : currentStep;

  const {
    isFaceDetected,
    isCentered,
    faceBox,
    allFaceBoxes,
    detectorError,
    averageDetectionMs,
    refreshFaceDetection,
  } = useFaceDetection(
    videoRef,
    activeAngle,
    isOpen && Boolean(stream),
    {
      modelUrl: FACE_REGISTRATION_SCRFD_500M_ENABLED
        ? '/models/scrfd/scrfd_500m_bnkps.onnx'
        : '/models/scrfd/scrfd_2.5g_bnkps.onnx',
    }
  );

  const { isSubmitting, error: submitError, submit, resetError } = useRegisterStudentFace();
  const [previewStatus, setPreviewStatus] = useState<{
    poseCheck: ReturnType<typeof checkRegistrationPose> | null;
    quality: RegistrationCapturePreview['quality'];
  } | null>(null);
  const faceBoxRef = useRef(faceBox);
  faceBoxRef.current = faceBox;
  const captureCanvasRef = useRef<[HTMLCanvasElement, HTMLCanvasElement] | null>(null);
  const qualityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const capturePreviewRef = useRef<RegistrationCapturePreview | null>(null);
  const capturePausedRef = useRef(false);
  const activeCaptureCanvasIndexRef = useRef(0);
  const refreshPreviewRef = useRef<() => Promise<RegistrationCapturePreview | null>>(
    async () => null
  );
  const maxPreviewAgeMs = Math.max(1500, averageDetectionMs * 2);
  const livePoseCheck = previewStatus?.poseCheck ?? null;
  const meanBrightness = previewStatus?.quality?.meanBrightness ?? null;
  const qualityGuidance = previewStatus?.quality
    ? imageQualityGuidance(previewStatus.quality)
    : null;
  const previewIsFresh = Boolean(
    capturePreviewRef.current &&
    capturePreviewRef.current.angle === activeAngle &&
    getRegistrationPreviewAgeMs(capturePreviewRef.current) <= maxPreviewAgeMs + 1000
  );
  const captureWillRefresh = Boolean(
    capturePreviewRef.current &&
    getRegistrationPreviewAgeMs(capturePreviewRef.current) > maxPreviewAgeMs
  );
  const isPoseReady = previewIsFresh && (
    !FACE_REGISTRATION_POSE_CHECK_ENABLED ||
    Boolean(livePoseCheck?.accepted && previewStatus?.quality && !qualityGuidance)
  );
  const captureBlockReason = !consentConfirmed
    ? 'Confirm guardian consent before capturing.'
    : !isFaceDetected
      ? detectorError ?? 'No face detected. Position your face in the camera.'
      : currentStep === 'front' && !isCentered
        ? 'Center your face in the camera.'
        : !previewIsFresh
          ? 'Waiting for a recent completed face detection.'
          : FACE_REGISTRATION_POSE_CHECK_ENABLED && !isPoseReady
            ? qualityGuidance ??
              (livePoseCheck && !livePoseCheck.accepted
                ? livePoseCheck.guidance
                : 'Waiting for pose and image-quality checks.')
          : null;
  const isCaptureReady =
    consentConfirmed &&
    isFaceDetected &&
    (currentStep !== 'front' || isCentered) &&
    isPoseReady &&
    !isValidatingCapture;

  // Start camera when modal opens, stop when closes
  useEffect(() => {
    if (isOpen && student) {
      setPreviewStatus(null);
      capturePreviewRef.current = null;
      resetSession();
      resetError();
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, student]);

  useEffect(() => {
    if (!isOpen || !stream) return;
    const canvases = captureCanvasRef.current ??= [
      document.createElement('canvas'),
      document.createElement('canvas'),
    ];
    const qualityCanvas = qualityCanvasRef.current ??= document.createElement('canvas');
    const contexts = canvases.map(canvas => canvas.getContext('2d'));
    if (contexts.some(context => !context)) {
      throw new Error('Could not initialize the registration capture canvas.');
    }

    const samplePreview = async (forceFresh = false): Promise<RegistrationCapturePreview | null> => {
      if (capturePausedRef.current && !forceFresh) return null;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
      let box = faceBoxRef.current;
      if (forceFresh) {
        box = await refreshFaceDetection();
      }
      if (!box) {
        setPreviewStatus({
          poseCheck: checkRegistrationPose(activeAngle, null),
          quality: null,
        });
        return null;
      }
      const poseStartedAt = FACE_DIAGNOSTICS_ENABLED ? performance.now() : 0;
      const poseCheck = FACE_REGISTRATION_POSE_CHECK_ENABLED
        ? checkRegistrationPose(activeAngle, box)
        : { accepted: true, guidance: 'Pose checks are disabled.', pose: null };
      const poseMs = FACE_DIAGNOSTICS_ENABLED ? performance.now() - poseStartedAt : 0;
      const candidateCanvasIndex = 1 - activeCaptureCanvasIndexRef.current;
      const canvas = canvases[candidateCanvasIndex]!;
      const context = contexts[candidateCanvasIndex]!;
      const sourceWidth = video.videoWidth || 640;
      const sourceHeight = video.videoHeight || 480;
      const padX = box.width * 0.28;
      const padY = box.height * 0.35;
      const sx = Math.max(0, box.x - padX);
      const sy = Math.max(0, box.y - padY);
      const sw = Math.min(sourceWidth - sx, box.width + padX * 2);
      const sh = Math.min(sourceHeight - sy, box.height + padY * 2);
      const width = Math.max(1, Math.round(sw));
      const height = Math.max(1, Math.round(sh));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const frameCopyStartedAt = FACE_DIAGNOSTICS_ENABLED ? performance.now() : 0;
      try {
        context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        const frameCopyMs = FACE_DIAGNOSTICS_ENABLED
          ? performance.now() - frameCopyStartedAt
          : 0;
        let qualityCopyMs = 0;
        let brightnessMs = 0;
        let sharpnessMs = 0;
        const quality = FACE_REGISTRATION_POSE_CHECK_ENABLED
          ? measureDownscaledCanvasQuality(
              canvas,
              qualityCanvas,
              0.9,
              FACE_DIAGNOSTICS_ENABLED ? timings => {
              qualityCopyMs = timings.qualityCopyMs;
              brightnessMs = timings.brightnessMs;
              sharpnessMs = timings.sharpnessMs;
              } : undefined
            )
          : null;
        const sample: RegistrationCapturePreview = {
          angle: activeAngle,
          canvas,
          sampledAt: performance.now(),
          face: box,
          poseCheck,
          quality,
          frameCopyMs,
          poseMs,
          qualityCopyMs,
          brightnessMs,
          sharpnessMs,
        };
        const qualityError = quality ? imageQualityGuidance(quality) : null;
        if (!poseCheck.accepted || qualityError) {
          setPreviewStatus({ poseCheck, quality });
          return forceFresh ? sample : null;
        }
        capturePreviewRef.current = sample;
        activeCaptureCanvasIndexRef.current = candidateCanvasIndex;
        setPreviewStatus({ poseCheck, quality });
        return sample;
      } catch (error) {
        setPreviewStatus({ poseCheck, quality: null });
        console.error('[FaceRegistration] Could not check the live capture frame:', error);
        return null;
      }
    };

    refreshPreviewRef.current = () => samplePreview(true);
    void samplePreview();
    const interval = window.setInterval(() => void samplePreview(), 250);
    return () => {
      window.clearInterval(interval);
      refreshPreviewRef.current = async () => null;
      capturePreviewRef.current = null;
    };
  }, [isOpen, stream, activeAngle, refreshFaceDetection]);

  // Trap ESC key for modal closing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting]);

  const handleClose = () => {
    stopCamera();
    resetSession();
    onClose();
  };

  const handleCaptureFrame = async () => {
    capturePausedRef.current = true;
    try {
      await captureCurrentAngle(
        capturePreviewRef.current,
        maxPreviewAgeMs,
        () => refreshPreviewRef.current()
      );
    } finally {
      capturePausedRef.current = false;
    }
  };

  const handleSubmit = async () => {
    if (!student) return;

    const framesArray: { angle: CaptureAngle; blob: Blob }[] = [];
    if (capturedFrames.front) framesArray.push({ angle: 'front', blob: capturedFrames.front.blob });
    if (capturedFrames.left)  framesArray.push({ angle: 'left',  blob: capturedFrames.left.blob });
    if (capturedFrames.right) framesArray.push({ angle: 'right', blob: capturedFrames.right.blob });
    const faceDescriptors = framesArray.map(frame => capturedFrames[frame.angle]?.descriptor);

    try {
      const res = await submit({
        studentId: student.id,
        sectionId: student.sectionId,
        frames: framesArray,
        consentConfirmed,
        faceDescriptors: faceDescriptors.every((descriptor): descriptor is number[] => Boolean(descriptor))
          ? faceDescriptors
          : undefined,
      });

      if (res.success) {
        stopCamera();
        onSuccess(student.id);
        handleClose();
      }
    } catch (e: any) {
      if (!submitError && e?.message) {
        console.warn('[FaceRegistration]', e.message);
      }
    }
  };

  if (!isOpen || !student) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-950/60"
          onClick={isSubmitting ? undefined : handleClose}
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-student-title"
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-6 space-y-3.5 sm:space-y-5 z-10 my-auto max-h-[94vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Student Face Registration
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  LRN: {student.studentNumber}
                </span>
              </div>
              <h2 id="modal-student-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
                {student.faceRegistrationStatus === 'registered' ? 'Re-register face' : 'Register face'} — {student.name}
              </h2>
              {student.faceRegistrationStatus === 'registered' && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  The current registration remains active unless this replacement is saved successfully.
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Submission Error Banner */}
          {submitError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
          {Object.entries(captureErrors).length > 0 && (
            <div role="alert" className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {Object.entries(captureErrors).map(([angle, reason]) =>
                  `${angle[0]?.toUpperCase()}${angle.slice(1)}: ${reason}`
                ).join('. ')}. Improve lighting, keep the full face visible, and turn only slightly. Retake failed angles if needed.
              </span>
            </div>
          )}
          <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">
            Lighting tip: face a bright, even light source and avoid strong backlighting or shadows.
          </div>

          {/* Step Progress Dots */}
          <CaptureProgressDots
            currentStep={currentStep}
            capturedFrames={capturedFrames}
            onStepClick={goToStep}
            disabled={isValidatingCapture}
          />

          {/* Liveness Step Banner */}
          <LivenessStepBanner
            currentStep={currentStep}
            studentName={student.name}
          />
          {currentStep !== 'review' && (
            <div
              role="status"
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-xs space-y-1"
            >
              <div className="font-bold text-slate-800 dark:text-slate-100">
                  {FACE_REGISTRATION_POSE_CHECK_ENABLED && livePoseCheck?.pose
                  ? `Estimated yaw ${livePoseCheck.pose.yawDeg.toFixed(1)}° · roll ${livePoseCheck.pose.rollDeg.toFixed(1)}°`
                    : `Detection average ${averageDetectionMs.toFixed(0)}ms`}
                {meanBrightness !== null && ` · brightness ${meanBrightness.toFixed(0)}/255`}
              </div>
              <div className="text-slate-600 dark:text-slate-300">
                  {captureBlockReason
                    ? `Capture blocked: ${captureBlockReason}`
                    : captureWillRefresh
                      ? 'Detection is taking longer than usual. Capture will run a fresh check first.'
                    : FACE_REGISTRATION_POSE_CHECK_ENABLED
                      ? 'Capture ready: using a recent frame that passed pose and image-quality checks.'
                      : 'Capture ready: using a recent frame from the face detector.'}
              </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Detector: {faceBox?.detectorSource === 'scrfd'
                    ? 'SCRFD (pose landmarks available)'
                    : faceBox?.detectorSource === 'fallback'
                      ? 'MediaPipe fallback (pose landmarks unavailable)'
                      : 'waiting for a face detection'}
                </div>
              {FACE_REGISTRATION_POSE_CHECK_ENABLED && previewStatus?.quality && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Sharpness {previewStatus.quality.sharpness.toFixed(1)} / 50 minimum.
                </div>
              )}
              {FACE_REGISTRATION_POSE_CHECK_ENABLED && <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Approximation: (left nose-eye distance − right nose-eye distance) ÷ their sum × 90° for yaw; eye-line angle for roll.
                Front ±10°; left/right 15–35°; roll ≤15°.
              </div>}
              {FACE_REGISTRATION_POSE_CHECK_ENABLED && <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Capture minimums: face 120px, detector score 0.60, sharpness 50, brightness 45/255;
                descriptor separation &gt;0.08.
              </div>}
              {FACE_REGISTRATION_POSE_CHECK_ENABLED && <div className="text-[10px] text-amber-700 dark:text-amber-300">
                Pose guidance is not an anti-spoof liveness test.
              </div>}
            </div>
          )}

          {/* Camera Viewfinder */}
          {currentStep !== 'review' && (
            <CameraPreview
              ref={videoRef}
              stream={stream}
              isLoading={isCameraLoading}
              error={errorMessage}
              detectorError={detectorError}
              faceBox={faceBox}
              allFaceBoxes={allFaceBoxes}
              isFaceDetected={isFaceDetected}
              isCentered={isCentered}
              isCaptureReady={isCaptureReady}
              currentAngle={activeAngle}
              onRetryPermission={startCamera}
            />
          )}

          {/* Captured Thumbnails Strip */}
          <CapturedFrameThumbnails
            capturedFrames={capturedFrames}
            activeAngle={activeAngle}
            onRetake={retakeAngle}
            disabled={isValidatingCapture}
          />

          {/* Action Controls */}
          <CaptureControls
            currentStep={currentStep}
            consentConfirmed={consentConfirmed}
            isFaceDetected={isFaceDetected}
            isCentered={isCentered}
            isAllCaptured={isAllCaptured}
            hasAllDescriptors={hasAllDescriptors}
            isPoseReady={isPoseReady}
            isSubmitting={isSubmitting}
            isValidatingCapture={isValidatingCapture}
            captureProgress={captureProgress}
            onCapture={handleCaptureFrame}
            onSubmit={handleSubmit}
            onCancel={handleClose}
          />

          {/* Consent Checkbox Gate (Positioned below capture/cancel buttons with clear requirement highlighting) */}
          <ConsentConfirmCheckbox
            student={student}
            checked={consentConfirmed}
            onChange={setConsentConfirmed}
            disabled={isSubmitting}
          />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
