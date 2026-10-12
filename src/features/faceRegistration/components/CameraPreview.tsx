import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FaceBox } from '../hooks/useFaceDetection';
import { CaptureAngle } from '../types';
import { cn } from '@/lib/utils';
import { mapVideoFaceBoxToViewport } from '@/lib/faceOverlayGeometry';

interface CameraPreviewProps {
  stream: MediaStream | null;
  isLoading: boolean;
  error: string | null;
  detectorError?: string | null;
  faceBox?: FaceBox | null;
  allFaceBoxes?: FaceBox[];
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
      detectorError,
      faceBox,
      allFaceBoxes,
      isFaceDetected,
      isCentered,
      currentAngle,
      onRetryPermission,
    },
    ref
  ) => {
    const viewfinderRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
      // Resolve the forwarded ref to the actual element
      const video =
        typeof ref === 'function' ? null : ref?.current ?? null;
      if (video && stream) {
        video.srcObject = stream;
        video.play().catch(e => console.warn('Video play deferred:', e));
      }
    }, [stream, ref]);

    const getOverlayStyle = (box: FaceBox): React.CSSProperties => {
      const viewport = viewfinderRef.current?.getBoundingClientRect();
      const mapped = viewport
        ? mapVideoFaceBoxToViewport(
            box,
            { width: viewport.width, height: viewport.height },
            'cover',
            true
          )
        : null;

      if (!mapped) return { display: 'none' };

      return {
        left: `${mapped.left}%`,
        top: `${mapped.top}%`,
        width: `${mapped.width}%`,
        height: `${mapped.height}%`,
      };
    };

    return (
      <div ref={viewfinderRef} className="relative w-full h-72 sm:h-80 bg-slate-950 rounded-2xl overflow-hidden shadow-inner border border-slate-800 flex items-center justify-center">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 text-emerald-400 p-6 text-center">
            <div className="w-10 h-10 border-3 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
            <span className="text-xs font-bold tracking-wide uppercase text-slate-300">Initializing Edge SCRFD Detector Camera…</span>
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

            {detectorError && (
              <div className="absolute z-20 top-14 left-3 right-3 rounded-lg border border-rose-500/60 bg-rose-950/90 px-3 py-2 text-xs font-medium text-rose-100">
                Face detector unavailable: {detectorError}
              </div>
            )}

            {/* Additional Detected Multi-Faces (SCRFD) */}
            {allFaceBoxes && allFaceBoxes.length > 0 && allFaceBoxes.map((b, idx) => {
              const isPrimary = faceBox && (
                Math.hypot(
                  (b.x + b.width / 2) - (faceBox.x + faceBox.width / 2),
                  (b.y + b.height / 2) - (faceBox.y + faceBox.height / 2)
                ) < Math.max(28, Math.min(b.width, b.height) * 0.45)
              );
              if (isPrimary) return null;
              return (
                <div
                  key={`multi_box_${idx}`}
                  className="absolute border-2 border-amber-400/80 rounded-lg pointer-events-none transition-all duration-150 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                  style={getOverlayStyle(b)}
                >
                  <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500 text-slate-950">
                    Background Face
                  </span>
                </div>
              );
            })}

            {/* Primary Target Face Bounding Box */}
            {faceBox && (
              <div
                className="absolute border-2 border-emerald-400 rounded-lg pointer-events-none transition-all duration-150 shadow-[0_0_12px_rgba(52,211,153,0.4)]"
                style={getOverlayStyle(faceBox)}
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
                  {isFaceDetected ? (isCentered ? 'SCRFD Face Aligned' : 'Center Face') : 'Position Face'}
                </div>
              </div>

              {/* Top HUD Specs */}
              <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-white/50 bg-slate-950/70 backdrop-blur px-3 py-1 rounded-xl border border-white/10">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  SCRFD-2.5G · ONNX Multi-Face Engine
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
