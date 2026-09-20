import React from 'react';
import { Camera, Send, X } from 'lucide-react';
import { SessionStep } from '../hooks/useFaceCaptureSession';
import { cn } from '@/lib/utils';

interface CaptureControlsProps {
  currentStep: SessionStep;
  consentConfirmed: boolean;
  isFaceDetected: boolean;
  isCentered: boolean;
  isAllCaptured: boolean;
  isSubmitting: boolean;
  onCapture: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export const CaptureControls: React.FC<CaptureControlsProps> = ({
  currentStep,
  consentConfirmed,
  isFaceDetected,
  isCentered: _isCentered,
  isAllCaptured,
  isSubmitting,
  onCapture,
  onSubmit,
  onCancel,
}) => {
  const needsCenteredFace = currentStep === 'front';
  const isCaptureDisabled = !consentConfirmed || !isFaceDetected || (needsCenteredFace && !_isCentered);

  return (
    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
      >
        <X className="w-4 h-4" /> Cancel
      </button>

      <div className="flex items-center gap-2">
        {currentStep !== 'review' ? (
          <button
            type="button"
            onClick={onCapture}
            disabled={isCaptureDisabled || isSubmitting}
            className={cn(
              'px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all',
              isCaptureDisabled || isSubmitting
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-transparent'
                : 'bg-[#2D6A4F] text-white hover:bg-[#1B4332] active:scale-95 border border-[#1B4332]'
            )}
          >
            <Camera className="w-4 h-4" />
            Capture {currentStep.toUpperCase()} Angle
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!isAllCaptured || !consentConfirmed || isSubmitting}
            className={cn(
              'px-6 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all',
              !isAllCaptured || !consentConfirmed || isSubmitting
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#1B4332] via-[#2D6A4F] to-[#D4A373] text-white hover:brightness-110 active:scale-95'
            )}
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isSubmitting ? 'Registering Face Embeddings…' : 'Submit Face Registration'}
          </button>
        )}
      </div>
    </div>
  );
};
