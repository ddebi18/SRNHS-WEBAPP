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
  checkRegistrationPose,
  FACE_REGISTRATION_POSE_CHECK_ENABLED,
  measureImageQuality,
  REGISTRATION_MIN_BRIGHTNESS,
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
    captureErrors,
    setConsentConfirmed,
    captureCurrentAngle,
    retakeAngle,
    goToStep,
    resetSession,
  } = useFaceCaptureSession();

  const activeAngle = (currentStep === 'review' || currentStep === 'consent') ? 'front' : currentStep;

  const { isFaceDetected, isCentered, faceBox, allFaceBoxes, detectorError } = useFaceDetection(
    videoRef,
    activeAngle,
    isOpen && Boolean(stream)
  );

  const { isSubmitting, error: submitError, submit, resetError } = useRegisterStudentFace();
  const [meanBrightness, setMeanBrightness] = useState<number | null>(null);
  const faceBoxRef = useRef(faceBox);
  faceBoxRef.current = faceBox;
  const livePoseCheck = FACE_REGISTRATION_POSE_CHECK_ENABLED && currentStep !== 'review'
    ? checkRegistrationPose(activeAngle, faceBox)
    : null;
  const isPoseReady = !FACE_REGISTRATION_POSE_CHECK_ENABLED || Boolean(
    livePoseCheck?.accepted &&
    meanBrightness !== null &&
    meanBrightness >= REGISTRATION_MIN_BRIGHTNESS
  );

  // Start camera when modal opens, stop when closes
  useEffect(() => {
    if (isOpen && student) {
      setMeanBrightness(null);
      resetSession();
      resetError();
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, student]);

  useEffect(() => {
    if (!isOpen || !stream) return;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      console.warn('[FaceRegistration] Could not initialize the lighting preview.');
      return;
    }

    const sampleBrightness = () => {
      const video = videoRef.current;
      const box = faceBoxRef.current;
      if (!video || !box || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      try {
        context.drawImage(
          video,
          box.x,
          box.y,
          box.width,
          box.height,
          0,
          0,
          canvas.width,
          canvas.height
        );
        setMeanBrightness(measureImageQuality(
          context.getImageData(0, 0, canvas.width, canvas.height)
        ).meanBrightness);
      } catch (error) {
        setMeanBrightness(null);
        console.warn('[FaceRegistration] Could not measure the live lighting level:', error);
      }
    };

    sampleBrightness();
    const interval = window.setInterval(sampleBrightness, 500);
    return () => window.clearInterval(interval);
  }, [isOpen, stream]);

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
    if (videoRef.current) {
      await captureCurrentAngle(videoRef.current, faceBox);
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
          {FACE_REGISTRATION_POSE_CHECK_ENABLED && currentStep !== 'review' && (
            <div
              role="status"
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-xs space-y-1"
            >
              <div className="font-bold text-slate-800 dark:text-slate-100">
                {livePoseCheck?.pose
                  ? `Estimated yaw ${livePoseCheck.pose.yawDeg.toFixed(1)}° · roll ${livePoseCheck.pose.rollDeg.toFixed(1)}°`
                  : 'Waiting for SCRFD pose landmarks'}
                {meanBrightness !== null && ` · brightness ${meanBrightness.toFixed(0)}/255`}
              </div>
              <div className="text-slate-600 dark:text-slate-300">
                {meanBrightness !== null && meanBrightness < REGISTRATION_MIN_BRIGHTNESS
                  ? 'Too dark. Improve the lighting before capture.'
                  : livePoseCheck?.guidance ?? 'Pose checks are disabled.'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Approximation: (left nose-eye distance − right nose-eye distance) ÷ their sum × 90° for yaw; eye-line angle for roll.
                Front ±10°; left/right 15–35°; roll ≤15°.
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Capture minimums: face 120px, detector score 0.60, sharpness 50, brightness 45/255;
                descriptor separation &gt;0.08.
              </div>
              <div className="text-[10px] text-amber-700 dark:text-amber-300">
                Pose guidance is not an anti-spoof liveness test.
              </div>
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
