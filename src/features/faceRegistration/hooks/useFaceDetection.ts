import { useState, useEffect, useRef } from 'react';
import { FaceDetector } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
import { CaptureAngle } from '../types';
import {
  getScrfdSession,
  detectFacesWithScrfd,
  ScrfdFaceBox,
  type ScrfdStageTimings,
  visionWasmFileset,
} from '../lib/scrfdDetector';
import { captureFaceFrame } from '@/features/attendance/lib/faceNetEngine';
import {
  FACE_DIAGNOSTICS_ENABLED,
  FACE_ATTEMPT_LOGS_ENABLED,
  FACE_MOTION_OPTIMIZATIONS_ENABLED,
  FACE_STARTUP_OPTIMIZATIONS_ENABLED,
  isRecentFaceDetection,
  isMobileFaceOptimizationActive,
} from '@/features/attendance/lib/faceOptimizationFlags';
import { getMedianAndP90 } from '@/features/attendance/lib/faceRecognitionDiagnostics';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
  score?: number;
  landmarks?: [number, number][];
  detectorSource?: 'scrfd' | 'fallback';
  frameCapturedAt?: number;
  detectionResultAt?: number;
  frameTimestamp?: number;
  snapshotDurationMs?: number;
  scrfdDurationMs?: number;
}

export interface FaceDetectionFrame {
  source: HTMLCanvasElement;
  capturedAt: number;
  snapshotDurationMs: number;
  scrfdDurationMs: number;
  frameTimestamp: number;
  resultArrivedAt: number;
  frameId: number;
  boxes: FaceBox[];
}

export interface UseFaceDetectionReturn {
  isFaceDetected: boolean;
  isCentered: boolean;
  faceBox: FaceBox | null;
  allFaceBoxes: FaceBox[];
  allFaceBoxesRef: React.MutableRefObject<FaceBox[]>;
  detectionFrameRef: React.MutableRefObject<FaceDetectionFrame | null>;
  warningMessage: string | null;
  detectorError: string | null;
  startupTimings: { scrfdLoadMs: number | null; mediaPipeLoadMs: number | null };
}

