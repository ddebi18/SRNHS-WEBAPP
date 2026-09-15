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
  const steps: { key: SessionStep; label: string; shortLabel: string; angle?: CaptureAngle }[] = [
    { key: 'front',  label: 'Front',  shortLabel: 'Front',  angle: 'front' },
    { key: 'left',   label: 'Left',   shortLabel: 'Left',   angle: 'left' },
    { key: 'right',  label: 'Right',  shortLabel: 'Right',  angle: 'right' },
    { key: 'review', label: 'Review', shortLabel: 'Review' },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full">
        {steps.map((s, idx) => {
          const isCurrent = currentStep === s.key;
          const isDone = s.angle ? Boolean(capturedFrames[s.angle]) : currentStep === 'review';

          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onStepClick(s.key)}
              className={cn(
                'flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all border min-w-0',
                isCurrent
                  ? 'bg-[#2D6A4F] text-white border-[#1B4332] shadow-sm ring-2 ring-[#2D6A4F]/30'
                  : isDone
                  ? 'bg-[#E6CCB2] text-amber-950 border-[#D4A373]'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
              )}
            >
              <span className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-black shrink-0',
                isCurrent ? 'bg-white text-[#2D6A4F]' : isDone ? 'bg-amber-900 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              )}>
                {isDone ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : idx + 1}
              </span>
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

