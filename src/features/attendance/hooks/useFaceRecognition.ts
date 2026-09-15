import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { fetchRegisteredStudents } from '@/features/faceRegistration/api';

export type { RecognitionStatusInput } from '../lib/recognitionStatus';

const MODEL_URL = 'https://vladmandic.github.io/face-api/model';

// FaceMatcher distance threshold: 0.55 provides accurate biometric identification
// and prevents false positive matches for unregistered individuals or classmates
const MATCH_THRESHOLD = 0.55;

// Minimum confidence (1 - distance) to accept a match: 0.48 requires distance <= 0.52
const MIN_CONFIDENCE = 0.48;

// Consecutive matching frames required to verify and lock identity (eliminates 1-frame glitches)
const STABILITY_FRAMES_REQUIRED = 2;

// Number of frames to stay in 'Detecting Face...' mode before marking as Unknown (~1.3s at 220ms)
const DETECTING_GRACE_FRAMES = 6;

// Detection score threshold for SSD MobileNet: 0.38 allows detection in dim or backlit conditions
const DETECTION_SCORE_THRESHOLD = 0.38;

// ── Liveness detection constants ──────────────────────────────────────────────
// Eye Aspect Ratio thresholds
const EAR_BLINK_THRESHOLD = 0.21;
const EAR_DYNAMIC_DELTA = 0.035; // Rapid eye contraction/flutter indicates living eyelid movement

// History windows for fast liveness verification (~1-2 seconds at 220ms interval)
const HISTORY_WINDOW_FRAMES = 8;
const MIN_FRAMES_FOR_LIVENESS = 3;

// Minimum eye variance over window (living eyes naturally fluctuate; printed photos have ~0 variance)
const EYE_VARIANCE_THRESHOLD = 0.00025;

// 3D non-rigid landmark ratio variance threshold:
// A 2D photo/phone moved by hand translates rigidly (internal ratio variance ≈ 0).
// A real 3D face has natural parallax, breathing, and facial muscle elasticity (ratio variance > threshold).
const NON_RIGID_RATIO_VARIANCE_THRESHOLD = 0.00010;

// Minimum absolute motion to reject completely stationary photos on stands
const MIN_LANDMARK_MOTION = 1.2; // pixels

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

// ── EAR helper ────────────────────────────────────────────────────────────────
// Eye Aspect Ratio for one eye using 6 landmark points.
// Left eye: landmarks 36–41, Right eye: landmarks 42–47.
function computeEAR(
  p0: faceapi.Point, p1: faceapi.Point, p2: faceapi.Point,
  p3: faceapi.Point, p4: faceapi.Point, p5: faceapi.Point
): number {
  const dist = (a: faceapi.Point, b: faceapi.Point) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  const vertical1 = dist(p1, p5);
  const vertical2 = dist(p2, p4);
  const horizontal = dist(p0, p3);

  if (horizontal < 1e-6) return 0;
  return (vertical1 + vertical2) / (2 * horizontal);
}

// ── Variance helper ───────────────────────────────────────────────────────────
function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

