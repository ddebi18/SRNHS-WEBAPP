import React from 'react';
import { Check } from 'lucide-react';
import { SessionStep } from '../hooks/useFaceCaptureSession';
import { CapturedFrame, CaptureAngle } from '../types';
import { cn } from '@/lib/utils';

interface CaptureProgressDotsProps {
  currentStep: SessionStep;
  capturedFrames: Record<CaptureAngle, CapturedFrame | null>;
  onStepClick: (step: SessionStep) => void;
}

export const CaptureProgressDots: React.FC<CaptureProgressDotsProps> = ({
  currentStep,
  capturedFrames,
  onStepClick,
}) => {
  const steps: { key: SessionStep; label: string; angle?: CaptureAngle }[] = [
    { key: 'front',  label: '1. Front', angle: 'front' },
    { key: 'left',   label: '2. Left',  angle: 'left' },
    { key: 'right',  label: '3. Right', angle: 'right' },
    { key: 'review', label: '4. Review' },
  ];

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-1">
      {steps.map((s, idx) => {
        const isCurrent = currentStep === s.key;
        const isDone = s.angle ? Boolean(capturedFrames[s.angle]) : currentStep === 'review';

        return (
          <React.Fragment key={s.key}>
            <button
              type="button"
              onClick={() => onStepClick(s.key)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
                isCurrent
                  ? 'bg-[#2D6A4F] text-white border-[#1B4332] shadow-sm'
                  : isDone
                  ? 'bg-[#E6CCB2] text-amber-950 border-[#D4A373]'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
              )}
            >
              <span className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black',
                isCurrent ? 'bg-white text-[#2D6A4F]' : isDone ? 'bg-amber-900 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              )}>
                {isDone ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : idx + 1}
              </span>
              <span>{s.label}</span>
            </button>
            {idx < steps.length - 1 && (
              <div className={cn(
                'flex-1 h-0.5 rounded-full transition-colors',
                isDone ? 'bg-[#D4A373]' : 'bg-slate-200 dark:bg-slate-800'
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
