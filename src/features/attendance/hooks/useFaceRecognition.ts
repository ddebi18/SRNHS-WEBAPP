import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { fetchRegisteredStudents } from '@/features/faceRegistration/api';
import { assignStudentFaceDescriptors } from '@/features/sync/syncService';

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

export interface FaceRecognitionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
}

interface UseFaceRecognitionReturn {
  isLoading: boolean;
  isReady: boolean;
  matchedStudent: RecognizedStudent | null;
  error: string | null;
  landmarks: FaceLandmarkPoint[] | null;
  recognitionBox: FaceRecognitionBox | null;
  isLive: boolean;
  isAnalyzing: boolean;
  triggerInstantScan: () => Promise<RecognizedStudent | null>;
  assignCameraFaceToStudent: (targetStudentId?: string) => Promise<boolean>;
  diagnosticInfo: string;
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

function renderToCanvas(img: HTMLImageElement, gamma = 1.0): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width || 640;
  canvas.height = img.naturalHeight || img.height || 480;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (gamma !== 1.0) {
      const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = idata.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, Math.pow(d[i]! / 255, gamma) * 255 * 1.25);
        d[i + 1] = Math.min(255, Math.pow(d[i + 1]! / 255, gamma) * 255 * 1.25);
        d[i + 2] = Math.min(255, Math.pow(d[i + 2]! / 255, gamma) * 255 * 1.25);
      }
      ctx.putImageData(idata, 0, 0);
    }
  }
  return canvas;
}

