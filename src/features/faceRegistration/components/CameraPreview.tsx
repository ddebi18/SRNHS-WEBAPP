import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FaceBox } from '../hooks/useFaceDetection';
import { CaptureAngle } from '../types';
import { cn } from '@/lib/utils';

interface CameraPreviewProps {
  stream: MediaStream | null;
  isLoading: boolean;
  error: string | null;
  faceBox?: FaceBox | null;
  isFaceDetected: boolean;
  isCentered: boolean;
  currentAngle: CaptureAngle | 'review';
  onRetryPermission?: () => void;
}

export const CameraPreview = React.forwardRef<HTMLVideoElement, CameraPreviewProps>(
  (
    {
      stream,
      isLoading,
      error,
      faceBox,
      isFaceDetected,
      isCentered,
      currentAngle,
      onRetryPermission,
    },
    ref
  ) => {
    useEffect(() => {
      // Resolve the forwarded ref to the actual element
      const video =
        typeof ref === 'function' ? null : ref?.current ?? null;
      if (video && stream) {
        video.srcObject = stream;
        video.play().catch(e => console.warn('Video play deferred:', e));
      }
    }, [stream, ref]);

    return (
      <div className="relative w-full h-72 sm:h-80 bg-slate-950 rounded-2xl overflow-hidden shadow-inner border border-slate-800 flex items-center justify-center">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 text-emerald-400 p-6 text-center">
            <div className="w-10 h-10 border-3 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
            <span className="text-xs font-bold tracking-wide uppercase text-slate-300">Initializing Edge Turnstile Camera…</span>
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="flex flex-col items-center gap-3 text-rose-400 p-6 max-w-sm text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100 mb-1">Camera Access Issue</div>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">{error}</p>
            </div>
            {onRetryPermission && (
              <button
                onClick={onRetryPermission}
                className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-request Access
              </button>
            )}
          </div>
        )}

        {/* Active Video Stream */}
        {!isLoading && !error && stream && (
          <>
            <video
              ref={ref}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover transform -scale-x-100" // Mirrored webcam
            />

            {faceBox && (
              <div
                className="absolute border-2 border-emerald-400 rounded-lg pointer-events-none transition-all duration-150"
                style={{
                  left: `${(faceBox.x / faceBox.videoWidth) * 100}%`,
                  top: `${(faceBox.y / faceBox.videoHeight) * 100}%`,
                  width: `${(faceBox.width / faceBox.videoWidth) * 100}%`,
                  height: `${(faceBox.height / faceBox.videoHeight) * 100}%`,
                }}
              />
            )}

            {/* Camera HUD Grid & Framing Guide Overlay */}
            <div className="absolute inset-0 pointer-events-none border border-emerald-500/20 rounded-2xl">
              {/* Corner Bracket Guides */}
              <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-emerald-400/70" />
              <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-emerald-400/70" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-emerald-400/70" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-emerald-400/70" />

              {/* Target Face Guide Oval */}
              <div className={cn(
                'absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-48 h-60 rounded-[50%] border-2 border-dashed transition-all duration-300 flex items-center justify-center',
                isFaceDetected && isCentered ? 'border-emerald-400 bg-emerald-500/10' : 'border-amber-400/60 bg-black/20'
              )}>
                <div className="text-[10px] font-mono text-emerald-300 uppercase tracking-widest bg-slate-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {isFaceDetected ? (isCentered ? 'Face Aligned' : 'Center Face') : 'Position Face'}
                </div>
              </div>

              {/* Top HUD Specs */}
              <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-white/50 bg-slate-950/70 backdrop-blur px-3 py-1 rounded-xl border border-white/10">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE 720p · ISO 200
                </span>
                <span className="capitalize font-bold text-amber-300">
                  Target: {currentAngle} View
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }
);

CameraPreview.displayName = 'CameraPreview';
