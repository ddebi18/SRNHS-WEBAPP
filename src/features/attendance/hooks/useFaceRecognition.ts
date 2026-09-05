import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { fetchRegisteredStudents } from '@/features/faceRegistration/api';

const MODEL_URL = 'https://vladmandic.github.io/face-api/model';
const MATCH_THRESHOLD = 0.6;

export interface RecognizedStudent {
  id: string;
  name: string;
  studentNumber: string;
  confidence: number;
}

interface UseFaceRecognitionReturn {
  isLoading: boolean;
  isReady: boolean;
  matchedStudent: RecognizedStudent | null;
  error: string | null;
}

export function useFaceRecognition(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean
): UseFaceRecognitionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [matchedStudent, setMatchedStudent] = useState<RecognizedStudent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const matcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const reset = () => {
      setIsLoading(false);
      setIsReady(false);
      setMatchedStudent(null);
      setError(null);
      matcherRef.current = null;
    };

    if (!active || !videoRef.current) {
      reset();
      return;
    }

    const initialize = async () => {
      setIsLoading(true);
      setError(null);

      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        const students = await fetchRegisteredStudents();
        const labeledDescriptors = (await Promise.all(students.map(async student => {
          const imageUrl = student.registeredPhotos?.front || student.photoUrl;
          if (!imageUrl) return null;

          try {
            const image = await faceapi.fetchImage(imageUrl);
            const detection = await faceapi
              .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
              .withFaceLandmarks()
              .withFaceDescriptor();

            return detection
              ? new faceapi.LabeledFaceDescriptors(student.id, [detection.descriptor])
              : null;
          } catch (imageError) {
            console.warn(`Could not create face descriptor for ${student.id}:`, imageError);
            return null;
          }
        }))).filter((descriptor): descriptor is faceapi.LabeledFaceDescriptors => Boolean(descriptor));

        if (cancelled) return;
        if (labeledDescriptors.length === 0) {
          throw new Error('No registered face descriptors are available for recognition.');
        }

        matcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);
        setIsLoading(false);
        setIsReady(true);

        interval = setInterval(async () => {
          const video = videoRef.current;
          const matcher = matcherRef.current;
          if (!video || !matcher || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || processingRef.current) return;

          processingRef.current = true;
          try {
            const detection = await faceapi
              .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
              .withFaceLandmarks()
              .withFaceDescriptor();

            if (!detection) {
              setMatchedStudent(null);
              return;
            }

            const bestMatch = matcher.findBestMatch(detection.descriptor);
            if (bestMatch.label === 'unknown') {
              setMatchedStudent(null);
              return;
            }

            const student = students.find(candidate => candidate.id === bestMatch.label);
            if (student) {
              setMatchedStudent({
                id: student.id,
                name: student.name,
                studentNumber: student.studentNumber,
                confidence: Math.max(0, Math.min(1, 1 - bestMatch.distance)),
              });
            }
          } finally {
            processingRef.current = false;
          }
        }, 1000);
      } catch (initializationError: any) {
        if (!cancelled) {
          setIsLoading(false);
          setError(initializationError?.message || 'Face recognition could not be initialized.');
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      matcherRef.current = null;
      processingRef.current = false;
    };
  }, [active, videoRef]);

  return { isLoading, isReady, matchedStudent, error };
}