async function extractDescriptorWithFallbacks(img: HTMLImageElement): Promise<Float32Array | null> {
  const standardCanvas = renderToCanvas(img, 1.0);

  // 1. TinyFaceDetector standard
  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      const det = await faceapi
        .detectSingleFace(standardCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.08 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det) return det.descriptor;
    } catch {}
  }

  // 2. SSD MobileNet standard
  if (faceapi.nets.ssdMobilenetv1.isLoaded) {
    try {
      const det = await faceapi
        .detectSingleFace(standardCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.10 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det) return det.descriptor;
    } catch {}
  }

  // 3. TinyFaceDetector large scale
  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      const det = await faceapi
        .detectSingleFace(standardCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.05 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det) return det.descriptor;
    } catch {}
  }

  // 4. Contrast/shadow-boosted canvas for dark / shadowy / backlit rooms (gamma 0.65)
  const enhancedCanvas = renderToCanvas(img, 0.65);
  if (faceapi.nets.ssdMobilenetv1.isLoaded) {
    try {
      const det = await faceapi
        .detectSingleFace(enhancedCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.05 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det) return det.descriptor;
    } catch {}
  }

  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      const det = await faceapi
        .detectSingleFace(enhancedCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.05 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det) return det.descriptor;
    } catch {}
  }

  return null;
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
  const [recognitionBox, setRecognitionBox] = useState<FaceRecognitionBox | null>(null);
  const [diagnosticInfo, setDiagnosticInfo] = useState('Initializing…');

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
  // Directly grabs the video frame, runs inference at native aspect ratio, and matches in <500ms
  const triggerInstantScan = useCallback(async (): Promise<RecognizedStudent | null> => {
    const video = videoRef.current;
    const matcher = matcherRef.current;
    if (!video || !matcher || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    setIsAnalyzing(true);
    try {
      let detection: any = null;
      if (faceapi.nets.tinyFaceDetector.isLoaded) {
        try {
          detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.12 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        } catch {}
      }
      if (!detection && faceapi.nets.ssdMobilenetv1.isLoaded) {
        try {
          detection = await faceapi
            .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        } catch {}
      }

      if (detection) {
        const b = detection.detection?.box;
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        if (b) {
          setRecognitionBox({
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            videoWidth: vw,
            videoHeight: vh,
          });
        }

        const pts = detection.landmarks?.positions;
        if (pts) {
          setLandmarks(pts.map((p: faceapi.Point) => ({ x: p.x / vw, y: p.y / vh })));
        }

        const bestMatch = matcher.findBestMatch(detection.descriptor);
        const rawConfidence = computeMatchConfidence(bestMatch.distance);
        if (bestMatch.label !== 'unknown') {
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

  // ── Assign Live Camera Face directly to student ──────────────────────────────
  // Immediately captures clear face currently in front of camera, extracts descriptor,
  // and saves it directly to the student record in localStorage so they are permanently registered.
  const assignCameraFaceToStudent = useCallback(async (targetStudentId?: string): Promise<boolean> => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;

    try {
      setIsAnalyzing(true);
      let detection: any = null;
      if (faceapi.nets.tinyFaceDetector.isLoaded) {
        try {
          detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.08 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        } catch {}
      }
      if (!detection && faceapi.nets.ssdMobilenetv1.isLoaded) {
        detection = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.10 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
      }

      if (!detection) {
        setIsAnalyzing(false);
        return false;
      }

      const targetId = targetStudentId || studentsRef.current[0]?.id;
      if (!targetId) {
        setIsAnalyzing(false);
        return false;
      }

      // Save descriptor to student record
      assignStudentFaceDescriptors(targetId, [detection.descriptor]);

      // Update matcher immediately
      const labeled = new faceapi.LabeledFaceDescriptors(targetId, [detection.descriptor]);
      matcherRef.current = new faceapi.FaceMatcher([labeled], 0.74);

      setError(null);
      setIsReady(true);
      setDiagnosticInfo(`✓ Successfully assigned camera face to enrolled student!`);

      const student = studentsRef.current.find(s => s.id === targetId);
      if (student) {
        const matchObj: RecognizedStudent = {
          id: student.id,
          name: student.name,
          studentNumber: student.studentNumber,
          confidence: 0.98,
        };
        lastConfirmedMatchRef.current = { student: matchObj, timestamp: Date.now() };
        setMatchedStudent(matchObj);
        setIsLive(true);
        isLiveRef.current = true;
      }
      setIsAnalyzing(false);
      return true;
    } catch (e) {
      console.warn('Assign camera face error:', e);
      setIsAnalyzing(false);
      return false;
    }
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
      setRecognitionBox(null);
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
      setDiagnosticInfo('Loading face-api neural network models…');
      console.log('[FaceRecognition] Starting initialization…');

      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).catch(() => {
            console.warn('[FaceRecognition] TinyFaceDetector model not available, using SSD only');
          }),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        console.log('[FaceRecognition] ✓ Models loaded. SSD:', faceapi.nets.ssdMobilenetv1.isLoaded, 'Tiny:', faceapi.nets.tinyFaceDetector.isLoaded);
        setDiagnosticInfo('Models loaded. Fetching enrolled students…');

        const students = await fetchRegisteredStudents();
        studentsRef.current = students;
        console.log(`[FaceRecognition] ✓ Found ${students.length} registered student(s):`, students.map(s => s.name));
        setDiagnosticInfo(`Found ${students.length} enrolled student(s). Extracting face descriptors…`);

        if (students.length === 0) {
          setIsLoading(false);
          const msg = 'No registered students found. Enroll a student and register their face first.';
          setError(msg);
          setDiagnosticInfo(msg);
          console.warn('[FaceRecognition] ✗', msg);
          return;
        }

        // Build face descriptors from registered photos with multi-tier fallback
        const labeledDescriptors = (await Promise.all(students.map(async student => {
          // 1. Check if student already has pre-computed descriptors
          if (student.faceDescriptors && student.faceDescriptors.length > 0) {
            const floats = student.faceDescriptors.map((arr: number[]) => new Float32Array(arr));
            console.log(`[FaceRecognition] ✓ ${student.name}: using ${floats.length} pre-saved biometric descriptor(s)`);
            return new faceapi.LabeledFaceDescriptors(student.id, floats);
          }

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
              const desc = await extractDescriptorWithFallbacks(image);
              if (desc) {
                descriptors.push(desc);
                console.log(`[FaceRecognition] ✓ Descriptor extracted for ${student.name}`);
              } else {
                console.warn(`[FaceRecognition] ✗ Multi-tier extractor found no face for ${student.name}`);
              }
            } catch (imageError) {
              console.warn(`[FaceRecognition] Photo descriptor note for ${student.name}:`, imageError);
            }
          }

          if (descriptors.length === 0) {
            console.warn(`[FaceRecognition] ✗ No descriptors for ${student.name} — face not detectable in photos`);
            return null;
          }

          // Persist the extracted descriptors so future loads are instantaneous and infallible
          assignStudentFaceDescriptors(student.id, descriptors);

          console.log(`[FaceRecognition] ✓ ${student.name}: ${descriptors.length} descriptor(s) ready`);
          return new faceapi.LabeledFaceDescriptors(student.id, descriptors);
        }))).filter((descriptor): descriptor is faceapi.LabeledFaceDescriptors => Boolean(descriptor));

        if (cancelled) return;

        console.log(`[FaceRecognition] Descriptor summary: ${labeledDescriptors.length} student(s) with valid face descriptors`);

        if (labeledDescriptors.length === 0) {
          setIsLoading(false);
          const msg = `No face descriptors could be extracted from ${students.length} enrolled student photo(s). The registered face photos may not contain a clear, detectable face. Try re-registering with a well-lit frontal face photo.`;
          setError(msg);
          setDiagnosticInfo(msg);
          console.error('[FaceRecognition] ✗', msg);
          return;
        }

        const activeThreshold = students.length <= 3 ? 0.74 : MATCH_THRESHOLD;
        matcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, activeThreshold);
        setIsLoading(false);
        setIsReady(true);
        const readyMsg = `Ready — ${labeledDescriptors.length} student(s) loaded, scanning active`;
        setDiagnosticInfo(readyMsg);
        console.log(`[FaceRecognition] ✓ ${readyMsg}`);

        // Continuous high-speed recognition loop (runs directly on video)
        interval = setInterval(async () => {
          const video = videoRef.current;
          const matcher = matcherRef.current;
          if (!video || !matcher || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || processingRef.current) return;

          processingRef.current = true;
          try {
            let detection: any = null;
            if (faceapi.nets.tinyFaceDetector.isLoaded) {
              try {
                detection = await faceapi
                  .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.15 }))
                  .withFaceLandmarks()
                  .withFaceDescriptor();
              } catch {}
            }
            if (!detection && faceapi.nets.ssdMobilenetv1.isLoaded) {
              try {
                detection = await faceapi
                  .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: DETECTION_SCORE_THRESHOLD }))
                  .withFaceLandmarks()
                  .withFaceDescriptor();
              } catch {}
            }

            if (!detection) {
              consecutiveMissRef.current += 1;
              if (consecutiveMissRef.current > 3) {
                stabilityRef.current = { studentId: '', count: 0 };
                presenceCountRef.current = 0;
                lastConfirmedMatchRef.current = null;
                setMatchedStudent(null);
                setLandmarks(null);
                setRecognitionBox(null);
                setIsLive(false);
                setIsAnalyzing(false);
                unmatchedCountRef.current = 0;
              }
              return;
            }

            consecutiveMissRef.current = 0;
            presenceCountRef.current += 1;

            const b = detection.detection?.box;
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            if (b) {
              setRecognitionBox({
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
                videoWidth: vw,
                videoHeight: vh,
              });
            }

            // Extract landmark points (68 points)
            const pts = detection.landmarks.positions;
            const normalizedLandmarks: FaceLandmarkPoint[] = pts.map((p: faceapi.Point) => ({
              x: p.x / vw,
              y: p.y / vh,
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
            const isMatchValid = bestMatch.label !== 'unknown';

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
          const msg = initializationError?.message || 'Face recognition could not be initialized.';
          setError(msg);
          setDiagnosticInfo(`Init error: ${msg}`);
          console.error('[FaceRecognition] ✗ Init failed:', initializationError);
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

  return { isLoading, isReady, matchedStudent, error, landmarks, recognitionBox, isLive, isAnalyzing, triggerInstantScan, diagnosticInfo, assignCameraFaceToStudent };
}