// ── Match confidence mapping ──────────────────────────────────────────────────
// Maps distance to true biometric confidence [0.0 to 1.0] based on 128D Euclidean distance
function computeMatchConfidence(distance: number): number {
  return Math.max(0, Math.min(1, Math.round((1 - distance) * 100) / 100));
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
  // Liveness: multi-signal fast anti-spoof tracking refs
  const landmarkHistoryRef = useRef<number[][]>([]);
  const earHistoryRef = useRef<number[]>([]);
  const ratioHistoryRef = useRef<number[]>([]);
  const hasBlinkedRef = useRef(false);
  const isLiveRef = useRef(false);
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
      earHistoryRef.current = [];
      ratioHistoryRef.current = [];
      hasBlinkedRef.current = false;
      isLiveRef.current = false;
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
          // Collect distinct registered photo URLs (front, left, right)
          const photoUrlSet = new Set<string>();
          if (student.registeredPhotos?.front) photoUrlSet.add(student.registeredPhotos.front);
          if (student.registeredPhotos?.left) photoUrlSet.add(student.registeredPhotos.left);
          if (student.registeredPhotos?.right) photoUrlSet.add(student.registeredPhotos.right);
          if (photoUrlSet.size === 0 && student.photoUrl) photoUrlSet.add(student.photoUrl);

          const photoUrls = Array.from(photoUrlSet);

          if (photoUrls.length === 0) {
            console.warn(`[FaceRecognition] No photo URLs for ${student.name} (${student.id})`);
            return null;
          }

          // Build a descriptor from each distinct angle photo
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

          console.log(`[FaceRecognition] ✓ ${descriptors.length} descriptor(s) created for ${student.name}`);
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
              // Allow a 4-frame grace period (~1.0s) for head movement, looking away, or momentary obstructions
              if (consecutiveMissRef.current > 4) {
                stabilityRef.current = { studentId: '', count: 0 };
                landmarkHistoryRef.current = [];
                earHistoryRef.current = [];
                ratioHistoryRef.current = [];
                hasBlinkedRef.current = false;
                isLiveRef.current = false;
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

            // ══════════════════════════════════════════════════════════════════
            // LIVENESS DETECTION — Multi-signal anti-spoofing (Fast Verification)
            // ══════════════════════════════════════════════════════════════════

            // ── Signal 1: EAR-based blink & dynamic eye motion ───────────────
            // Left eye: landmarks 36–41, Right eye: landmarks 42–47
            const leftEAR = computeEAR(pts[36]!, pts[37]!, pts[38]!, pts[39]!, pts[40]!, pts[41]!);
            const rightEAR = computeEAR(pts[42]!, pts[43]!, pts[44]!, pts[45]!, pts[46]!, pts[47]!);
            const avgEAR = (leftEAR + rightEAR) / 2;

            const earHistory = earHistoryRef.current;
            earHistory.push(avgEAR);
            if (earHistory.length > HISTORY_WINDOW_FRAMES) {
              earHistory.shift();
            }

            const prevEAR = earHistory.length >= 2 ? earHistory[earHistory.length - 2]! : avgEAR;
            const earDelta = Math.abs(avgEAR - prevEAR);
            const isBlinkOrFlutter = avgEAR < EAR_BLINK_THRESHOLD || earDelta >= EAR_DYNAMIC_DELTA;
            if (isBlinkOrFlutter) {
              hasBlinkedRef.current = true;
            }

            const earVariance = earHistory.length >= 3 ? computeVariance(earHistory) : 0;
            const hasEyeDynamics = earVariance >= EYE_VARIANCE_THRESHOLD;

            // ── Signal 2: 3D non-rigid perspective & micro-sway ───────────────
            // Real 3D faces exhibit continuous non-rigid perspective shifts due to breathing and head micro-rotation.
            // Flat photos & phone screens (even when shaken by hand) maintain a rigid 2D planar ratio.
            const dist = (a: faceapi.Point, b: faceapi.Point) => Math.hypot(a.x - b.x, a.y - b.y);
            const interEyeDist = Math.max(1, dist(pts[36]!, pts[45]!));
            const noseToLeftEye = dist(pts[30]!, pts[36]!);
            const perspectiveRatio = noseToLeftEye / interEyeDist;

            const ratioHistory = ratioHistoryRef.current;
            ratioHistory.push(perspectiveRatio);
            if (ratioHistory.length > HISTORY_WINDOW_FRAMES) {
              ratioHistory.shift();
            }

            const keyPoints = [30, 36, 45, 48, 54]; // nose tip, eye corners, mouth corners
            const currentKeyPositions = keyPoints.map(i => [pts[i]!.x, pts[i]!.y]).flat();
            const movementHistory = landmarkHistoryRef.current;
            movementHistory.push(currentKeyPositions);
            if (movementHistory.length > HISTORY_WINDOW_FRAMES) {
              movementHistory.shift();
            }

            let totalMovement = 0;
            for (let i = 1; i < movementHistory.length; i++) {
              for (let j = 0; j < movementHistory[i]!.length; j++) {
                totalMovement += Math.abs(movementHistory[i]![j]! - movementHistory[i - 1]![j]!);
              }
            }

            const ratioVariance = ratioHistory.length >= 3 ? computeVariance(ratioHistory) : 0;
            const hasNonRigidMotion = ratioVariance >= NON_RIGID_RATIO_VARIANCE_THRESHOLD && totalMovement >= MIN_LANDMARK_MOTION;
            const hasNaturalMovement = totalMovement >= MIN_LANDMARK_MOTION;

            // ── Fast Multi-Path Liveness Decision ─────────────────────────────
            let frameIsLive = false;
            if (hasBlinkedRef.current && hasNaturalMovement) {
              frameIsLive = true;
            } else if (hasEyeDynamics && hasNaturalMovement) {
              frameIsLive = true;
            } else if (hasNonRigidMotion && movementHistory.length >= MIN_FRAMES_FOR_LIVENESS) {
              frameIsLive = true;
            }

            // Latch: once verified live, keep verified while continuously tracked
            if (frameIsLive) {
              isLiveRef.current = true;
              setIsLive(true);
            } else if (!isLiveRef.current) {
              setIsLive(false);
            }

            // ── Face matching ─────────────────────────────────────────────────
            const bestMatch = matcher.findBestMatch(detection.descriptor);
            const rawConfidence = computeMatchConfidence(bestMatch.distance);
            const isMatchValid = (
              bestMatch.label !== 'unknown' &&
              bestMatch.distance <= MATCH_THRESHOLD &&
              rawConfidence >= MIN_CONFIDENCE
            );

            if (isMatchValid) {
              const candidateId = bestMatch.label;
              if (stabilityRef.current.studentId === candidateId) {
                stabilityRef.current.count += 1;
              } else {
                stabilityRef.current = { studentId: candidateId, count: 1 };
              }

              // Multi-frame stability check: must match the same student for at least STABILITY_FRAMES_REQUIRED consecutive frames
              if (stabilityRef.current.count >= STABILITY_FRAMES_REQUIRED) {
                unmatchedCountRef.current = 0;
                setIsAnalyzing(false);

                const student = studentsRef.current.find((c: any) => c.id === candidateId);
                if (student) {
                  const matchObj: RecognizedStudent = {
                    id: student.id,
                    name: student.name,
                    studentNumber: student.studentNumber,
                    confidence: rawConfidence,
                  };
                  lastConfirmedMatchRef.current = { student: matchObj, timestamp: Date.now() };
                  setMatchedStudent(matchObj);
                }
              } else {
                // Stabilizing match across frames
                setIsAnalyzing(true);
              }
            } else {
              // Frame was not directly matched
              stabilityRef.current = { studentId: '', count: 0 };
              unmatchedCountRef.current += 1;

              // If we recently confirmed a match within the last 600ms (~2 frames), retain briefly to absorb quick blinks
              const recentMatch = lastConfirmedMatchRef.current;
              if (recentMatch && (Date.now() - recentMatch.timestamp < 600) && unmatchedCountRef.current <= 2) {
                setMatchedStudent(recentMatch.student);
                setIsAnalyzing(false);
              } else {
                lastConfirmedMatchRef.current = null;
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
        }, 220);
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
      earHistoryRef.current = [];
      ratioHistoryRef.current = [];
      hasBlinkedRef.current = false;
      isLiveRef.current = false;
      unmatchedCountRef.current = 0;
      consecutiveMissRef.current = 0;
      lastConfirmedMatchRef.current = null;
    };
  }, [active, videoRef]);

  return { isLoading, isReady, matchedStudent, error, landmarks, isLive, isAnalyzing };
}

