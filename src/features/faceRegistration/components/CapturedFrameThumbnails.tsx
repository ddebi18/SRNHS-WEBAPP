import React from 'react';
import { Camera, RefreshCw, CheckCircle2 } from 'lucide-react';
import { CapturedFrame, CaptureAngle } from '../types';
import { cn } from '@/lib/utils';

interface CapturedFrameThumbnailsProps {
  capturedFrames: Record<CaptureAngle, CapturedFrame | null>;
  activeAngle: CaptureAngle | 'review';
  onRetake: (angle: CaptureAngle) => void;
}

export const CapturedFrameThumbnails: React.FC<CapturedFrameThumbnailsProps> = ({
  capturedFrames,
  activeAngle,
  onRetake,
}) => {
  const angles: { key: CaptureAngle; label: string }[] = [
    { key: 'front', label: 'Front View' },
    { key: 'left',  label: 'Slight Left' },
    { key: 'right', label: 'Slight Right' },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {angles.map(({ key, label }) => {
        const frame = capturedFrames[key];
        const isActive = activeAngle === key;

        return (
          <div
            key={key}
            className={cn(
              'rounded-2xl p-2 border transition-all flex flex-col items-center gap-2 relative group overflow-hidden',
              isActive
                ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30'
                : frame
                ? 'border-emerald-500/40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm'
                : 'border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
            )}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              {frame && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
              {label}
            </div>

            <div className="w-full h-24 sm:h-28 rounded-xl bg-slate-950 flex items-center justify-center overflow-hidden relative border border-slate-800">
              {frame ? (
                <>
                  <img
                    src={frame.previewUrl}
                    alt={`${label} capture preview`}
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  <button
                    type="button"
                    onClick={() => onRetake(key)}
                    title={`Retake ${label}`}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-bold backdrop-blur-xs"
                  >
                    <RefreshCw className="w-4 h-4" /> Retake
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-slate-500 text-[11px] font-medium">
                  <Camera className="w-5 h-5 text-slate-600 dark:text-slate-500" />
                  <span>Pending</span>
                </div>
              )}
            </div>

            {frame && (
              <button
                type="button"
                onClick={() => onRetake(key)}
                className="text-[10px] font-bold text-amber-900 dark:text-amber-300 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-2.5 h-2.5" /> Retake Angle
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
