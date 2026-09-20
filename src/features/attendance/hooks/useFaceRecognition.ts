import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { fetchRegisteredStudents } from '@/features/faceRegistration/api';
import { assignStudentFaceDescriptors } from '@/features/sync/syncService';
import {
  FACE_DESCRIPTOR_VERSION,
  FACENET_DISTANCE_THRESHOLD,
  STABILITY_FRAMES_REQUIRED,
  computeMatchConfidence,
  scoreFaceNetMatch,
  findDuplicateStudentId,
  type LabeledDescriptors,
} from '../lib/faceNetMatcher';
import {
  detectAccurateFace,
  detectLiveFace,
  ensureFaceNetModels,
  extractDescriptorFromImage,
  loadImage,
} from '../lib/faceNetEngine';

export type { RecognitionStatusInput } from '../lib/recognitionStatus';
export { computeCosineSimilarity, computeCosineDistance } from '../lib/faceNetMatcher';

const DETECTING_GRACE_FRAMES = 3;
const SCAN_INTERVAL_MS = 240;

const EAR_BLINK_THRESHOLD = 0.21;
const EAR_DYNAMIC_DELTA = 0.035;
const HISTORY_WINDOW_FRAMES = 8;
const EYE_VARIANCE_THRESHOLD = 0.00020;
const MIN_LANDMARK_MOTION = 0.8;

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

