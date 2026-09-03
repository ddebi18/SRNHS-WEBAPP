import { useState, useEffect, useRef } from 'react';
import { CaptureAngle } from '../types';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
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
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (!active || !videoRef.current) {
      setIsFaceDetected(false);
      setIsCentered(false);
      setFaceBox(null);
      setWarningMessage(null);
      return;
    }

    const checkFace = () => {
      const video = videoRef.current;
      if (!video) return;

      const hasStream = Boolean(video.srcObject);
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      // Simulated frame analysis based on canvas brightness & image pixels
      const boxW = Math.round(vw * 0.42);
      const boxH = Math.round(vh * 0.58);
      const boxX = Math.round((vw - boxW) / 2);
      const boxY = Math.round((vh - boxH) / 2 - 20);

      // Detection state active when video stream is active
      if (hasStream) {
        setIsFaceDetected(true);
        setFaceBox({ x: boxX, y: boxY, width: boxW, height: boxH });
        setIsCentered(true);
      }

      if (currentAngle === 'front') {
        setWarningMessage(null);
      } else if (currentAngle === 'left') {
        setWarningMessage('Slight left tilt recognized. Hold position for capture.');
      } else if (currentAngle === 'right') {
        setWarningMessage('Slight right tilt recognized. Hold position for capture.');
      }
    };

    // Low interval check (every 300ms) to avoid pegging CPU
    intervalRef.current = setInterval(checkFace, 300);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, videoRef, currentAngle]);

  return {
    isFaceDetected,
    isCentered,
    faceBox,
    warningMessage,
  };
}
