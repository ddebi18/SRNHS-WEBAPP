import React from 'react';
import { UserCheck, ArrowLeft, ArrowRight, Camera } from 'lucide-react';
import { SessionStep } from '../hooks/useFaceCaptureSession';

interface LivenessStepBannerProps {
  currentStep: SessionStep;
  studentName: string;
}

export const LivenessStepBanner: React.FC<LivenessStepBannerProps> = ({ currentStep, studentName }) => {
  let title = '';
  let instruction = '';
  let Icon = Camera;

  if (currentStep === 'front') {
    title = 'Step 1 of 3: Front View';
    instruction = `Have ${studentName} look straight at the camera with a neutral expression.`;
    Icon = UserCheck;
  } else if (currentStep === 'left') {
    title = 'Step 2 of 3: Slight Left View';
    instruction = `Ask ${studentName} to turn their head slightly to the left.`;
    Icon = ArrowLeft;
  } else if (currentStep === 'right') {
    title = 'Step 3 of 3: Slight Right View';
    instruction = `Ask ${studentName} to turn their head slightly to the right.`;
    Icon = ArrowRight;
  } else if (currentStep === 'review') {
    title = 'Step 3 of 3 Completed: Review & Submit';
    instruction = 'Verify all 3 capture angles below. Retake any frame if needed before final submission.';
    Icon = Camera;
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="p-3.5 rounded-2xl bg-[#1B4332]/10 dark:bg-[#1B4332]/30 border border-[#2D6A4F]/30 flex items-start gap-3 transition-all"
    >
      <div className="w-8 h-8 rounded-xl bg-[#2D6A4F] text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-xs font-black uppercase tracking-wider text-[#1B4332] dark:text-[#52B788]">
          {title}
        </div>
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
          {instruction}
        </p>
      </div>
    </div>
  );
};
