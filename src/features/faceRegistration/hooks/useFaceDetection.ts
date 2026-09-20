import { useState, useEffect, useRef } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { CaptureAngle } from '../types';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
}

export interface UseFaceDetectionReturn {
  isFaceDetected: boolean;
  isCentered: boolean;
  faceBox: FaceBox | null;
  warningMessage: string | null;
  detectorError: string | null;
}

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  currentAngle: CaptureAngle,
  active: boolean,
  options?: { maxMissedFrames?: number }
): UseFaceDetectionReturn {
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isCentered, setIsCentered] = useState(false);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const missedFramesRef = useRef(0);
  const faceBoxRef = useRef<FaceBox | null>(null);

  const MAX_MISSED_FRAMES = options?.maxMissedFrames ?? 4;

  useEffect(() => {
    let cancelled = false;

    const resetDetection = () => {
      missedFramesRef.current = 0;
      faceBoxRef.current = null;
      setIsFaceDetected(false);
      setIsCentered(false);
      setFaceBox(null);
    };

    if (!active || !videoRef.current) {
      resetDetection();
      setWarningMessage(null);
      setDetectorError(null);
      return;
    }

    const checkFace = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const result = detector.detectForVideo(video, performance.now());

        // Find best candidate face anywhere in the camera frame (center, side, tilted):
        // Prioritizes the user's face by bounding box area and continuity with the previous frame.
        let bestBox: { originX: number; originY: number; width: number; height: number } | null = null;
        let maxScore = -1;
        const prevBox = faceBoxRef.current;

        if (result.detections && result.detections.length > 0) {
          for (const det of result.detections) {
            const b = det.boundingBox;
            if (!b || b.width <= 0 || b.height <= 0) continue;
            const area = b.width * b.height;
            let score = area;

            // Continuity bonus: if already tracking this face, keep locked even if moving to the side
            if (prevBox) {
              const cx = b.originX + b.width / 2;
              const cy = b.originY + b.height / 2;
              const prevCx = prevBox.x + prevBox.width / 2;
              const prevCy = prevBox.y + prevBox.height / 2;
              const dist = Math.hypot(cx - prevCx, cy - prevCy);
              if (dist < Math.max(vw, vh) * 0.45) {
                score *= 1.6;
              }
            }

            if (score > maxScore) {
              maxScore = score;
              bestBox = b;
            }
          }
        }

        if (bestBox) {
          missedFramesRef.current = 0;

          // Adaptive velocity-sensitive smoothing:
          // Fast movements track responsively with high alpha; subtle movements smooth with lower alpha
          const prev = faceBoxRef.current;
          let targetBox: FaceBox;
          if (prev && prev.videoWidth === vw && prev.videoHeight === vh) {
            const moveDelta = Math.hypot(bestBox.originX - prev.x, bestBox.originY - prev.y);
            const alpha = moveDelta > 30 ? 0.85 : moveDelta > 12 ? 0.70 : 0.50;

            targetBox = {
              x: prev.x * (1 - alpha) + bestBox.originX * alpha,
              y: prev.y * (1 - alpha) + bestBox.originY * alpha,
              width: prev.width * (1 - alpha) + bestBox.width * alpha,
              height: prev.height * (1 - alpha) + bestBox.height * alpha,
              videoWidth: vw,
              videoHeight: vh,
            };
          } else {
            targetBox = {
              x: bestBox.originX,
              y: bestBox.originY,
              width: bestBox.width,
              height: bestBox.height,
              videoWidth: vw,
              videoHeight: vh,
            };
          }

          faceBoxRef.current = targetBox;
          const centerX = targetBox.x + targetBox.width / 2;
          const centerY = targetBox.y + targetBox.height / 2;
          // Generous alignment boundaries (face can be comfortably tracked anywhere in active viewfinder)
          const isFaceCentered = Math.abs(centerX / vw - 0.5) < 0.35 && Math.abs(centerY / vh - 0.5) < 0.35;

          setIsFaceDetected(true);
          setFaceBox(targetBox);
          setIsCentered(isFaceCentered);

          if (currentAngle === 'front') {
            setWarningMessage(isFaceCentered ? null : 'Center face slightly for optimal registration.');
          } else if (currentAngle === 'left') {
            setWarningMessage('Slight left tilt recognized. Hold position for capture.');
          } else if (currentAngle === 'right') {
            setWarningMessage('Slight right tilt recognized. Hold position for capture.');
          }
        } else {
          // Grace period for fast movement or momentary hand blur
          missedFramesRef.current += 1;
          if (missedFramesRef.current > MAX_MISSED_FRAMES) {
            resetDetection();
          }
        }
      } catch (error) {
        setDetectorError(error instanceof Error ? error.message : 'Face detection failed while reading the camera.');
      }
    };

    const initializeDetector = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
        );
        const detectorOptions = {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU' as const,
          },
          runningMode: 'VIDEO' as const,
          minDetectionConfidence: 0.55,
        };
        let detector: FaceDetector;

        try {
          detector = await FaceDetector.createFromOptions(vision, detectorOptions);
        } catch (gpuError) {
          console.warn('GPU face detector unavailable; retrying with CPU:', gpuError);
          detector = await FaceDetector.createFromOptions(vision, {
            ...detectorOptions,
            baseOptions: {
              ...detectorOptions.baseOptions,
              delegate: 'CPU',
            },
          });
        }

        if (cancelled) {
          detector.close();
          return;
        }

        detectorRef.current = detector;
        setDetectorError(null);
        intervalRef.current = setInterval(checkFace, 300);
      } catch (error) {
        if (!cancelled) {
          resetDetection();
          setDetectorError('Face detector could not start. Check browser camera and network permissions.');
          setWarningMessage('Face detector could not be loaded. Check the network connection and retry.');
          console.warn('MediaPipe face detector initialization failed:', error);
        }
      }
    };

    initializeDetector();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, [active, videoRef, currentAngle, options?.maxMissedFrames]);

  return {
    isFaceDetected,
    isCentered,
    faceBox,
    warningMessage,
    detectorError,
  };
}
