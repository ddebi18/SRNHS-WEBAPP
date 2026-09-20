import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { Student } from '../types';
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
    setConsentConfirmed,
    captureCurrentAngle,
    retakeAngle,
    goToStep,
    resetSession,
  } = useFaceCaptureSession();

  const activeAngle = (currentStep === 'review' || currentStep === 'consent') ? 'front' : currentStep;

  const { isFaceDetected, isCentered, faceBox } = useFaceDetection(
    videoRef,
    activeAngle,
    isOpen && Boolean(stream)
  );

  const { isSubmitting, error: submitError, submit, resetError } = useRegisterStudentFace();

  // Start camera when modal opens, stop when closes
  useEffect(() => {
    if (isOpen && student) {
      resetSession();
      resetError();
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, student]);

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

    const framesArray: { angle: any; blob: Blob }[] = [];
    if (capturedFrames.front) framesArray.push({ angle: 'front', blob: capturedFrames.front.blob });
    if (capturedFrames.left)  framesArray.push({ angle: 'left',  blob: capturedFrames.left.blob });
    if (capturedFrames.right) framesArray.push({ angle: 'right', blob: capturedFrames.right.blob });

    try {
      const res = await submit({
        studentId: student.id,
        sectionId: student.sectionId,
        frames: framesArray,
        consentConfirmed,
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
          className="fixed inset-0 bg-black/75 backdrop-blur-sm"
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
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-6 space-y-3.5 sm:space-y-5 z-10 my-auto max-h-[94vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#1B4332] text-white text-[10px] font-black uppercase tracking-wider">
                  Teacher Assisted Enrollment
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  LRN: {student.studentNumber}
                </span>
              </div>
              <h2 id="modal-student-title" className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                Face Registration — {student.name}
              </h2>
            </div>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-2 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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

          {/* Step Progress Dots */}
          <CaptureProgressDots
            currentStep={currentStep}
            capturedFrames={capturedFrames}
            onStepClick={goToStep}
          />

          {/* Liveness Step Banner */}
          <LivenessStepBanner
            currentStep={currentStep}
            studentName={student.name}
          />

          {/* Camera Viewfinder */}
          {currentStep !== 'review' && (
            <CameraPreview
              ref={videoRef}
              stream={stream}
              isLoading={isCameraLoading}
              error={errorMessage}
              faceBox={faceBox}
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
          />

          {/* Action Controls */}
          <CaptureControls
            currentStep={currentStep}
            consentConfirmed={consentConfirmed}
            isFaceDetected={isFaceDetected}
            isCentered={isCentered}
            isAllCaptured={isAllCaptured}
            isSubmitting={isSubmitting}
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
