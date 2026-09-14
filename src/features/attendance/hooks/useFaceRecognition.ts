import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { fetchRegisteredStudents } from '@/features/faceRegistration/api';

export type { RecognitionStatusInput } from '../lib/recognitionStatus';

const MODEL_URL = 'https://vladmandic.github.io/face-api/model';

// FaceMatcher distance threshold — 0.65 accommodates natural head turns, tilts, and lighting variations
const MATCH_THRESHOLD = 0.65;

// Minimum confidence (1 - distance) to accept a match. 48% provides reliable matching for real-time webcam video against reference photos.
const MIN_CONFIDENCE = 0.48;

// Number of frames to stay in 'Detecting Face...' mode before marking as Unknown (~7 seconds)
const DETECTING_GRACE_FRAMES = 20;

// Detection score threshold for SSD MobileNet.
const DETECTION_SCORE_THRESHOLD = 0.45;

// Liveness: minimum landmark movement (px sum) across frames to confirm a real face.
const LIVENESS_MOVEMENT_THRESHOLD = 1.0;
const LIVENESS_FRAMES_REQUIRED = 2;

export interface RecognizedStudent {
  id: string;
  name: string;
  studentNumber: string;
  confidence: number;
}

export interface FaceLandmarkPoint {
  x: number;
  y: number;
}

interface UseFaceRecognitionReturn {
  isLoading: boolean;
  isReady: boolean;
  matchedStudent: RecognizedStudent | null;
  error: string | null;
  landmarks: FaceLandmarkPoint[] | null;
  isLive: boolean;
  isAnalyzing: boolean;
}

