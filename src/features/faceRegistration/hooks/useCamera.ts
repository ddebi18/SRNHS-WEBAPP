import { useState, useCallback, useEffect, useRef } from 'react';

export type CameraErrorType = 'permission-denied' | 'no-camera' | 'device-busy' | 'unknown' | null;

export interface UseCameraReturn {
  stream: MediaStream | null;
  isLoading: boolean;
  error: CameraErrorType;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useCamera(): UseCameraReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CameraErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      activeStreamRef.current = null;
    }
    setStream(null);
    setIsLoading(false);
  }, []);

  const start = useCallback(async () => {
    stop(); // Ensure any prior stream is clean
    setIsLoading(true);
    setError(null);
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('no-camera');
      setErrorMessage('Camera access is not supported by your browser or environment. Please use Chrome, Edge, or Safari.');
      setIsLoading(false);
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      activeStreamRef.current = mediaStream;
      setStream(mediaStream);
      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);
      const name = err.name || '';
      
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('permission-denied');
        setErrorMessage('Camera permission was denied. Please click the camera icon in your browser address bar and grant permission.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('no-camera');
        setErrorMessage('No camera device was detected on your system. Please connect a USB webcam or built-in camera.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('device-busy');
        setErrorMessage('Camera is currently being used by another application or tab. Please close other camera apps and retry.');
      } else {
        setError('unknown');
        setErrorMessage(err.message || 'An unexpected camera initialization error occurred.');
      }
    }
  }, [stop]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    stream,
    isLoading,
    error,
    errorMessage,
    start,
    stop,
  };
}
