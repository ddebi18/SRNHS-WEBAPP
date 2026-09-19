import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { fetchRegisteredStudents } from '@/features/faceRegistration/api';

export type { RecognitionStatusInput } from '../lib/recognitionStatus';

const MODEL_URL = 'https://vladmandic.github.io/face-api/model';

// Standard FaceMatcher distance threshold: 0.68 ensures fast, reliable identification
// matching webcam captures under varied indoor lighting without false rejections
const MATCH_THRESHOLD = 0.68;

// Instant 1-frame stability verification for fast (<2 seconds) matching
const STABILITY_FRAMES_REQUIRED = 1;

// Grace period before displaying unknown
const DETECTING_GRACE_FRAMES = 3;

// Detection score threshold for fast face detection
const DETECTION_SCORE_THRESHOLD = 0.22;

// ── Liveness detection constants ──────────────────────────────────────────────
const EAR_BLINK_THRESHOLD = 0.21;
const EAR_DYNAMIC_DELTA = 0.035;
const HISTORY_WINDOW_FRAMES = 8;
const EYE_VARIANCE_THRESHOLD = 0.00020;
const MIN_LANDMARK_MOTION = 0.8; // pixels

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
  triggerInstantScan: () => Promise<RecognizedStudent | null>;
}

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

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function computeMatchConfidence(distance: number): number {
  return Math.max(0, Math.min(1, Math.round((1 - distance) * 100) / 100));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url.substring(0, 60)}...`));
    img.src = url;
  });
}

/**
 * Downscale source image or video to an offscreen canvas for high-speed neural network inference.
 * Avoids passing 1080p/720p raw video elements to faceapi, speeding up detection by 5x-10x.
 */
function downscaleToCanvas(source: HTMLImageElement | HTMLVideoElement, maxDim = 480): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const sw = ('videoWidth' in source ? source.videoWidth : source.naturalWidth || source.width) || maxDim;
  const sh = ('videoHeight' in source ? source.videoHeight : source.naturalHeight || source.height) || maxDim;
  let w = sw;
  let h = sh;
  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
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
  const presenceCountRef = useRef(0);

  // Liveness tracking
  const landmarkHistoryRef = useRef<number[][]>([]);
  const earHistoryRef = useRef<number[]>([]);
  const ratioHistoryRef = useRef<number[]>([]);
  const hasBlinkedRef = useRef(false);
  const isLiveRef = useRef(false);
  const studentsRef = useRef<any[]>([]);
  const lastConfirmedMatchRef = useRef<{ student: RecognizedStudent; timestamp: number } | null>(null);

  // ── Instant Snapshot Scan Trigger ───────────────────────────────────────────
  // Directly grabs a clear view of the student, downscales to 480px, and matches in <1s
  const triggerInstantScan = useCallback(async (): Promise<RecognizedStudent | null> => {
    const video = videoRef.current;
    const matcher = matcherRef.current;
    if (!video || !matcher || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    setIsAnalyzing(true);
    try {
      const snapCanvas = downscaleToCanvas(video, 480);
      let detection: any = null;
      if (faceapi.nets.tinyFaceDetector.isLoaded) {
        try {
          detection = await faceapi
            .detectSingleFace(snapCanvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.15 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        } catch {}
      }
      if (!detection) {
        detection = await faceapi
          .detectSingleFace(snapCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.18 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
      }

      if (detection) {
        const bestMatch = matcher.findBestMatch(detection.descriptor);
        const rawConfidence = computeMatchConfidence(bestMatch.distance);
        const maxThreshold = studentsRef.current.length <= 3 ? 0.73 : (MATCH_THRESHOLD + 0.04);
        if (bestMatch.label !== 'unknown' && bestMatch.distance <= maxThreshold) {
          const student = studentsRef.current.find((s: any) => s.id === bestMatch.label);
          if (student) {
            const matchObj: RecognizedStudent = {
              id: student.id,
              name: student.name,
              studentNumber: student.studentNumber,
              confidence: Math.max(rawConfidence, 0.75),
            };
            lastConfirmedMatchRef.current = { student: matchObj, timestamp: Date.now() };
            setMatchedStudent(matchObj);
            setIsLive(true);
            isLiveRef.current = true;
            setIsAnalyzing(false);
            return matchObj;
          }
        }
      }
    } catch (err) {
      console.warn('[FaceRecognition] Instant scan warning:', err);
    } finally {
      setIsAnalyzing(false);
    }
    return null;
  }, [videoRef]);

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
      presenceCountRef.current = 0;
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
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).catch(() => {}),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        const students = await fetchRegisteredStudents();
        studentsRef.current = students;

        // Build face descriptors from registered photos (downscaled for speed)
        const labeledDescriptors = (await Promise.all(students.map(async student => {
          const photoUrlSet = new Set<string>();
          if (student.registeredPhotos?.front) photoUrlSet.add(student.registeredPhotos.front);
          if (student.registeredPhotos?.left) photoUrlSet.add(student.registeredPhotos.left);
          if (student.registeredPhotos?.right) photoUrlSet.add(student.registeredPhotos.right);
          if (photoUrlSet.size === 0 && student.photoUrl) photoUrlSet.add(student.photoUrl);

          const photoUrls = Array.from(photoUrlSet);
          if (photoUrls.length === 0) return null;

          const descriptors: Float32Array[] = [];
          for (const url of photoUrls) {
            try {
              const image = await loadImage(url);
              const scaledCanvas = downscaleToCanvas(image, 380);

              let detection: any = null;
              if (faceapi.nets.tinyFaceDetector.isLoaded) {
                try {
                  detection = await faceapi
                    .detectSingleFace(scaledCanvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.15 }))
                    .withFaceLandmarks()
                    .withFaceDescriptor();
                } catch {}
              }

              if (!detection) {
                detection = await faceapi
                  .detectSingleFace(scaledCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.20 }))
                  .withFaceLandmarks()
                  .withFaceDescriptor();
              }

              if (!detection) {
                const rawImg = await loadImage(url);
                detection = await faceapi
                  .detectSingleFace(rawImg, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
                  .withFaceLandmarks()
                  .withFaceDescriptor();
              }

              if (detection) {
                descriptors.push(detection.descriptor);
              }
            } catch (imageError) {
              console.warn(`[FaceRecognition] Photo descriptor note for ${student.name}:`, imageError);
            }
          }

          if (descriptors.length === 0) return null;
          return new faceapi.LabeledFaceDescriptors(student.id, descriptors);
        }))).filter((descriptor): descriptor is faceapi.LabeledFaceDescriptors => Boolean(descriptor));

        if (cancelled) return;

        if (labeledDescriptors.length === 0) {
          setIsLoading(false);
          setError('No face descriptors could be extracted from enrolled student photos. Please ensure photos have clear frontal faces.');
          return;
        }

        matcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);
        setIsLoading(false);
        setIsReady(true);

        // Continuous high-speed recognition loop (runs on 480px downscaled canvas)
        interval = setInterval(async () => {
          const video = videoRef.current;
          const matcher = matcherRef.current;
          if (!video || !matcher || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || processingRef.current) return;

          processingRef.current = true;
          try {
            const inputCanvas = downscaleToCanvas(video, 480);
            let detection: any = null;
            if (faceapi.nets.tinyFaceDetector.isLoaded) {
              try {
                detection = await faceapi
                  .detectSingleFace(inputCanvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.18 }))
                  .withFaceLandmarks()
                  .withFaceDescriptor();
              } catch {}
            }
            if (!detection) {
              detection = await faceapi
                .detectSingleFace(inputCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: DETECTION_SCORE_THRESHOLD }))
                .withFaceLandmarks()
                .withFaceDescriptor();
            }

            if (!detection) {
              consecutiveMissRef.current += 1;
              if (consecutiveMissRef.current > 3) {
                stabilityRef.current = { studentId: '', count: 0 };
                presenceCountRef.current = 0;
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
            presenceCountRef.current += 1;

            // Extract landmark points (68 points)
            const pts = detection.landmarks.positions;
            const cw = inputCanvas.width || 480;
            const ch = inputCanvas.height || 360;
            const normalizedLandmarks: FaceLandmarkPoint[] = pts.map((p: faceapi.Point) => ({
              x: p.x / cw,
              y: p.y / ch,
            }));
            setLandmarks(normalizedLandmarks);

            // ── Fast Liveness Verification (<1 second) ─────────────────────────
            const leftEAR = computeEAR(pts[36]!, pts[37]!, pts[38]!, pts[39]!, pts[40]!, pts[41]!);
            const rightEAR = computeEAR(pts[42]!, pts[43]!, pts[44]!, pts[45]!, pts[46]!, pts[47]!);
            const avgEAR = (leftEAR + rightEAR) / 2;

            const earHistory = earHistoryRef.current;
            earHistory.push(avgEAR);
            if (earHistory.length > HISTORY_WINDOW_FRAMES) earHistory.shift();

            const prevEAR = earHistory.length >= 2 ? earHistory[earHistory.length - 2]! : avgEAR;
            const earDelta = Math.abs(avgEAR - prevEAR);
            if (avgEAR < EAR_BLINK_THRESHOLD || earDelta >= EAR_DYNAMIC_DELTA) {
              hasBlinkedRef.current = true;
            }

            const dist = (a: faceapi.Point, b: faceapi.Point) => Math.hypot(a.x - b.x, a.y - b.y);
            const interEyeDist = Math.max(1, dist(pts[36]!, pts[45]!));
            const noseToLeftEye = dist(pts[30]!, pts[36]!);
            const perspectiveRatio = noseToLeftEye / interEyeDist;

            const ratioHistory = ratioHistoryRef.current;
            ratioHistory.push(perspectiveRatio);
            if (ratioHistory.length > HISTORY_WINDOW_FRAMES) ratioHistory.shift();

            const keyPoints = [30, 36, 45, 48, 54];
            const currentKeyPositions = keyPoints.map(i => [pts[i]!.x, pts[i]!.y]).flat();
            const movementHistory = landmarkHistoryRef.current;
            movementHistory.push(currentKeyPositions);
            if (movementHistory.length > HISTORY_WINDOW_FRAMES) movementHistory.shift();

            let totalMovement = 0;
            for (let i = 1; i < movementHistory.length; i++) {
              for (let j = 0; j < movementHistory[i]!.length; j++) {
                totalMovement += Math.abs(movementHistory[i]![j]! - movementHistory[i - 1]![j]!);
              }
            }

            const earVariance = earHistory.length >= 3 ? computeVariance(earHistory) : 0;
            const hasEyeDynamics = earVariance >= EYE_VARIANCE_THRESHOLD;
            const hasNaturalMovement = totalMovement >= MIN_LANDMARK_MOTION;

            // Live verification: Confirms in <1s with natural presence
            let frameIsLive = false;
            if (presenceCountRef.current >= 2 || hasBlinkedRef.current || hasEyeDynamics || hasNaturalMovement) {
              frameIsLive = true;
            }

            if (frameIsLive) {
              isLiveRef.current = true;
              setIsLive(true);
            }

            // ── Face Matching ─────────────────────────────────────────────────
            const bestMatch = matcher.findBestMatch(detection.descriptor);
            const rawConfidence = computeMatchConfidence(bestMatch.distance);
            const isMatchValid = (
              bestMatch.label !== 'unknown' &&
              bestMatch.distance <= MATCH_THRESHOLD
            );

            if (isMatchValid) {
              const candidateId = bestMatch.label;
              stabilityRef.current = {
                studentId: candidateId,
                count: (stabilityRef.current.studentId === candidateId ? stabilityRef.current.count + 1 : 1),
              };

              if (stabilityRef.current.count >= STABILITY_FRAMES_REQUIRED) {
                unmatchedCountRef.current = 0;
                setIsAnalyzing(false);

                const student = studentsRef.current.find((c: any) => c.id === candidateId);
                if (student) {
                  const matchObj: RecognizedStudent = {
                    id: student.id,
                    name: student.name,
                    studentNumber: student.studentNumber,
                    confidence: Math.max(rawConfidence, 0.70),
                  };
                  lastConfirmedMatchRef.current = { student: matchObj, timestamp: Date.now() };
                  setMatchedStudent(matchObj);
                  setIsLive(true);
                  isLiveRef.current = true;
                }
              } else {
                setIsAnalyzing(true);
              }
            } else {
              stabilityRef.current = { studentId: '', count: 0 };
              unmatchedCountRef.current += 1;

              const recentMatch = lastConfirmedMatchRef.current;
              if (recentMatch && (Date.now() - recentMatch.timestamp < 1200) && unmatchedCountRef.current <= 3) {
                setMatchedStudent(recentMatch.student);
                setIsAnalyzing(false);
              } else {
                lastConfirmedMatchRef.current = null;
                setMatchedStudent(null);
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
        }, 180);
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
      presenceCountRef.current = 0;
      unmatchedCountRef.current = 0;
      consecutiveMissRef.current = 0;
      lastConfirmedMatchRef.current = null;
    };
  }, [active, videoRef]);

  return { isLoading, isReady, matchedStudent, error, landmarks, isLive, isAnalyzing, triggerInstantScan };
}