const LIVE_FACE_SCAN_INTERVAL_MS = 200;

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  currentAngle: CaptureAngle,
  active: boolean,
  options?: {
    maxMissedFrames?: number;
    useMediaPipeFallback?: boolean;
    modelUrl?: string;
    motionRecognitionFeed?: boolean;
  }
): UseFaceDetectionReturn {
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isCentered, setIsCentered] = useState(false);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [allFaceBoxes, setAllFaceBoxes] = useState<FaceBox[]>([]);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const [startupTimings, setStartupTimings] = useState<UseFaceDetectionReturn['startupTimings']>({
    scrfdLoadMs: null,
    mediaPipeLoadMs: null,
  });

  const allFaceBoxesRef = useRef<FaceBox[]>([]);
  const detectionFrameRef = useRef<FaceDetectionFrame | null>(null);
  const nextFrameIdRef = useRef(0);
  const scrfdSessionRef = useRef<ort.InferenceSession | null>(null);
  const mediaPipeDetectorRef = useRef<FaceDetector | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missedFramesRef = useRef(0);
  const faceBoxRef = useRef<FaceBox | null>(null);
  const lastFaceDetectionAtRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  const MAX_MISSED_FRAMES = options?.maxMissedFrames ?? 4;

  useEffect(() => {
    let cancelled = false;
    let videoFrameHandle: number | null = null;
    let mediaPipeLoadingPromise: Promise<FaceDetector | null> | null = null;
    let visibilityHandler: (() => void) | null = null;
    const scrfdTimingSamples: ScrfdStageTimings[] = [];
    let scrfdTimingWindowStartedAt = performance.now();

    const shouldPause = () =>
      isMobileFaceOptimizationActive() && document.visibilityState === 'hidden';

    const cancelScheduledDetection = () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
      intervalRef.current = null;
      const video = videoRef.current;
      if (videoFrameHandle !== null && video && 'cancelVideoFrameCallback' in video) {
        video.cancelVideoFrameCallback(videoFrameHandle);
        videoFrameHandle = null;
      }
    };

    const ensureMediaPipeDetector = (): Promise<FaceDetector | null> => {
      if (mediaPipeDetectorRef.current) return Promise.resolve(mediaPipeDetectorRef.current);
      if (mediaPipeLoadingPromise) return mediaPipeLoadingPromise;

      const loadStartedAt = performance.now();
      mediaPipeLoadingPromise = (async () => {
        const detectorOptions = {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU' as const,
          },
          runningMode: 'VIDEO' as const,
          minDetectionConfidence: 0.40,
          minSuppressionThreshold: 0.35,
        };
        let detector: FaceDetector;
        try {
          detector = await FaceDetector.createFromOptions(visionWasmFileset, detectorOptions);
        } catch {
          detector = await FaceDetector.createFromOptions(visionWasmFileset, {
            ...detectorOptions,
            baseOptions: { ...detectorOptions.baseOptions, delegate: 'CPU' },
          });
        }

        if (cancelled) {
          detector.close();
          return null;
        }

        if (FACE_STARTUP_OPTIMIZATIONS_ENABLED) {
          const warmupFrame = document.createElement('canvas');
          warmupFrame.width = 64;
          warmupFrame.height = 64;
          detector.detectForVideo(warmupFrame, performance.now());
        }
        mediaPipeDetectorRef.current = detector;
        const durationMs = performance.now() - loadStartedAt;
        setStartupTimings(current => ({ ...current, mediaPipeLoadMs: durationMs }));
        if (import.meta.env.DEV) {
          if (FACE_DIAGNOSTICS_ENABLED) {
            console.info(`[FaceDetection] MediaPipe fallback loaded and warmed in ${durationMs.toFixed(0)}ms.`);
          }
        }
        return detector;
      })().catch(error => {
        mediaPipeLoadingPromise = null;
        if (!cancelled) {
          console.warn('[FaceDetection] MediaPipe fallback initialization failed:', error);
        }
        return null;
      });

      return mediaPipeLoadingPromise;
    };

    const resetDetection = () => {
      missedFramesRef.current = 0;
      faceBoxRef.current = null;
      allFaceBoxesRef.current = [];
      setIsFaceDetected(false);
      setIsCentered(false);
      setFaceBox(null);
      setAllFaceBoxes(current => current.length === 0 ? current : []);
    };

    if (!active || !videoRef.current) {
      cancelScheduledDetection();
      resetDetection();
      detectionFrameRef.current = null;
      setWarningMessage(null);
      setDetectorError(null);
      setStartupTimings({ scrfdLoadMs: null, mediaPipeLoadMs: null });
      lastFaceDetectionAtRef.current = null;
      return;
    }

    const checkFace = async () => {
      const video = videoRef.current;
      if (shouldPause() || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (isProcessingRef.current) return;

      isProcessingRef.current = true;

      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const useMotionSnapshot = FACE_MOTION_OPTIMIZATIONS_ENABLED &&
          options?.motionRecognitionFeed === true;
        const snapshotStartedAt = performance.now();
        const snapshot = useMotionSnapshot ? captureFaceFrame(video) : null;
        const snapshotDurationMs = performance.now() - snapshotStartedAt;
        let motionSnapshot = snapshot?.source ?? null;
        let detectionSource = motionSnapshot ?? video;
        let capturedAt = snapshot?.capturedAt ?? performance.now();
        let frameTimestamp = snapshot?.frameTimestamp ?? video.currentTime;
        let detectedBoxes: FaceBox[] = [];
        let scrfdFailed = false;
        let scrfdDurationMs = 0;

        // 1. Try SCRFD ONNX Detection
        if (scrfdSessionRef.current) {
          try {
            const scrfdStartedAt = performance.now();
            const rawScrfdBoxes: ScrfdFaceBox[] = await detectFacesWithScrfd(
              scrfdSessionRef.current,
              detectionSource,
              0.4,
              0.4,
              timing => {
                if (!FACE_DIAGNOSTICS_ENABLED) return;
                scrfdTimingSamples.push(timing);
                if (scrfdTimingSamples.length > 100) scrfdTimingSamples.shift();
                if (FACE_ATTEMPT_LOGS_ENABLED) {
                  console.debug('[FaceDetection] SCRFD stage timing', {
                    frameTimestamp,
                    resultArrivedAt: Number(performance.now().toFixed(1)),
                    ...timing,
                  });
                }
              }
            );
            scrfdDurationMs = performance.now() - scrfdStartedAt;
            detectedBoxes = rawScrfdBoxes.map((b) => ({
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              videoWidth: b.videoWidth,
              videoHeight: b.videoHeight,
              score: b.score,
              landmarks: b.landmarks,
              detectorSource: 'scrfd',
            }));
          } catch (scrfdErr) {
            scrfdFailed = true;
            console.warn('[FaceDetection] SCRFD inference tick failed, falling back to MediaPipe:', scrfdErr);
          }
        }

        const recentlyDetectedFace = isRecentFaceDetection(
          lastFaceDetectionAtRef.current,
          performance.now()
        );
        const shouldUseMediaPipe = FACE_STARTUP_OPTIMIZATIONS_ENABLED
          ? scrfdFailed || !scrfdSessionRef.current || recentlyDetectedFace
          : scrfdFailed ||
            !scrfdSessionRef.current ||
            options?.useMediaPipeFallback !== false;
        if (detectedBoxes.length === 0 && shouldUseMediaPipe) {
          const fallback = mediaPipeDetectorRef.current ?? await ensureMediaPipeDetector();
          if (fallback && useMotionSnapshot && videoRef.current) {
            const fallbackSnapshot = captureFaceFrame(videoRef.current);
            if (fallbackSnapshot) {
              motionSnapshot = fallbackSnapshot.source;
              detectionSource = fallbackSnapshot.source;
              capturedAt = fallbackSnapshot.capturedAt;
              frameTimestamp = fallbackSnapshot.frameTimestamp;
            }
          }
          const result = fallback?.detectForVideo(detectionSource, performance.now());
          if (result?.detections && result.detections.length > 0) {
            for (const det of result.detections) {
              const b = det.boundingBox;
              const score = det.categories?.[0]?.score;
              if (b && b.width > 0 && b.height > 0 && typeof score === 'number' && score >= 0.45) {
                detectedBoxes.push({
                  x: b.originX,
                  y: b.originY,
                  width: b.width,
                  height: b.height,
                  videoWidth: vw,
                  videoHeight: vh,
                  score,
                  detectorSource: 'fallback',
                });
              }
            }
          }
        }

        if (cancelled || shouldPause()) return;
        const resultArrivedAt = performance.now();
        detectedBoxes = detectedBoxes.map(box => ({
          ...box,
          frameCapturedAt: capturedAt,
          detectionResultAt: resultArrivedAt,
          frameTimestamp,
          snapshotDurationMs,
          scrfdDurationMs,
        }));
        if (detectedBoxes.length > 0) lastFaceDetectionAtRef.current = resultArrivedAt;
        if (motionSnapshot) {
          detectionFrameRef.current = {
            source: motionSnapshot,
            capturedAt,
            snapshotDurationMs,
            scrfdDurationMs,
            frameTimestamp,
            resultArrivedAt,
            frameId: ++nextFrameIdRef.current,
            boxes: detectedBoxes,
          };
        }

        // Find primary locked face by size and frame-to-frame continuity
        let bestBox: FaceBox | null = null;
        let maxScore = -1;
        const prevBox = faceBoxRef.current;

        if (detectedBoxes.length > 0) {
          for (const box of detectedBoxes) {
            const area = box.width * box.height;
            let score = area;

            if (prevBox) {
              const cx = box.x + box.width / 2;
              const cy = box.y + box.height / 2;
              const prevCx = prevBox.x + prevBox.width / 2;
              const prevCy = prevBox.y + prevBox.height / 2;
              const dist = Math.hypot(cx - prevCx, cy - prevCy);
              if (dist < Math.max(vw, vh) * 0.45) {
                score *= 1.6;
              }
            }

            if (score > maxScore) {
              maxScore = score;
              bestBox = box;
            }
          }
        }

        if (bestBox) {
          missedFramesRef.current = 0;

          // Velocity-sensitive exponential smoothing
          const prev = faceBoxRef.current;
          let targetBox: FaceBox;
          if (!useMotionSnapshot && prev && prev.videoWidth === vw && prev.videoHeight === vh) {
            const moveDelta = Math.hypot(bestBox.x - prev.x, bestBox.y - prev.y);
            const alpha = moveDelta > 30 ? 0.85 : moveDelta > 12 ? 0.70 : 0.50;

            targetBox = {
              ...bestBox,
              x: prev.x * (1 - alpha) + bestBox.x * alpha,
              y: prev.y * (1 - alpha) + bestBox.y * alpha,
              width: prev.width * (1 - alpha) + bestBox.width * alpha,
              height: prev.height * (1 - alpha) + bestBox.height * alpha,
              videoWidth: vw,
              videoHeight: vh,
            };
          } else {
            targetBox = { ...bestBox, videoWidth: vw, videoHeight: vh };
          }

          faceBoxRef.current = targetBox;
          allFaceBoxesRef.current = detectedBoxes;
          const centerX = targetBox.x + targetBox.width / 2;
          const centerY = targetBox.y + targetBox.height / 2;
          const isFaceCentered = Math.abs(centerX / vw - 0.5) < 0.35 && Math.abs(centerY / vh - 0.5) < 0.35;

          setIsFaceDetected(true);
          setFaceBox(targetBox);
          setAllFaceBoxes(detectedBoxes);
          setIsCentered(isFaceCentered);

          if (currentAngle === 'front') {
            setWarningMessage(isFaceCentered ? null : 'Center face slightly for optimal registration.');
          } else if (currentAngle === 'left') {
            setWarningMessage('Slight left tilt recognized. Hold position for capture.');
          } else if (currentAngle === 'right') {
            setWarningMessage('Slight right tilt recognized. Hold position for capture.');
          }
        } else {
          allFaceBoxesRef.current = [];
          setAllFaceBoxes([]);
          missedFramesRef.current += 1;
          if (missedFramesRef.current > MAX_MISSED_FRAMES) {
            resetDetection();
          }
        }
      } catch (error) {
        resetDetection();
        setDetectorError(error instanceof Error ? error.message : 'Face detection failed while reading camera.');
      } finally {
        isProcessingRef.current = false;
      }
    };

    const initializeDetectors = async () => {
      // Step A: Load SCRFD Session
      const scrfdLoadStartedAt = performance.now();
      try {
        console.log('[FaceDetection] Initializing SCRFD ONNX Detector...');
        const scrfdSession = await getScrfdSession(
          options?.modelUrl ?? '/models/scrfd/scrfd_2.5g_bnkps.onnx'
        );
        if (!cancelled) {
          scrfdSessionRef.current = scrfdSession;
          const durationMs = performance.now() - scrfdLoadStartedAt;
          setStartupTimings(current => ({ ...current, scrfdLoadMs: durationMs }));
          if (FACE_DIAGNOSTICS_ENABLED) console.info(`[FaceDetection] SCRFD ready in ${durationMs.toFixed(0)}ms.`);
        }
      } catch (scrfdError) {
        setStartupTimings(current => ({
          ...current,
          scrfdLoadMs: performance.now() - scrfdLoadStartedAt,
        }));
        console.warn('[FaceDetection] SCRFD initialization failed; proceeding to MediaPipe fallback:', scrfdError);
      }

      if ((!FACE_STARTUP_OPTIMIZATIONS_ENABLED || !scrfdSessionRef.current) && !cancelled) {
        await ensureMediaPipeDetector();
      }

      if (cancelled) return;

      if (!scrfdSessionRef.current && !mediaPipeDetectorRef.current) {
        resetDetection();
        setDetectorError('Face detector engines could not start. Check detector runtime/model assets and WebAssembly support.');
        setWarningMessage('Face detector could not be loaded. Check the detector assets and retry.');
        return;
      }

      setDetectorError(null);
      const scheduleDetectionLoop = (delay: number) => {
        cancelScheduledDetection();
        intervalRef.current = setTimeout(() => {
          intervalRef.current = null;
          if (cancelled || shouldPause()) return;
          const video = videoRef.current;
          if (isMobileFaceOptimizationActive() && video && typeof video.requestVideoFrameCallback === 'function') {
            videoFrameHandle = video.requestVideoFrameCallback(() => {
              videoFrameHandle = null;
              void runDetectionLoop();
            });
          } else {
            void runDetectionLoop();
          }
        }, delay);
      };

      const runDetectionLoop = async () => {
        if (cancelled || shouldPause()) return;
        const startedAt = performance.now();
        await checkFace();
        if (cancelled || shouldPause()) return;
        console.debug('[FaceDetection] Frame diagnostics', {
          detectedBoxes: allFaceBoxesRef.current.length,
          durationMs: performance.now() - startedAt,
        });
        if (FACE_DIAGNOSTICS_ENABLED && performance.now() - scrfdTimingWindowStartedAt >= 10_000) {
          const stages = ['preprocessMs', 'inferenceMs', 'decodeMs', 'nmsMs'] as const;
          console.table(stages.map(stage => {
            const values = scrfdTimingSamples.map(sample => sample[stage]);
            const { median, p90 } = getMedianAndP90(values);
            return {
              stage,
              averageMs: values.length
                ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
                : null,
              medianMs: median,
              p90Ms: p90,
              samples: values.length,
            };
          }));
          scrfdTimingSamples.length = 0;
          scrfdTimingWindowStartedAt = performance.now();
        }
        const delay = Math.max(0, LIVE_FACE_SCAN_INTERVAL_MS - (performance.now() - startedAt));
        scheduleDetectionLoop(delay);
      };

      visibilityHandler = () => {
        if (shouldPause()) {
          cancelScheduledDetection();
        } else {
          void runDetectionLoop();
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
      void runDetectionLoop();
    };

    void initializeDetectors();

    return () => {
      cancelled = true;
      cancelScheduledDetection();
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      mediaPipeDetectorRef.current?.close();
      mediaPipeDetectorRef.current = null;
    };
  }, [
    active,
    videoRef,
    currentAngle,
    options?.maxMissedFrames,
    options?.modelUrl,
    options?.useMediaPipeFallback,
  ]);

  return {
    isFaceDetected,
    isCentered,
    faceBox,
    allFaceBoxes,
    allFaceBoxesRef,
    detectionFrameRef,
    warningMessage,
    detectorError,
    startupTimings,
  };
}