function toLabeledGallery(labeled: faceapi.LabeledFaceDescriptors[]): LabeledDescriptors[] {
  return labeled.map(entry => ({
    label: entry.label,
    descriptors: entry.descriptors,
  }));
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

  const galleryRef = useRef<LabeledDescriptors[]>([]);
  const processingRef = useRef(false);
  const stabilityRef = useRef<{ studentId: string; count: number }>({ studentId: '', count: 0 });
  const unmatchedCountRef = useRef(0);
  const consecutiveMissRef = useRef(0);
  const presenceCountRef = useRef(0);

  const landmarkHistoryRef = useRef<number[][]>([]);
  const earHistoryRef = useRef<number[]>([]);
  const ratioHistoryRef = useRef<number[]>([]);
  const hasBlinkedRef = useRef(false);
  const isLiveRef = useRef(false);
  const studentsRef = useRef<any[]>([]);
  const lastConfirmedMatchRef = useRef<{ student: RecognizedStudent; timestamp: number } | null>(null);

  const applyDetectionOverlay = useCallback((detection: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>, video: HTMLVideoElement) => {
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
  }, []);

  const resolveMatch = useCallback((descriptor: Float32Array): RecognizedStudent | null => {
    const result = scoreFaceNetMatch(descriptor, galleryRef.current);
    if (!result.accepted) return null;
    const student = studentsRef.current.find((s: any) => s.id === result.label);
    if (!student) return null;
    return {
      id: student.id,
      name: student.name,
      studentNumber: student.studentNumber,
      confidence: result.confidence,
    };
  }, []);

  const triggerInstantScan = useCallback(async (): Promise<RecognizedStudent | null> => {
    const video = videoRef.current;
    if (!video || galleryRef.current.length === 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    setIsAnalyzing(true);
    try {
      const detection = await detectAccurateFace(video);
      if (!detection) return null;

      applyDetectionOverlay(detection, video);
      const matchObj = resolveMatch(detection.descriptor);
      if (!matchObj) return null;

      lastConfirmedMatchRef.current = { student: matchObj, timestamp: Date.now() };
      setMatchedStudent(matchObj);
      setIsLive(true);
      isLiveRef.current = true;
      return matchObj;
    } catch (err) {
      console.warn('[FaceRecognition] Instant scan warning:', err);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [applyDetectionOverlay, resolveMatch, videoRef]);

  const assignCameraFaceToStudent = useCallback(async (targetStudentId?: string): Promise<boolean> => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;

    const targetId = targetStudentId;
    if (!targetId) {
      setDiagnosticInfo('Select a student before assigning this camera face. Open Face Registration instead of auto-assigning.');
      return false;
    }

    try {
      setIsAnalyzing(true);
      const detection = await detectAccurateFace(video);
      if (!detection) {
        setIsAnalyzing(false);
        return false;
      }

      const duplicateId = findDuplicateStudentId(detection.descriptor, galleryRef.current, targetId);
      if (duplicateId && duplicateId !== targetId) {
        const other = studentsRef.current.find((s: any) => s.id === duplicateId);
        setDiagnosticInfo(`This face already matches ${other?.name || 'another student'}. Registration blocked.`);
        setIsAnalyzing(false);
        return false;
      }

      assignStudentFaceDescriptors(targetId, [detection.descriptor]);

      const nextGallery = galleryRef.current.filter(entry => entry.label !== targetId);
      nextGallery.push({ label: targetId, descriptors: [detection.descriptor] });
      galleryRef.current = nextGallery;

      setError(null);
      setIsReady(true);
      setDiagnosticInfo('Camera face saved for the selected student only.');

      const student = studentsRef.current.find(s => s.id === targetId);
      if (student) {
        const matchObj: RecognizedStudent = {
          id: student.id,
          name: student.name,
          studentNumber: student.studentNumber,
          confidence: computeMatchConfidence(0.2),
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
      galleryRef.current = [];
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
      setDiagnosticInfo('Loading FaceNet models…');
      console.log('[FaceRecognition] Starting initialization…');

      try {
        await ensureFaceNetModels();
        setDiagnosticInfo('Models loaded. Fetching enrolled students…');

        const students = await fetchRegisteredStudents();
        studentsRef.current = students;
        setDiagnosticInfo(`Found ${students.length} enrolled student(s). Extracting FaceNet descriptors…`);

        if (students.length === 0) {
          setIsLoading(false);
          const msg = 'No registered students found. Enroll a student and register their face first.';
          setError(msg);
          setDiagnosticInfo(msg);
          return;
        }

        const labeledDescriptors = (await Promise.all(students.map(async student => {
          if (
            student.faceDescriptorVersion === FACE_DESCRIPTOR_VERSION &&
            student.faceDescriptors &&
            student.faceDescriptors.length > 0
          ) {
            const floats = student.faceDescriptors.map((arr: number[]) => new Float32Array(arr));
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
              const desc = await extractDescriptorFromImage(image);
              if (desc) descriptors.push(desc);
            } catch (imageError) {
              console.warn(`[FaceRecognition] Photo descriptor note for ${student.name}:`, imageError);
            }
          }

          if (descriptors.length === 0) return null;

          assignStudentFaceDescriptors(student.id, descriptors);
          return new faceapi.LabeledFaceDescriptors(student.id, descriptors);
        }))).filter((descriptor): descriptor is faceapi.LabeledFaceDescriptors => Boolean(descriptor));

        if (cancelled) return;

        if (labeledDescriptors.length === 0) {
          setIsLoading(false);
          const msg = `No FaceNet descriptors could be extracted from ${students.length} enrolled photo(s). Re-register with a clear, well-lit face.`;
          setError(msg);
          setDiagnosticInfo(msg);
          return;
        }

        galleryRef.current = toLabeledGallery(labeledDescriptors);
        setIsLoading(false);
        setIsReady(true);
        const readyMsg = `Ready — FaceNet scanning ${labeledDescriptors.length} student(s), threshold ${FACENET_DISTANCE_THRESHOLD}`;
        setDiagnosticInfo(readyMsg);

        interval = setInterval(async () => {
          const video = videoRef.current;
          if (!video || galleryRef.current.length === 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || processingRef.current) return;

          processingRef.current = true;
          try {
            const detection = await detectLiveFace(video);

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
            applyDetectionOverlay(detection, video);

            const pts = detection.landmarks.positions;
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

            if (presenceCountRef.current >= 2 || hasBlinkedRef.current || hasEyeDynamics || hasNaturalMovement) {
              isLiveRef.current = true;
              setIsLive(true);
            }

            const matchObj = resolveMatch(detection.descriptor);

            if (matchObj) {
              stabilityRef.current = {
                studentId: matchObj.id,
                count: (stabilityRef.current.studentId === matchObj.id ? stabilityRef.current.count + 1 : 1),
              };

              if (stabilityRef.current.count >= STABILITY_FRAMES_REQUIRED) {
                unmatchedCountRef.current = 0;
                setIsAnalyzing(false);
                lastConfirmedMatchRef.current = { student: matchObj, timestamp: Date.now() };
                setMatchedStudent(matchObj);
                setIsLive(true);
                isLiveRef.current = true;
              } else {
                setIsAnalyzing(true);
              }
            } else {
              stabilityRef.current = { studentId: '', count: 0 };
              unmatchedCountRef.current += 1;

              const recentMatch = lastConfirmedMatchRef.current;
              if (recentMatch && (Date.now() - recentMatch.timestamp < 400) && unmatchedCountRef.current <= 2) {
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
        }, SCAN_INTERVAL_MS);
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
      galleryRef.current = [];
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
  }, [active, applyDetectionOverlay, resolveMatch, videoRef]);

  return { isLoading, isReady, matchedStudent, error, landmarks, recognitionBox, isLive, isAnalyzing, triggerInstantScan, diagnosticInfo, assignCameraFaceToStudent };
}
