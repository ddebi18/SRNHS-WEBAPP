import { useState, useEffect, useRef } from 'react';
import { FaceDetector } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
import { CaptureAngle } from '../types';
import {
  getScrfdSession,
  detectFacesWithScrfd,
  ScrfdFaceBox,
  visionWasmFileset,
} from '../lib/scrfdDetector';

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
}

export interface UseFaceDetectionReturn {
  isFaceDetected: boolean;
  isCentered: boolean;
  faceBox: FaceBox | null;
  allFaceBoxes: FaceBox[];
  allFaceBoxesRef: React.MutableRefObject<FaceBox[]>;
  warningMessage: string | null;
  detectorError: string | null;
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
  }
): UseFaceDetectionReturn {
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isCentered, setIsCentered] = useState(false);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [allFaceBoxes, setAllFaceBoxes] = useState<FaceBox[]>([]);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [detectorError, setDetectorError] = useState<string | null>(null);

  const allFaceBoxesRef = useRef<FaceBox[]>([]);
  const scrfdSessionRef = useRef<ort.InferenceSession | null>(null);
  const mediaPipeDetectorRef = useRef<FaceDetector | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missedFramesRef = useRef(0);
  const faceBoxRef = useRef<FaceBox | null>(null);
  const isProcessingRef = useRef(false);

  const MAX_MISSED_FRAMES = options?.maxMissedFrames ?? 4;

  useEffect(() => {
    let cancelled = false;

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
      resetDetection();
      setWarningMessage(null);
      setDetectorError(null);
      return;
    }

    const checkFace = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (isProcessingRef.current) return;

      isProcessingRef.current = true;

      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        let detectedBoxes: FaceBox[] = [];
        let scrfdFailed = false;

        // 1. Try SCRFD ONNX Detection
        if (scrfdSessionRef.current) {
          try {
            const rawScrfdBoxes: ScrfdFaceBox[] = await detectFacesWithScrfd(scrfdSessionRef.current, video, 0.25, 0.4);
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

        // Avoid running a second model on every empty SCRFD frame in the live camera.
        const shouldUseMediaPipe =
          scrfdFailed ||
          !scrfdSessionRef.current ||
          options?.useMediaPipeFallback !== false;
        if (detectedBoxes.length === 0 && shouldUseMediaPipe && mediaPipeDetectorRef.current) {
          const result = mediaPipeDetectorRef.current.detectForVideo(video, performance.now());
          if (result.detections && result.detections.length > 0) {
            for (const det of result.detections) {
              const b = det.boundingBox;
              if (b && b.width > 0 && b.height > 0) {
                detectedBoxes.push({
                  x: b.originX,
                  y: b.originY,
                  width: b.width,
                  height: b.height,
                  videoWidth: vw,
                  videoHeight: vh,
                  score: det.categories?.[0]?.score || 0.8,
                  detectorSource: 'fallback',
                });
              }
            }
          }
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
          if (prev && prev.videoWidth === vw && prev.videoHeight === vh) {
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
      try {
        console.log('[FaceDetection] Initializing SCRFD ONNX Detector...');
        const scrfdSession = await getScrfdSession(
          options?.modelUrl ?? '/models/scrfd/scrfd_2.5g_bnkps.onnx'
        );
        if (!cancelled) {
          scrfdSessionRef.current = scrfdSession;
          console.log('[FaceDetection] SCRFD Detector ready.');
        }
      } catch (scrfdError) {
        console.warn('[FaceDetection] SCRFD initialization failed; proceeding to MediaPipe fallback:', scrfdError);
      }

      // Step B: Load MediaPipe FaceDetector as secondary fallback
      try {
        const detectorOptions = {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU' as const,
          },
          runningMode: 'VIDEO' as const,
          minDetectionConfidence: 0.40,
          minSuppressionThreshold: 0.35,
        };

        let mpDetector: FaceDetector;
        try {
          mpDetector = await FaceDetector.createFromOptions(visionWasmFileset, detectorOptions);
        } catch (gpuError) {
          mpDetector = await FaceDetector.createFromOptions(visionWasmFileset, {
            ...detectorOptions,
            baseOptions: { ...detectorOptions.baseOptions, delegate: 'CPU' },
          });
        }

        if (cancelled) {
          mpDetector.close();
          return;
        }
        mediaPipeDetectorRef.current = mpDetector;
      } catch (mpError) {
        console.warn('[FaceDetection] MediaPipe initialization failed:', mpError);
      }

      if (cancelled) return;

      if (!scrfdSessionRef.current && !mediaPipeDetectorRef.current) {
        resetDetection();
        setDetectorError('Face detector engines could not start. Check detector runtime/model assets and WebAssembly support.');
        setWarningMessage('Face detector could not be loaded. Check the detector assets and retry.');
        return;
      }

      setDetectorError(null);
      const runDetectionLoop = async () => {
        const startedAt = performance.now();
        await checkFace();
        if (cancelled) return;
        console.debug('[FaceDetection] Frame diagnostics', {
          detectedBoxes: allFaceBoxesRef.current.length,
          durationMs: performance.now() - startedAt,
        });
        const delay = Math.max(0, LIVE_FACE_SCAN_INTERVAL_MS - (performance.now() - startedAt));
        intervalRef.current = setTimeout(() => {
          void runDetectionLoop();
        }, delay);
      };
      void runDetectionLoop();
    };

    initializeDetectors();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearTimeout(intervalRef.current);
      intervalRef.current = null;
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
    warningMessage,
    detectorError,
  };
}