/**
 * Load an image from a URL (supports both HTTP URLs and data: URLs).
 * faceapi.fetchImage can fail silently on data URLs in some browsers,
 * so we fall back to direct HTMLImageElement loading.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url.substring(0, 60)}...`));
    img.src = url;
  });
}

export function useFaceRecognition(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean
): UseFaceRecognitionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [matchedStudent, setMatchedStudent] = useState<RecognizedStudent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<FaceLandmarkPoint[] | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const matcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const processingRef = useRef(false);
  const stabilityRef = useRef<{ studentId: string; count: number }>({ studentId: '', count: 0 });
  const unmatchedCountRef = useRef(0);
  const consecutiveMissRef = useRef(0);
  // Liveness: track landmark positions across frames to detect movement
  const landmarkHistoryRef = useRef<number[][]>([]);
  const studentsRef = useRef<any[]>([]);
  const lastConfirmedMatchRef = useRef<{ student: RecognizedStudent; timestamp: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const reset = () => {
      setIsLoading(false);
      setIsReady(false);
      setMatchedStudent(null);
      setError(null);
      setLandmarks(null);
      setIsLive(false);
      setIsAnalyzing(false);
      matcherRef.current = null;
      stabilityRef.current = { studentId: '', count: 0 };
      landmarkHistoryRef.current = [];
      unmatchedCountRef.current = 0;
      consecutiveMissRef.current = 0;
      lastConfirmedMatchRef.current = null;
    };

    if (!active || !videoRef.current) {
      reset();
      return;
    }

    const initialize = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Load SSD MobileNet + landmarks + recognition
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        const students = await fetchRegisteredStudents();
        studentsRef.current = students;

        console.log(`[FaceRecognition] Building descriptors for ${students.length} registered students...`);

        const labeledDescriptors = (await Promise.all(students.map(async student => {
          // Collect ALL registered photo URLs (front, left, right) for multi-angle matching
          const photoUrls: string[] = [];
          if (student.registeredPhotos?.front) photoUrls.push(student.registeredPhotos.front);
          if (student.registeredPhotos?.left) photoUrls.push(student.registeredPhotos.left);
          if (student.registeredPhotos?.right) photoUrls.push(student.registeredPhotos.right);
          // Fallback to single photoUrl if no structured photos exist
          if (photoUrls.length === 0 && student.photoUrl) photoUrls.push(student.photoUrl);

          if (photoUrls.length === 0) {
            console.warn(`[FaceRecognition] No photo URLs for ${student.name} (${student.id})`);
            return null;
          }

          // Build a descriptor from each angle photo
          const descriptors: Float32Array[] = [];
          for (const url of photoUrls) {
            try {
              const image = await loadImage(url);
              const detection = await faceapi
                .detectSingleFace(image, new faceapi.SsdMobilenetv1Options({ minConfidence: DETECTION_SCORE_THRESHOLD }))
                .withFaceLandmarks()
                .withFaceDescriptor();

              if (detection) {
                descriptors.push(detection.descriptor);
              } else {
                console.warn(`[FaceRecognition] No face found in photo for ${student.name} (url: ${url.substring(0, 50)}…)`);
              }
            } catch (imageError) {
              console.warn(`[FaceRecognition] ✗ Failed descriptor for ${student.name} from ${url.substring(0, 50)}…:`, imageError);
            }
          }

          if (descriptors.length === 0) {
            console.warn(`[FaceRecognition] ✗ No usable descriptors for ${student.name} (${student.id})`);
            return null;
          }

          console.log(`[FaceRecognition] ✓ ${descriptors.length} descriptor(s) created for ${student.name} (front/left/right)`);
          return new faceapi.LabeledFaceDescriptors(student.id, descriptors);
        }))).filter((descriptor): descriptor is faceapi.LabeledFaceDescriptors => Boolean(descriptor));

        if (cancelled) return;

        if (labeledDescriptors.length === 0) {
          setIsLoading(false);
          setError('No face descriptors could be loaded from registered photos. Please re-register student faces.');
          return;
        }

        console.log(`[FaceRecognition] Matcher ready with ${labeledDescriptors.length} descriptors (threshold: ${MATCH_THRESHOLD})`);
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
              .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: DETECTION_SCORE_THRESHOLD }))
              .withFaceLandmarks()
              .withFaceDescriptor();

            if (!detection) {
              consecutiveMissRef.current += 1;
              // Allow a 4-frame grace period (~1.4s) for head movement, looking away, or momentary obstructions
              if (consecutiveMissRef.current > 4) {
                stabilityRef.current = { studentId: '', count: 0 };
                landmarkHistoryRef.current = [];
                lastConfirmedMatchRef.current = null;
                setMatchedStudent(null);
                setLandmarks(null);
                setIsLive(false);
                setIsAnalyzing(false);
                unmatchedCountRef.current = 0;
              }
              return;
            }

            consecutiveMissRef.current = 0;

            // Extract landmark points (68 points)
            const pts = detection.landmarks.positions;
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            const normalizedLandmarks: FaceLandmarkPoint[] = pts.map(p => ({
              x: p.x / vw,
              y: p.y / vh,
            }));
            setLandmarks(normalizedLandmarks);

            // ── Liveness detection via landmark movement ──
            const keyPoints = [30, 36, 45, 48, 54];
            const currentKeyPositions = keyPoints.map(i => [pts[i]!.x, pts[i]!.y]).flat();
            const history = landmarkHistoryRef.current;
            history.push(currentKeyPositions);
            if (history.length > LIVENESS_FRAMES_REQUIRED) {
              history.shift();
            }

            let liveDetected = true;
            if (history.length >= LIVENESS_FRAMES_REQUIRED) {
              let totalMovement = 0;
              for (let i = 1; i < history.length; i++) {
                for (let j = 0; j < history[i]!.length; j++) {
                  totalMovement += Math.abs(history[i]![j]! - history[i - 1]![j]!);
                }
              }
              liveDetected = totalMovement > LIVENESS_MOVEMENT_THRESHOLD;
            }
            setIsLive(liveDetected);

            // ── Face matching ──
            const bestMatch = matcher.findBestMatch(detection.descriptor);
            const confidence = Math.max(0, Math.min(1, 1 - bestMatch.distance));
            const isMatchValid = bestMatch.label !== 'unknown' && confidence >= MIN_CONFIDENCE;

            if (isMatchValid) {
              // Valid candidate match found!
              unmatchedCountRef.current = 0;
              setIsAnalyzing(false);

              const student = studentsRef.current.find((c: any) => c.id === bestMatch.label);
              if (student) {
                const matchObj: RecognizedStudent = {
                  id: student.id,
                  name: student.name,
                  studentNumber: student.studentNumber,
                  confidence,
                };
                lastConfirmedMatchRef.current = { student: matchObj, timestamp: Date.now() };
                setMatchedStudent(matchObj);
              }
            } else {
              // Frame was not directly matched
              unmatchedCountRef.current += 1;

              // If we recently confirmed a match within the last 2.2 seconds, retain the match during movement/tilt
              const recentMatch = lastConfirmedMatchRef.current;
              if (recentMatch && (Date.now() - recentMatch.timestamp < 2200)) {
                setMatchedStudent(recentMatch.student);
                setIsAnalyzing(false);
              } else {
                setMatchedStudent(null);
                // While tracking face without match, show 'Detecting...' for the grace period before displaying Unknown
                if (unmatchedCountRef.current <= DETECTING_GRACE_FRAMES) {
                  setIsAnalyzing(true);
                } else {
                  setIsAnalyzing(false);
                }
              }
            }
          } finally {
            processingRef.current = false;
          }
        }, 300);
      } catch (initializationError: any) {
        if (!cancelled) {
          setIsLoading(false);
          setError(initializationError?.message || 'Face recognition could not be initialized.');
          console.error('[FaceRecognition] Init failed:', initializationError);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      matcherRef.current = null;
      processingRef.current = false;
      stabilityRef.current = { studentId: '', count: 0 };
      landmarkHistoryRef.current = [];
      unmatchedCountRef.current = 0;
      consecutiveMissRef.current = 0;
      lastConfirmedMatchRef.current = null;
    };
  }, [active, videoRef]);

  return { isLoading, isReady, matchedStudent, error, landmarks, isLive, isAnalyzing };
}
