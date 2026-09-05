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
}

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  currentAngle: CaptureAngle,
  active: boolean
): UseFaceDetectionReturn {
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isCentered, setIsCentered] = useState(false);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resetDetection = () => {
      setIsFaceDetected(false);
      setIsCentered(false);
      setFaceBox(null);
    };

    if (!active || !videoRef.current) {
      resetDetection();
      setWarningMessage(null);
      return;
    }

    const checkFace = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      const result = detector.detectForVideo(video, performance.now());
      const detection = result.detections[0];
      const box = detection?.boundingBox;

      if (!box) {
        resetDetection();
        return;
      }

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const centerX = box.originX + box.width / 2;
      const centerY = box.originY + box.height / 2;
      const isFaceCentered = Math.abs(centerX / vw - 0.5) < 0.2 && Math.abs(centerY / vh - 0.5) < 0.2;

      setIsFaceDetected(true);
      setFaceBox({
        x: box.originX,
        y: box.originY,
        width: box.width,
        height: box.height,
        videoWidth: vw,
        videoHeight: vh,
      });
      setIsCentered(isFaceCentered);

      if (currentAngle === 'front') {
        setWarningMessage(isFaceCentered ? null : 'Center your face in the guide.');
      } else if (currentAngle === 'left') {
        setWarningMessage('Slight left tilt recognized. Hold position for capture.');
      } else if (currentAngle === 'right') {
        setWarningMessage('Slight right tilt recognized. Hold position for capture.');
      }
    };

    const initializeDetector = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });

        if (cancelled) {
          detector.close();
          return;
        }

        detectorRef.current = detector;
        intervalRef.current = setInterval(checkFace, 300);
      } catch (error) {
        if (!cancelled) {
          resetDetection();
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
  }, [active, videoRef, currentAngle]);

  return {
    isFaceDetected,
    isCentered,
    faceBox,
    warningMessage,
  };
}
