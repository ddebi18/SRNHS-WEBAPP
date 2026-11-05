import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { fetchRegisteredStudents } from '@/features/faceRegistration/api';
import { detectFacesWithScrfd, getScrfdSession } from '@/features/faceRegistration/lib/scrfdDetector';
import { assignStudentFaceDescriptors } from '@/features/sync/syncService';
import {
  FACE_DESCRIPTOR_VERSION,
  FACENET_DISTANCE_THRESHOLD,
  STABILITY_FRAMES_REQUIRED,
  computeMatchConfidence,
  euclideanDistance,
  scoreFaceNetMatch,
  findDuplicateStudentId,
  isSameEnrolledPerson,
  deserializeFaceNetDescriptor,
  type FaceNetMatchResult,
  type LabeledDescriptors,
} from '../lib/faceNetMatcher';
import {
  detectAccurateFace,
  detectLiveFaceRegions,
  compareFacePaddingDescriptors,
  analyzeFaceRegionQuality,
  describePaddedFaceCrop,
  ensureFaceNetModels,
  extractDescriptorFromImage,
  loadImage,
  type FaceDetectionRegion,
  type FaceNetLiveDetection,
  type FaceRegionRecognitionResult,
  type FaceRegionQualityAssessment,
  type FaceCropRetryAttempt,
  type FaceCropRetryStep,
} from '../lib/faceNetEngine';
import {
  assignFaceDetectionTracks,
  canFastConfirmFaceMatch,
  findDuplicateStudentClaimLosers,
  selectFaceDescriptorDetections,
  predictFaceTrackBox,
  updateFaceTrackIdentity,
} from '../lib/faceTracking';
import { releaseFaceScan, tryAcquireFaceScan } from '../lib/faceScanLock';
import { faceBoxOverlap } from '@/lib/faceOverlayGeometry';
import {
  FACE_DIAGNOSTICS_ENABLED,
  FACE_CROP_RETRY_DIAGNOSTICS_ENABLED,
  FACE_CROP_PADDING_COMPARISON_ENABLED,
  FACE_CROP_ADAPTIVE_RETRY_ENABLED,
  FACE_MOTION_OPTIMIZATIONS_ENABLED,
  FACE_STARTUP_OPTIMIZATIONS_ENABLED,
  getFaceCropDetectorInputSize,
  getFaceDescriptorBudget,
  isMobileDevice,
  isMobileFaceOptimizationActive,
} from '../lib/faceOptimizationFlags';
import {
  estimateScrfdPose,
  getFaceYawBucket,
  getMedianAndP90,
  type FaceYawBucket,
} from '../lib/faceRecognitionDiagnostics';

export type { RecognitionStatusInput } from '../lib/recognitionStatus';
export { computeCosineSimilarity, computeCosineDistance } from '../lib/faceNetMatcher';

const SCAN_INTERVAL_MS = 200;
const STARTUP_TIMEOUT_MS = 15_000;
const SCAN_OVERRUN_COOLDOWN_MIN_MS = 100;
const MATCH_SWITCH_STABILITY_FRAMES = 5;
const CONFIRMED_REVERIFY_INTERVAL_MS = 1000;
const FAST_CONFIRM_ENABLED = import.meta.env.VITE_FACE_FAST_CONFIRM === 'true';
const QUALITY_GATE_ENABLED = import.meta.env.VITE_FACE_QUALITY_GATE !== 'false';

function scanOverrunCooldownMs(lastScanDurationMs: number): number {
  return Math.max(SCAN_OVERRUN_COOLDOWN_MIN_MS, lastScanDurationMs * 0.5);
}

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
  frameCapturedAt?: number;
  detectionResultAt?: number;
  frameTimestamp?: number;
  predicted?: boolean;
}

export interface RecognizedFaceItem {
  id: string;
  student: RecognizedStudent | null;
  box: FaceRecognitionBox;
  isLive: boolean;
  isMatching: boolean;
  status: 'scanning' | 'recognized' | 'unknown' | 'quality_rejected' | 'processing_failed';
  diagnostic: {
    reason?: string;
    matchReason?: FaceNetMatchResult['reason'];
    distance?: number;
    cropDurationMs?: number;
    source?: 'aligned' | 'landmark_aligned' | 'crop' | 'full_frame_fallback';
    detectorSource?: 'scrfd' | 'fallback';
    missedFrames?: number;
    qualityScore?: number;
    faceSizePx?: number;
    detectorScore?: number;
    sharpnessVariance?: number;
    poseScore?: number;
    retryStepSucceeded?: FaceRegionRecognitionResult['retryStepSucceeded'];
    extractionFailureReason?: 'no_face_in_crop' | 'inference_error';
    timeToConfirmMs?: number;
    scansUsed?: number;
    predicted?: boolean;
    selectedForExtraction?: boolean;
    trackExists?: boolean;
  };
  score?: number;
}

interface FaceRecognitionTrack {
  id: string;
  box: FaceRecognitionBox;
  velocityX: number;
  velocityY: number;
  lastSeenAt: number;
  missedFrames: number;
  lastDescriptorAt: number;
  lastMatchDistance: number;
  candidateStudentId: string;
  stabilityCount: number;
  confirmedStudent: RecognizedStudent | null;
  pendingSwitch: boolean;
  detectorSource: 'scrfd' | 'fallback';
  matchHistory: Array<string | null>;
  firstDetectedAt: number;
  scansUsed: number;
  confirmedAt?: number;
  bestCrop?: FaceRegionQualityAssessment;
  sharpnessHistory: number[];
  lastRetrySequenceAt: number;
  bestMotionCrops: Array<{
    quality: FaceRegionQualityAssessment;
    region: FaceDetectionRegion;
    source: HTMLCanvasElement;
    capturedAt: number;
    score: number;
  }>;
}

type LiveFaceBoxesRef = Readonly<{ current: readonly FaceDetectionRegion[] }>;
type LiveDetectionFrameRef = Readonly<{
  current: {
    source: HTMLCanvasElement;
    capturedAt: number;
    frameTimestamp: number;
    resultArrivedAt: number;
    frameId: number;
    boxes: readonly FaceDetectionRegion[];
  } | null;
}>;

export type RecognitionStartupStage = 'idle' | 'loading_models' | 'loading_students' | 'ready' | 'error';

export interface RecognitionStartupTimings {
  faceApiModelMs: number | null;
  rosterFetchMs: number | null;
  legacyDescriptorMs: number | null;
  firstRecognitionMs: number | null;
}

export interface UseFaceRecognitionReturn {
  isLoading: boolean;
  isReady: boolean;
  matchedStudent: RecognizedStudent | null;
  matchedStudents: RecognizedStudent[];
  recognizedFaces: RecognizedFaceItem[];
  error: string | null;
  landmarks: FaceLandmarkPoint[] | null;
  recognitionBox: FaceRecognitionBox | null;
  isLive: boolean;
  isAnalyzing: boolean;
  assignCameraFaceToStudent: (targetStudentId?: string) => Promise<boolean>;
  diagnosticInfo: string;
  nativeIOD: number;
  qualityGuidance: string | null;
  qualityPassed: boolean;
  startupStage: RecognitionStartupStage;
  startupTimings: RecognitionStartupTimings;
  retryInitialization: () => void;
}

function toLabeledGallery(labeled: faceapi.LabeledFaceDescriptors[]): LabeledDescriptors[] {
  return labeled.map(entry => ({
    label: entry.label,
    descriptors: entry.descriptors,
  }));
}

export function useFaceRecognition(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  detectedFaceBoxesRef?: LiveFaceBoxesRef,
  detectionFrameRef?: LiveDetectionFrameRef
): UseFaceRecognitionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [matchedStudent, setMatchedStudent] = useState<RecognizedStudent | null>(null);
  const [matchedStudents, setMatchedStudents] = useState<RecognizedStudent[]>([]);
  const [recognizedFaces, setRecognizedFaces] = useState<RecognizedFaceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<FaceLandmarkPoint[] | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recognitionBox, setRecognitionBox] = useState<FaceRecognitionBox | null>(null);
  const [diagnosticInfo, setDiagnosticInfo] = useState('Initializing…');
  const [nativeIOD, setNativeIOD] = useState<number>(0);
  const [qualityGuidance, setQualityGuidance] = useState<string | null>(null);
  const [qualityPassed, setQualityPassed] = useState<boolean>(false);
  const [startupStage, setStartupStage] = useState<RecognitionStartupStage>('idle');
  const [startupTimings, setStartupTimings] = useState<RecognitionStartupTimings>({
    faceApiModelMs: null,
    rosterFetchMs: null,
    legacyDescriptorMs: null,
    firstRecognitionMs: null,
  });
  const [retryToken, setRetryToken] = useState(0);

  const galleryRef = useRef<LabeledDescriptors[]>([]);
  const faceTracksRef = useRef<FaceRecognitionTrack[]>([]);
  const nextFaceTrackIdRef = useRef(1);
  const descriptorRotationCursorRef = useRef(0);
  const processingRef = useRef(false);
  const lastMatchResultRef = useRef<{ reason: string; distance: number; secondDistance: number } | null>(null);
  const lastBoxRef = useRef<FaceRecognitionBox | null>(null);
  const overlapDebugUntilRef = useRef(0);
  const firstRecognitionLoggedRef = useRef(false);
  const lastMotionFrameIdRef = useRef(0);

  const isLiveRef = useRef(false);
  const studentsRef = useRef<any[]>([]);
  const lastConfirmedMatchRef = useRef<{ student: RecognizedStudent; timestamp: number } | null>(null);

  const retryInitialization = useCallback(() => {
    setError(null);
    setStartupStage('loading_models');
    setRetryToken(current => current + 1);
  }, []);

  const applyDetectionOverlay = useCallback((
    detection: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }> | FaceNetLiveDetection,
    video: HTMLVideoElement
  ) => {
    const b = 'detection' in detection ? detection.detection?.box : detection.box;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (b) {
      const previous = lastBoxRef.current;
      const moveDelta = previous ? Math.hypot(b.x - previous.x, b.y - previous.y) : 0;
      const alpha = !previous ? 1 : moveDelta > 30 ? 0.8 : moveDelta > 12 ? 0.65 : 0.45;
      const smoothedBox = previous && previous.videoWidth === vw && previous.videoHeight === vh
        ? {
            x: previous.x * (1 - alpha) + b.x * alpha,
            y: previous.y * (1 - alpha) + b.y * alpha,
            width: previous.width * (1 - alpha) + b.width * alpha,
            height: previous.height * (1 - alpha) + b.height * alpha,
          }
        : { x: b.x, y: b.y, width: b.width, height: b.height };

      setRecognitionBox({
        ...smoothedBox,
        videoWidth: vw,
        videoHeight: vh,
      });
      lastBoxRef.current = { ...smoothedBox, videoWidth: vw, videoHeight: vh };
    }

    const pts = 'detection' in detection
      ? detection.landmarks?.positions
      : detection.landmarks;
    if (pts) {
      setLandmarks(pts.map(p => ({ x: p.x / vw, y: p.y / vh })));
    }
  }, []);

  const resolveMatch = useCallback((descriptor: Float32Array) => {
    const result = scoreFaceNetMatch(descriptor, galleryRef.current);
    const diagnosticRanked = FACE_DIAGNOSTICS_ENABLED
      ? galleryRef.current.map(entry => {
          let distance = Number.POSITIVE_INFINITY;
          let descriptorIndex = -1;
          entry.descriptors.forEach((storedDescriptor, index) => {
            const candidateDistance = euclideanDistance(descriptor, storedDescriptor);
            if (candidateDistance < distance) {
              distance = candidateDistance;
              descriptorIndex = index;
            }
          });
          return { studentId: entry.label, distance, descriptorIndex };
        }).filter(entry => Number.isFinite(entry.distance))
          .sort((a, b) => a.distance - b.distance)
      : null;
    lastMatchResultRef.current = {
      reason: result.reason,
      distance: result.distance,
      secondDistance: result.secondDistance,
    };
    const diagnostic = diagnosticRanked
      ? {
          bestStudentId: diagnosticRanked[0]?.studentId ?? null,
          bestDistance: diagnosticRanked[0]?.distance ?? Number.POSITIVE_INFINITY,
          secondBestDistance: diagnosticRanked[1]?.distance ?? Number.POSITIVE_INFINITY,
          closestDescriptorIndex: diagnosticRanked[0]?.descriptorIndex ?? null,
        }
      : null;
    if (!result.accepted) return { student: null, result, diagnostic };
    const student = studentsRef.current.find((s: any) => s.id === result.label);
    if (!student) return { student: null, result, diagnostic };
    return { student: {
      id: student.id,
      name: student.name,
      studentNumber: student.studentNumber,
      confidence: result.confidence,
    }, result, diagnostic };
  }, []);

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
    let startupTimedOut = false;
    let initializationFailed = false;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setTimeout> | null = null;
    let videoFrameHandle: number | null = null;
    let finishVisibilityWait: (() => void) | null = null;
    let visibilityHandler: (() => void) | null = null;

    const shouldPause = () =>
      isMobileFaceOptimizationActive() && document.visibilityState === 'hidden';

    const clearStartupTimer = () => {
      if (startupTimer) clearTimeout(startupTimer);
      startupTimer = null;
    };

    const waitForVisiblePage = () => new Promise<void>(resolve => {
      if (!shouldPause()) {
        resolve();
        return;
      }
      const finish = () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        finishVisibilityWait = null;
        resolve();
      };
      const onVisibilityChange = () => {
        if (!shouldPause()) finish();
      };
      finishVisibilityWait = finish;
      document.addEventListener('visibilitychange', onVisibilityChange);
    });

    const cancelScheduledScan = () => {
      if (interval) {
        clearTimeout(interval);
        interval = null;
      }
      const video = videoRef.current;
      if (videoFrameHandle !== null && video && 'cancelVideoFrameCallback' in video) {
        video.cancelVideoFrameCallback(videoFrameHandle);
        videoFrameHandle = null;
      }
    };

    const reset = () => {
      setIsLoading(false);
      setIsReady(false);
      setMatchedStudent(null);
      setMatchedStudents([]);
      setRecognizedFaces([]);
      setError(null);
      setLandmarks(null);
      setRecognitionBox(null);
      setIsLive(false);
      setIsAnalyzing(false);
      setNativeIOD(0);
      setQualityGuidance(null);
      setQualityPassed(false);
      setStartupStage('idle');
      setStartupTimings({
        faceApiModelMs: null,
        rosterFetchMs: null,
        legacyDescriptorMs: null,
        firstRecognitionMs: null,
      });
      galleryRef.current = [];
      faceTracksRef.current = [];
      nextFaceTrackIdRef.current = 1;
      isLiveRef.current = false;
      lastMatchResultRef.current = null;
      lastConfirmedMatchRef.current = null;
      lastBoxRef.current = null;
    };

    if (!active || !videoRef.current) {
      reset();
      return;
    }

    const initialize = async () => {
      setIsLoading(true);
      setError(null);
      setStartupStage('loading_models');
      setDiagnosticInfo('Loading FaceNet models…');
      if (FACE_DIAGNOSTICS_ENABLED) console.info('[FaceRecognition] Starting initialization…');

      if (FACE_STARTUP_OPTIMIZATIONS_ENABLED) {
        startupTimer = setTimeout(() => {
          startupTimedOut = true;
          setIsLoading(false);
          setStartupStage('error');
          const timeoutMessage = `Face recognition startup timed out after ${STARTUP_TIMEOUT_MS / 1000} seconds. Check the network and retry.`;
          setError(timeoutMessage);
          setDiagnosticInfo(timeoutMessage);
        }, STARTUP_TIMEOUT_MS);
      }

      try {
        let students: Awaited<ReturnType<typeof fetchRegisteredStudents>>;
        if (FACE_STARTUP_OPTIMIZATIONS_ENABLED) {
          let modelsReady = false;
          let rosterReady = false;
          const updateProgress = () => {
            if (cancelled || startupTimedOut || initializationFailed) return;
            setStartupStage(!modelsReady ? 'loading_models' : !rosterReady ? 'loading_students' : 'loading_students');
          };
          const modelPromise = (async () => {
            const startedAt = performance.now();
            await ensureFaceNetModels();
            const durationMs = performance.now() - startedAt;
            if (!cancelled && !startupTimedOut) {
              setStartupTimings(current => ({ ...current, faceApiModelMs: durationMs }));
              if (FACE_DIAGNOSTICS_ENABLED) console.info(`[FaceRecognition] Face-api model stage: ${durationMs.toFixed(0)}ms.`);
            }
            modelsReady = true;
            updateProgress();
          })();
          const rosterPromise = (async () => {
            const startedAt = performance.now();
            try {
              return await fetchRegisteredStudents();
            } finally {
              const durationMs = performance.now() - startedAt;
              if (!cancelled && !startupTimedOut) {
                setStartupTimings(current => ({ ...current, rosterFetchMs: durationMs }));
                if (FACE_DIAGNOSTICS_ENABLED) console.info(`[FaceRecognition] Student roster stage: ${durationMs.toFixed(0)}ms.`);
              }
              rosterReady = true;
              updateProgress();
            }
          })();
          [, students] = await Promise.all([modelPromise, rosterPromise]);
        } else {
          const modelStartedAt = performance.now();
          await ensureFaceNetModels();
          if (cancelled || startupTimedOut) return;
          setStartupTimings(current => ({ ...current, faceApiModelMs: performance.now() - modelStartedAt }));
          const rosterStartedAt = performance.now();
          students = await fetchRegisteredStudents();
          if (cancelled || startupTimedOut) return;
          setStartupTimings(current => ({ ...current, rosterFetchMs: performance.now() - rosterStartedAt }));
        }
        clearStartupTimer();
        if (cancelled || startupTimedOut) return;
        studentsRef.current = students;
        setStartupStage('loading_students');
        setDiagnosticInfo(`Found ${students.length} enrolled student(s). Loading FaceNet descriptors…`);

        if (students.length === 0) {
          setIsLoading(false);
          setStartupStage('error');
          const msg = 'No registered students found. Enroll a student and register their face first.';
          setError(msg);
          setDiagnosticInfo(msg);
          return;
        }

        const getStudentPhotoUrls = (student: typeof students[number]) => {
          const photoUrlSet = new Set<string>();
          if (student.registeredPhotos?.front) photoUrlSet.add(student.registeredPhotos.front);
          if (student.registeredPhotos?.left) photoUrlSet.add(student.registeredPhotos.left);
          if (student.registeredPhotos?.right) photoUrlSet.add(student.registeredPhotos.right);
          if (photoUrlSet.size === 0 && student.photoUrl) photoUrlSet.add(student.photoUrl);
          return Array.from(photoUrlSet);
        };

        const descriptorStageStartedAt = performance.now();
        const missingDescriptorStudents: typeof students = [];
        const labeledDescriptors = FACE_STARTUP_OPTIMIZATIONS_ENABLED
          ? students.flatMap(student => {
              if (
                student.faceDescriptorVersion === FACE_DESCRIPTOR_VERSION &&
                student.faceDescriptors &&
                student.faceDescriptors.length > 0
              ) {
                const floats = student.faceDescriptors
                  .map(deserializeFaceNetDescriptor)
                  .filter((descriptor): descriptor is Float32Array => descriptor !== null);
                if (floats.length > 0) {
                  return [new faceapi.LabeledFaceDescriptors(student.id, floats)];
                }
              }
              missingDescriptorStudents.push(student);
              return [];
            })
          : (await Promise.all(students.map(async student => {
              if (
                student.faceDescriptorVersion === FACE_DESCRIPTOR_VERSION &&
                student.faceDescriptors &&
                student.faceDescriptors.length > 0
              ) {
                const floats = student.faceDescriptors
                  .map(deserializeFaceNetDescriptor)
                  .filter((descriptor): descriptor is Float32Array => descriptor !== null);
                if (floats.length > 0) {
                  return new faceapi.LabeledFaceDescriptors(student.id, floats);
                }
              }

              const photoUrls = getStudentPhotoUrls(student);
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

        if (cancelled || startupTimedOut) return;
        if (!FACE_STARTUP_OPTIMIZATIONS_ENABLED) {
          const durationMs = performance.now() - descriptorStageStartedAt;
          setStartupTimings(current => ({ ...current, legacyDescriptorMs: durationMs }));
          if (FACE_DIAGNOSTICS_ENABLED) console.info(`[FaceRecognition] Legacy descriptor stage: ${durationMs.toFixed(0)}ms.`);
        }

        if (FACE_STARTUP_OPTIMIZATIONS_ENABLED) {
          const pendingWithPhotos = missingDescriptorStudents.filter(student => getStudentPhotoUrls(student).length > 0);
          if (FACE_DIAGNOSTICS_ENABLED) {
            console.info(`[FaceRecognition] ${missingDescriptorStudents.length} student(s) lack saved FaceNet descriptors; ${pendingWithPhotos.length} legacy photo fallback(s) queued after Ready.`);
          }
          missingDescriptorStudents.splice(0, missingDescriptorStudents.length, ...pendingWithPhotos);
        }

        if (labeledDescriptors.length === 0 && missingDescriptorStudents.length === 0) {
          setIsLoading(false);
          setStartupStage('error');
          const msg = `No FaceNet descriptors could be extracted from ${students.length} enrolled photo(s). Re-register with a clear, well-lit face.`;
          setError(msg);
          setDiagnosticInfo(msg);
          return;
        }

        galleryRef.current = toLabeledGallery(labeledDescriptors);
        setIsLoading(false);
        setIsReady(true);
        setStartupStage('ready');
        const descriptorCount = labeledDescriptors.reduce(
          (total, entry) => total + entry.descriptors.length,
          0
        );
        const pendingMessage = missingDescriptorStudents.length > 0
          ? `; ${missingDescriptorStudents.length} legacy photo descriptor(s) queued after Ready`
          : '';
        const readyMsg = `Ready — FaceNet scanning ${labeledDescriptors.length} student(s), ${descriptorCount} descriptors, threshold ${FACENET_DISTANCE_THRESHOLD}${pendingMessage}`;
        setDiagnosticInfo(readyMsg);

        let scrfdSession: Awaited<ReturnType<typeof getScrfdSession>> | null = null;
        if (!detectedFaceBoxesRef) {
          try {
            scrfdSession = await getScrfdSession('/models/scrfd/scrfd_2.5g_bnkps.onnx');
          } catch (scrfdError) {
            console.warn('[FaceRecognition] SCRFD unavailable; using FaceNet detectors:', scrfdError);
          }
        }
        if (cancelled || startupTimedOut) return;
        overlapDebugUntilRef.current = import.meta.env.DEV ? performance.now() + 5000 : 0;
        let regionResultLogCount = 0;
        let qualityScanLogCount = 0;
        const qualityLogCounts = {
          faces: 0,
          qualityUsable: 0,
          qualityRejected: 0,
          selected: 0,
          skipped: 0,
          gateRejected: 0,
          descriptor: 0,
          failed: 0,
          quality_rejected: 0,
          skippedByDescriptor: 0,
        };
        let cropAttemptLogCount = 0;
        let performanceWindowStartedAt = performance.now();
        let scansInPerformanceWindow = 0;
        let updatesInPerformanceWindow = 0;
        let scanDurationInPerformanceWindow = 0;
        const motionScanDurations: number[] = [];
        let recognitionDiagnosticWindowStartedAt = performance.now();
        const recognitionDiagnosticOutcomes: Record<string, number> = {};
        const recognitionDiagnosticBuckets: Record<FaceYawBucket, {
          attempts: number;
          overThreshold: number;
          distances: number[];
          outcomes: Record<string, number>;
        }> = {
          'frontal <10': { attempts: 0, overThreshold: 0, distances: [], outcomes: {} },
          '10-20': { attempts: 0, overThreshold: 0, distances: [], outcomes: {} },
          '20-30': { attempts: 0, overThreshold: 0, distances: [], outcomes: {} },
          '>30': { attempts: 0, overThreshold: 0, distances: [], outcomes: {} },
          unknown: { attempts: 0, overThreshold: 0, distances: [], outcomes: {} },
        };
        const diagnosticTrackDistances = new Map<string, number[]>();
        const reportedStoredDistancesAt = new Map<string, number>();
        const confirmedTrackReports: Array<{
          trackId: string;
          studentId: string;
          scansToConfirm: number;
          timeToConfirmMs: number;
          medianBestDistance: number | null;
          p90BestDistance: number | null;
          detectorPassesPerSuccessfulExtraction: number;
        }> = [];
        const cropRetryAttemptsByStep = new Map<FaceCropRetryStep, FaceCropRetryAttempt[]>(
          (['initial', 'larger_padding_40', 'lower_score', 'ssd_mobilenet'] as const)
            .map(step => [step, []])
        );
        const lastSuccessfulCropStepByTrack = new Map<string, FaceCropRetryStep>();
        const paddingComparisonAtByTrack = new Map<string, number>();
        let successfulExtractionsInWindow = 0;
        let detectorPassesForSuccessfulExtractionsInWindow = 0;
        const mobileQualityCanvasPool: HTMLCanvasElement[] = [];
        const cropAttemptCounts = {
          no_face_in_crop: 0,
          inference_error: 0,
          low_score: 0,
          misaligned: 0,
          quality_rejected: 0,
          succeededByStep: {
            initial: 0,
            larger_padding_40: 0,
            lower_score: 0,
            ssd_mobilenet: 0,
          },
        };

        const scheduleScan = (delay: number) => {
          cancelScheduledScan();
          if (shouldPause()) return;
          const startOnVideoFrame = () => {
            if (cancelled || shouldPause()) return;
            const video = videoRef.current;
            if (video && typeof video.requestVideoFrameCallback === 'function') {
              videoFrameHandle = video.requestVideoFrameCallback(() => {
                videoFrameHandle = null;
                void scanFrame();
              });
              return;
            }
            void scanFrame();
          };
          if (delay <= 0) {
            startOnVideoFrame();
            return;
          }
          interval = setTimeout(startOnVideoFrame, delay);
        };
        const scanFrame = async () => {
          const scanStartedAt = performance.now();
          let scanSnapshotStartedAt: number | null = null;
          const video = videoRef.current;
          if (
            cancelled ||
            shouldPause() ||
            !video ||
            galleryRef.current.length === 0 ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            !tryAcquireFaceScan(processingRef)
          ) {
            if (!cancelled) scheduleScan(SCAN_INTERVAL_MS);
            return;
          }

          try {
            const recognitionStartedAt = performance.now();
            let regions: FaceDetectionRegion[] = [];
            let regionResults: FaceRegionRecognitionResult[] = [];
            let detectorDurationMs: number | null = null;
            let extractedIndices = new Set<number>();
            const motionEnabled = FACE_MOTION_OPTIMIZATIONS_ENABLED && Boolean(detectionFrameRef);
            let frameSource: HTMLVideoElement | HTMLCanvasElement = video;
            let frameCapturedAt = performance.now();
            let detectionFrame: LiveDetectionFrameRef['current'] = null;

            if (motionEnabled) {
              const frame = detectionFrameRef!.current;
              if (!frame || frame.frameId === lastMotionFrameIdRef.current) return;
              lastMotionFrameIdRef.current = frame.frameId;
              detectionFrame = frame;
              if (frame) {
                frameSource = frame.source;
                frameCapturedAt = frame.capturedAt;
                scanSnapshotStartedAt = frame.capturedAt;
                regions = frame.boxes.map(box => ({
                  ...box,
                  detectorSource: box.detectorSource ?? 'scrfd',
                }));
              }
            } else if (detectedFaceBoxesRef) {
              regions = detectedFaceBoxesRef.current.map(box => ({
                ...box,
                detectorSource: box.detectorSource ?? 'scrfd',
              }));
            } else if (scrfdSession) {
              try {
                const detectionStartedAt = performance.now();
                regions = await detectFacesWithScrfd(scrfdSession, video, 0.25, 0.4);
                detectorDurationMs = performance.now() - detectionStartedAt;
                regions = regions.map(region => ({
                  ...region, detectorSource: 'scrfd',
                }));
              } catch (scrfdScanError) {
                console.warn('[FaceRecognition] SCRFD recognition scan failed; using FaceNet detectors:', scrfdScanError);
                regions = [];
              }
            }
            if (motionEnabled && frameSource instanceof HTMLCanvasElement) {
              const priorTracks = faceTracksRef.current.filter(track => track.missedFrames === 0);
              const assignments = assignFaceDetectionTracks(
                regions.map(({ x, y, width, height }) => ({ x, y, width, height })),
                priorTracks.map(track => ({ ...track, studentId: track.confirmedStudent?.id ?? null })),
                regions.map(() => null),
                Date.now()
              );
              const assignedTrackIndices = new Set(assignments.filter(
                (index): index is number => index !== null && index !== undefined
              ));
              for (let index = 0; index < priorTracks.length; index++) {
                if (assignedTrackIndices.has(index)) continue;
                const track = priorTracks[index]!;
                const predicted = predictFaceTrackBox(
                  track.box,
                  track.velocityX,
                  track.velocityY,
                  track.lastSeenAt,
                  Date.now()
                );
                if (
                  predicted.x < 0 ||
                  predicted.y < 0 ||
                  predicted.x + predicted.width > frameSource.width ||
                  predicted.y + predicted.height > frameSource.height
                ) continue;
                regions.push({
                  ...predicted,
                  detectorSource: track.detectorSource,
                  predicted: true,
                });
              }
            }
            if (regions.length === 0 && !detectedFaceBoxesRef) {
              const fallbackDetectionStartedAt = performance.now();
              regions = (await detectLiveFaceRegions(video)).map(region => ({
                ...region,
                detectorSource: 'fallback',
              }));
              detectorDurationMs = (detectorDurationMs ?? 0) +
                performance.now() - fallbackDetectionStartedAt;
            }

            const timestamp = Date.now();
            if (FACE_DIAGNOSTICS_ENABLED && regions.length > 0) {
              const capturedAt = detectionFrame?.capturedAt ??
                regions.find(region => region.frameCapturedAt !== undefined)?.frameCapturedAt ??
                frameCapturedAt;
              console.debug('[FaceRecognition] Detection frame timing', {
                frameTimestamp: detectionFrame?.frameTimestamp ?? regions[0]?.frameTimestamp ?? null,
                detectorResultArrivedAt: detectionFrame?.resultArrivedAt ??
                  regions[0]?.detectionResultAt ?? null,
                recognitionScanStartedAt: Number(scanStartedAt.toFixed(1)),
                boxAgeAtScanMs: Number((performance.now() - capturedAt).toFixed(1)),
                detectedBoxes: regions.length,
              });
            }
            const mobileOptimizationActive = isMobileFaceOptimizationActive();
            const qualityAssessments = regions.map((region, index) => {
              try {
                const reusableCanvas = mobileOptimizationActive && !motionEnabled
                  ? (mobileQualityCanvasPool[index] ??= document.createElement('canvas'))
                  : undefined;
                return analyzeFaceRegionQuality(frameSource, region, 60, 0, reusableCanvas);
              } catch (error) {
                if (import.meta.env.DEV) {
                  console.warn('[FaceRecognition] Quality assessment threw; allowing descriptor attempt:', error);
                }
                const paddingX = Math.max(8, region.width * 0.2);
                const paddingY = Math.max(8, region.height * 0.2);
                const cropX = Math.max(0, Math.floor(region.x - paddingX));
                const cropY = Math.max(0, Math.floor(region.y - paddingY));
                const crop = document.createElement('canvas');
                const sourceWidth = frameSource instanceof HTMLVideoElement ? frameSource.videoWidth : frameSource.width;
                const sourceHeight = frameSource instanceof HTMLVideoElement ? frameSource.videoHeight : frameSource.height;
                crop.width = Math.max(1, Math.min(sourceWidth || 640, Math.ceil(region.x + region.width + paddingX)) - cropX);
                crop.height = Math.max(1, Math.min(sourceHeight || 480, Math.ceil(region.y + region.height + paddingY)) - cropY);
                try {
                  crop.getContext('2d')?.drawImage(frameSource, cropX, cropY, crop.width, crop.height, 0, 0, crop.width, crop.height);
                } catch (cropError) {
                  if (import.meta.env.DEV) {
                    console.warn('[FaceRecognition] Could not copy fallback face crop:', cropError);
                  }
                }
                const faceSizePx = Math.min(region.width, region.height);
                return {
                  score: 0,
                  faceSizePx,
                  detectorScore: region.score ?? 1,
                  sizeScore: Math.min(1, faceSizePx / 120),
                  sharpnessVariance: 0,
                  poseScore: 1,
                  usable: true,
                  crop,
                  cropX,
                  cropY,
                };
              }
            });
            let provisionalTracks: Array<FaceRecognitionTrack | undefined> = [];
            let qualityGateReasons: Array<string | undefined> = [];
            if (regions.length > 0) {
              const frameWidth = frameSource instanceof HTMLVideoElement
                ? video.videoWidth || 640
                : frameSource.width || 640;
              const frameHeight = frameSource instanceof HTMLVideoElement
                ? video.videoHeight || 480
                : frameSource.height || 480;
              const previousTracks = faceTracksRef.current;
              const detectionBoxes = regions.map(({ x, y, width, height }) => ({ x, y, width, height }));
              const initialAssignments = assignFaceDetectionTracks(
                detectionBoxes,
                previousTracks.map(track => ({
                  ...track,
                  studentId: track.confirmedStudent?.id ?? null,
                })),
                regions.map(() => null),
                timestamp
              );
              provisionalTracks = regions.map((_, index) => {
                const trackIndex = initialAssignments[index];
                return trackIndex === null || trackIndex === undefined
                  ? undefined
                  : previousTracks[trackIndex];
              });
              qualityGateReasons = qualityAssessments.map((quality, index) => {
                const track = provisionalTracks[index];
                const history = track?.sharpnessHistory ?? [];
                const recent = [...history].sort((a, b) => a - b);
                const baseline = recent.length ? recent[Math.floor(recent.length / 2)]! : 0;
                const farBelowRecentSharpness = recent.length >= 2 &&
                  baseline > 0 &&
                  quality.sharpnessVariance < baseline * 0.25;
                return quality.reason ?? (farBelowRecentSharpness ? 'blurry' : undefined);
              });
              provisionalTracks.forEach((track, index) => {
                const quality = qualityAssessments[index]!;
                if (track && quality.usable && (!track.bestCrop || quality.score > track.bestCrop.score)) {
                  track.bestCrop = quality;
                }
                if (track) {
                  track.sharpnessHistory = [...track.sharpnessHistory, quality.sharpnessVariance].slice(-5);
                  if (motionEnabled && quality.usable && frameSource instanceof HTMLCanvasElement) {
                    const score = quality.sizeScore * 0.35 +
                      Math.min(1, quality.sharpnessVariance / 100) * 0.35 +
                      quality.poseScore * 0.3;
                    track.bestMotionCrops = [
                      ...track.bestMotionCrops.filter(candidate =>
                        candidate.capturedAt >= frameCapturedAt - SCAN_INTERVAL_MS * 3 &&
                        candidate.capturedAt !== frameCapturedAt
                      ),
                      { quality, region: regions[index]!, source: frameSource, capturedAt: frameCapturedAt, score },
                    ].slice(-3);
                  }
                }
              });
              const selection = selectFaceDescriptorDetections(
                provisionalTracks.map((track, index) => ({
                  confirmed: Boolean(track?.confirmedStudent),
                  lastDescriptorAt: track?.lastDescriptorAt ?? 0,
                  poseScore: qualityAssessments[index]!.poseScore,
                })),
                timestamp,
                descriptorRotationCursorRef.current,
                getFaceDescriptorBudget(isMobileFaceOptimizationActive()),
                CONFIRMED_REVERIFY_INTERVAL_MS
              );
              descriptorRotationCursorRef.current = selection.nextRotationCursor;
              const selectedIndices = selection.indices.filter(index => {
                const track = provisionalTracks[index];
                const firstOrDueAttempt = !track?.lastDescriptorAt ||
                  timestamp - track.lastDescriptorAt >= CONFIRMED_REVERIFY_INTERVAL_MS;
                const hasCachedCrop = Boolean(track?.bestCrop);
                return !QUALITY_GATE_ENABLED ||
                  firstOrDueAttempt ||
                  !qualityGateReasons[index] ||
                  hasCachedCrop;
              });
              extractedIndices = new Set(selectedIndices);
              if (motionEnabled) {
                selectedIndices.sort((a, b) => {
                  const aConfirmed = provisionalTracks[a]?.confirmedStudent ? 1 : 0;
                  const bConfirmed = provisionalTracks[b]?.confirmedStudent ? 1 : 0;
                  return aConfirmed - bConfirmed ||
                    regions[b]!.width * regions[b]!.height - regions[a]!.width * regions[a]!.height;
                });
              }
              setIsAnalyzing(true);
              setRecognizedFaces(regions.map((region, index) => ({
                id: `scan-${Math.round(performance.now())}-${index}`,
                student: null,
                box: { ...region, videoWidth: frameWidth, videoHeight: frameHeight },
                isLive: true,
                isMatching: false,
                status: 'scanning',
                diagnostic: {},
              })));

              const extractOne = async (index: number) => {
                const current = qualityAssessments[index]!;
                const track = provisionalTracks[index];
                const candidates = track?.bestMotionCrops ?? [];
                const bestCandidate = motionEnabled
                  ? [...candidates].sort((a, b) => b.score - a.score)[0]
                  : undefined;
                const extractionQuality = bestCandidate?.quality ?? current;
                const extractionRegion = bestCandidate?.region ?? regions[index]!;
                const extractionSource = bestCandidate?.source ?? frameSource;
                const allowRetries = FACE_CROP_ADAPTIVE_RETRY_ENABLED ||
                  motionEnabled ||
                  !track?.lastRetrySequenceAt ||
                  timestamp - track.lastRetrySequenceAt >= 1000;
                if (import.meta.env.DEV && motionEnabled) {
                  console.debug('[FaceRecognition] Motion snapshot-to-crop', {
                    trackId: track?.id ?? `new-face-${index}`,
                    frameId: detectionFrameRef?.current?.frameId ?? null,
                    snapshotToCropMs: Number((performance.now() - frameCapturedAt).toFixed(1)),
                    usedBestFrame: Boolean(bestCandidate && bestCandidate.capturedAt !== frameCapturedAt),
                  });
                }
                const result = await describePaddedFaceCrop(
                  extractionRegion,
                  extractionQuality.crop,
                  extractionQuality.cropX,
                  extractionQuality.cropY,
                  undefined,
                  extractionSource,
                  allowRetries,
                  motionEnabled || FACE_CROP_RETRY_DIAGNOSTICS_ENABLED
                    ? {
                        preferredStep: (motionEnabled || FACE_CROP_ADAPTIVE_RETRY_ENABLED) && track
                          ? lastSuccessfulCropStepByTrack.get(track.id)
                          : undefined,
                        maxDetectorPasses: motionEnabled || FACE_CROP_ADAPTIVE_RETRY_ENABLED ? 2 : undefined,
                        detectorInputSize: getFaceCropDetectorInputSize(),
                        shouldStop: motionEnabled
                          ? () => performance.now() - scanStartedAt >= (isMobileDevice() ? 90 : 120)
                          : undefined,
                      }
                    : undefined
                );
                if (bestCandidate && result.status === 'descriptor') {
                  const dx = regions[index]!.x - bestCandidate.region.x;
                  const dy = regions[index]!.y - bestCandidate.region.y;
                  result.detection.box.x += dx;
                  result.detection.box.y += dy;
                  result.detection.landmarks = result.detection.landmarks.map(point => ({
                    x: point.x + dx,
                    y: point.y + dy,
                  }));
                }
                result.region = regions[index]!;
                return result;
              };
              let selectedResults: FaceRegionRecognitionResult[];
              if (motionEnabled) {
                selectedResults = [];
                for (let position = 0; position < selectedIndices.length; position++) {
                  if (performance.now() - scanStartedAt >= (isMobileDevice() ? 90 : 120)) {
                    descriptorRotationCursorRef.current = selectedIndices[position]!;
                    for (let skippedPosition = position; skippedPosition < selectedIndices.length; skippedPosition++) {
                      const skippedIndex = selectedIndices[skippedPosition]!;
                      selectedResults.push({
                        region: regions[skippedIndex]!,
                        status: 'skipped',
                        reason: 'motion_time_budget',
                        durationMs: 0,
                      });
                    }
                    break;
                  }
                  const result = await extractOne(selectedIndices[position]!);
                  selectedResults.push(result);
                  if (result.status === 'skipped' && result.reason === 'motion_time_budget') {
                    descriptorRotationCursorRef.current = selectedIndices[position]!;
                    for (let skippedPosition = position + 1; skippedPosition < selectedIndices.length; skippedPosition++) {
                      const skippedIndex = selectedIndices[skippedPosition]!;
                      selectedResults.push({
                        region: regions[skippedIndex]!,
                        status: 'skipped',
                        reason: 'motion_time_budget',
                        durationMs: 0,
                      });
                    }
                    break;
                  }
                }
              } else {
                selectedResults = await Promise.all(selectedIndices.map(extractOne));
              }
              if (cancelled || shouldPause()) return;
              const resultByIndex = new Map(
                selectedIndices.map((index, selectedIndex) => [index, selectedResults[selectedIndex]!])
              );
              if (FACE_CROP_RETRY_DIAGNOSTICS_ENABLED || motionEnabled) {
                selectedResults.forEach((result, selectedIndex) => {
                  const track = provisionalTracks[selectedIndices[selectedIndex]!];
                  result.retryAttempts?.forEach(retryAttempt => {
                    const recent = cropRetryAttemptsByStep.get(retryAttempt.step)!;
                    recent.push(retryAttempt);
                    if (recent.length > 100) recent.shift();
                  });
                  if (track && result.status === 'descriptor' && result.retryStepSucceeded) {
                    lastSuccessfulCropStepByTrack.set(track.id, result.retryStepSucceeded);
                  }
                });
              }
              regionResults = regions.map((region, index) => resultByIndex.get(index) ?? {
                region,
                status: 'skipped',
                reason: !selection.indices.includes(index)
                  ? 'descriptor_budget'
                  : qualityGateReasons[index] && !provisionalTracks[index]?.bestCrop && QUALITY_GATE_ENABLED
                    ? 'low_quality'
                    : 'descriptor_budget',
                durationMs: 0,
              });

              if (import.meta.env.DEV && qualityScanLogCount < 10) {
                qualityScanLogCount++;
                regions.forEach((_, index) => {
                  const quality = qualityAssessments[index]!;
                  const wasSelected = selection.indices.includes(index);
                  const wasAttempted = selectedIndices.includes(index);
                  const result = resultByIndex.get(index);
                  const track = provisionalTracks[index];
                  const firstOrDueAttempt = !track?.lastDescriptorAt ||
                    timestamp - track.lastDescriptorAt >= CONFIRMED_REVERIFY_INTERVAL_MS;
                  const selectedWhy = !QUALITY_GATE_ENABLED
                    ? 'quality gate disabled'
                    : firstOrDueAttempt
                      ? 'first or one-second descriptor attempt'
                      : track?.bestCrop && qualityGateReasons[index]
                        ? 'cached quality crop'
                        : 'quality gate passed';
                  const skippedWhy = !wasSelected
                    ? 'descriptor budget / reverify not due'
                    : !wasAttempted
                      ? qualityGateReasons[index] ?? 'quality gate'
                      : undefined;
                  qualityLogCounts.faces++;
                  if (quality.usable) qualityLogCounts.qualityUsable++;
                  else qualityLogCounts.qualityRejected++;
                  if (QUALITY_GATE_ENABLED && qualityGateReasons[index]) {
                    qualityLogCounts.gateRejected++;
                  }
                  if (wasAttempted) qualityLogCounts.selected++;
                  else qualityLogCounts.skipped++;
                  if (!wasSelected) qualityLogCounts.skippedByDescriptor++;
                  if (result) qualityLogCounts[result.status]++;
                  console.info('[FaceRecognition] Quality scan', {
                    scan: qualityScanLogCount,
                    face: index,
                    quality: {
                      size: quality.faceSizePx,
                      detectorScore: quality.detectorScore,
                      sharpnessVariance: quality.sharpnessVariance,
                      poseScore: quality.poseScore,
                      usable: quality.usable,
                      reason: qualityGateReasons[index] ?? quality.reason ?? null,
                    },
                    selection: wasAttempted
                      ? { result: 'selected', reason: selectedWhy }
                      : { result: 'skipped', reason: skippedWhy },
                    descriptor: result
                      ? {
                          status: result.status,
                          reason: 'reason' in result
                            ? result.reason
                            : result.status === 'descriptor'
                              ? 'descriptor_extracted'
                              : undefined,
                        }
                      : { status: 'skipped', reason: skippedWhy },
                  });
                });
                if (qualityScanLogCount === 10) {
                  console.info('[FaceRecognition] First 10 quality scan aggregate', qualityLogCounts);
                }
              }
              if (import.meta.env.DEV && cropAttemptLogCount < 50) {
                selectedIndices.forEach((index, selectedIndex) => {
                  const result = selectedResults[selectedIndex]!;
                  result.retryAttempts?.forEach(retryAttempt => {
                    if (cropAttemptLogCount >= 50) return;
                    cropAttemptLogCount++;
                    if (retryAttempt.failureReason) {
                      cropAttemptCounts[retryAttempt.failureReason]++;
                    } else if (result.status === 'descriptor') {
                      cropAttemptCounts.succeededByStep[retryAttempt.step]++;
                    }
                    console.info('[FaceRecognition] Crop extraction attempt', {
                      attempt: cropAttemptLogCount,
                      trackId: provisionalTracks[index]?.id ?? `new-face-${index}`,
                      step: retryAttempt.step,
                      failureReason: retryAttempt.failureReason,
                      error: retryAttempt.error,
                      retryStepSucceeded: result.retryStepSucceeded ?? null,
                    });
                    if (cropAttemptLogCount === 50) {
                      console.info('[FaceRecognition] First 50 crop extraction attempts aggregate', cropAttemptCounts);
                    }
                  });
                });
              }
            } else {
              setRecognizedFaces([]);
            }

            const attempts = regionResults;
            const frameWidth = frameSource instanceof HTMLVideoElement
            ? video.videoWidth || 640
            : frameSource.width || 640;
            const frameHeight = frameSource instanceof HTMLVideoElement
            ? video.videoHeight || 480
            : frameSource.height || 480;
            const nextTracks: FaceRecognitionTrack[] = [];
            const recognizedItems: RecognizedFaceItem[] = [];
            const decisions = attempts.map(attempt =>
              attempt.status === 'descriptor'
                ? resolveMatch(attempt.detection.descriptor)
                : null
            );
            const matches = decisions.map(decision => decision?.student ?? null);
            const trackAssignments = assignFaceDetectionTracks(
              attempts.map(attempt => attempt.region),
              faceTracksRef.current.map(track => ({
                ...track,
                studentId: track.confirmedStudent?.id ?? (track.candidateStudentId || null),
              })),
              matches.map((match, index) =>
                match?.id ?? provisionalTracks?.[index]?.confirmedStudent?.id ?? null
              ),
              timestamp
            );
            const usedTracks = new Set<number>();
            const itemTracks: FaceRecognitionTrack[] = [];

            for (let detectionIndex = 0; detectionIndex < attempts.length; detectionIndex++) {
              const attempt = attempts[detectionIndex]!;
              const detection = attempt.status === 'descriptor' ? attempt.detection : null;
              const match = matches[detectionIndex] ?? null;
              const bounds = attempt.region;
              const box: FaceRecognitionBox = {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                videoWidth: frameWidth,
                videoHeight: frameHeight,
                frameCapturedAt: bounds.frameCapturedAt ?? detectionFrame?.capturedAt ?? performance.now(),
                detectionResultAt: bounds.detectionResultAt ?? detectionFrame?.resultArrivedAt,
                frameTimestamp: bounds.frameTimestamp ?? detectionFrame?.frameTimestamp,
                predicted: bounds.predicted,
              };
              const centerX = box.x + box.width / 2;
              const centerY = box.y + box.height / 2;
              const assignedTrackIndex = trackAssignments[detectionIndex];
              const bestTrack = assignedTrackIndex === null || assignedTrackIndex === undefined
                ? undefined
                : faceTracksRef.current[assignedTrackIndex];

              const track: FaceRecognitionTrack = bestTrack ?? {
                id: `face-${nextFaceTrackIdRef.current++}`,
                box,
                velocityX: 0,
                velocityY: 0,
                lastSeenAt: timestamp,
                missedFrames: 0,
                lastDescriptorAt: 0,
                lastMatchDistance: Number.POSITIVE_INFINITY,
                candidateStudentId: '',
                stabilityCount: 0,
                confirmedStudent: null,
                pendingSwitch: false,
                detectorSource: attempt.region.detectorSource ?? 'scrfd',
                matchHistory: [],
                firstDetectedAt: timestamp,
                scansUsed: 0,
                sharpnessHistory: [],
                lastRetrySequenceAt: 0,
                bestMotionCrops: [],
              };
              if (assignedTrackIndex !== null && assignedTrackIndex !== undefined) {
                usedTracks.add(assignedTrackIndex);
              }
              if (bestTrack) {
                const previousCenterX = bestTrack.box.x + bestTrack.box.width / 2;
                const previousCenterY = bestTrack.box.y + bestTrack.box.height / 2;
                const elapsed = Math.max(1, timestamp - bestTrack.lastSeenAt);
                bestTrack.velocityX =
                  bestTrack.velocityX * 0.4 + ((centerX - previousCenterX) / elapsed) * 0.6;
                bestTrack.velocityY =
                  bestTrack.velocityY * 0.4 + ((centerY - previousCenterY) / elapsed) * 0.6;
              }
              track.box = box;
              track.detectorSource = attempt.region.detectorSource ?? 'scrfd';
              track.lastSeenAt = timestamp;
              track.missedFrames = 0;
              const quality = qualityAssessments[detectionIndex]!;
              if (quality.usable && (!track.bestCrop || quality.score >= track.bestCrop.score)) {
                track.bestCrop = quality;
              }
              if (!bestTrack) {
                track.sharpnessHistory = [quality.sharpnessVariance];
              }
              if (attempt.status === 'descriptor') {
                track.lastDescriptorAt = timestamp;
                track.scansUsed++;
                if (FACE_CROP_RETRY_DIAGNOSTICS_ENABLED && attempt.retryStepSucceeded) {
                  lastSuccessfulCropStepByTrack.set(track.id, attempt.retryStepSucceeded);
                }
              }
              if ((attempt.retryAttempts?.length ?? 0) > 1) {
                track.lastRetrySequenceAt = timestamp;
              }
              const decision = decisions[detectionIndex];
              const matchDiagnostics = decision?.diagnostic ?? null;
              const bestDistance = matchDiagnostics?.bestDistance ??
                (decision ? decision.result.distance : null);
              if (match && decisions[detectionIndex]) {
                track.lastMatchDistance = decisions[detectionIndex]!.result.distance;
              }
              if (FACE_DIAGNOSTICS_ENABLED && bestDistance !== null && Number.isFinite(bestDistance)) {
                const distances = diagnosticTrackDistances.get(track.id) ?? [];
                distances.push(bestDistance);
                if (distances.length > 200) distances.shift();
                diagnosticTrackDistances.set(track.id, distances);
              }

              const sameConfirmedStudent = Boolean(
                match && track.confirmedStudent?.id === match.id
              );
              const enrolledFace = match && sameConfirmedStudent
                ? galleryRef.current.find(entry => entry.label === match.id)
                : undefined;
              const sameStudentVerified = !sameConfirmedStudent || Boolean(
                attempt.status === 'descriptor' &&
                enrolledFace &&
                isSameEnrolledPerson(attempt.detection.descriptor, enrolledFace.descriptors)
              );
              const previousIdentity = track.confirmedStudent?.id ?? null;
              const identity = updateFaceTrackIdentity(
                {
                  candidateStudentId: track.candidateStudentId,
                  stabilityCount: track.stabilityCount,
                  confirmedStudentId: track.confirmedStudent?.id ?? null,
                  pendingSwitch: track.pendingSwitch,
                  matchHistory: track.matchHistory,
                },
                match?.id ?? null,
                attempt.status === 'descriptor',
                sameStudentVerified,
                STABILITY_FRAMES_REQUIRED,
                MATCH_SWITCH_STABILITY_FRAMES,
                Boolean(
                  match &&
                  canFastConfirmFaceMatch(
                    decisions[detectionIndex]?.result.distance ?? Number.POSITIVE_INFINITY,
                    decisions[detectionIndex]?.result.secondDistance ?? Number.POSITIVE_INFINITY,
                    FAST_CONFIRM_ENABLED
                  )
                )
              );
              track.candidateStudentId = identity.candidateStudentId;
              track.stabilityCount = identity.stabilityCount;
              track.pendingSwitch = identity.pendingSwitch;
              track.matchHistory = identity.matchHistory;
              if (identity.confirmedStudentId && identity.confirmedStudentId !== previousIdentity) {
                track.confirmedAt = timestamp;
                if (FACE_DIAGNOSTICS_ENABLED) {
                  const distanceStats = getMedianAndP90(diagnosticTrackDistances.get(track.id) ?? []);
                  confirmedTrackReports.push({
                    trackId: track.id,
                    studentId: identity.confirmedStudentId,
                    scansToConfirm: track.scansUsed,
                    timeToConfirmMs: timestamp - track.firstDetectedAt,
                    medianBestDistance: distanceStats.median,
                    p90BestDistance: distanceStats.p90,
                    detectorPassesPerSuccessfulExtraction:
                      attempt.retryAttempts?.filter(retryAttempt => retryAttempt.detector).length ?? 0,
                  });
                  if (confirmedTrackReports.length > 20) confirmedTrackReports.shift();
                }
              }
              if (!identity.confirmedStudentId) {
                track.confirmedStudent = null;
                track.confirmedAt = undefined;
              } else if (
                match?.id === identity.confirmedStudentId &&
                (!sameConfirmedStudent || sameStudentVerified)
              ) {
                track.confirmedStudent = match;
              }

              nextTracks.push(track);
              const status: RecognizedFaceItem['status'] =
                attempt.status === 'failed'
                  ? 'processing_failed'
                  : attempt.status === 'quality_rejected'
                    ? 'quality_rejected'
                    : track.confirmedStudent
                      ? 'recognized'
                    : attempt.status === 'skipped' && attempt.reason === 'low_quality'
                      ? 'quality_rejected'
                    : attempt.status === 'skipped'
                      ? 'scanning'
                      : match || track.candidateStudentId
                          ? 'scanning'
                          : 'unknown';
              if (FACE_DIAGNOSTICS_ENABLED) {
                const outcome = attempt.status === 'descriptor'
                  ? decision?.result.accepted
                    ? 'matched'
                    : decision?.result.reason === 'ambiguous'
                      ? 'ambiguous'
                      : 'no_match'
                  : attempt.status === 'failed'
                    ? 'extraction_failed'
                    : attempt.status === 'quality_rejected' ||
                        (attempt.status === 'skipped' && attempt.reason === 'low_quality')
                      ? 'skipped_low_quality'
                      : 'skipped';
                const pose = estimateScrfdPose(attempt.region.landmarks);
                const yawBucket = getFaceYawBucket(pose.yawDeg);
                const bucket = recognitionDiagnosticBuckets[yawBucket];
                const bestStudentId = matchDiagnostics?.bestStudentId ?? match?.id ?? null;
                const secondBestDistance = matchDiagnostics?.secondBestDistance ??
                  decision?.result.secondDistance ?? Number.POSITIVE_INFINITY;
                const closestDescriptorIndex = matchDiagnostics?.closestDescriptorIndex ?? null;
                recognitionDiagnosticOutcomes[outcome] =
                  (recognitionDiagnosticOutcomes[outcome] ?? 0) + 1;
                bucket.attempts++;
                bucket.outcomes[outcome] = (bucket.outcomes[outcome] ?? 0) + 1;
                if (bestDistance !== null && Number.isFinite(bestDistance)) {
                  bucket.distances.push(bestDistance);
                  if (bestDistance > FACENET_DISTANCE_THRESHOLD) bucket.overThreshold++;
                }
                console.debug('[FaceRecognition] Recognition attempt', {
                  trackId: track.id,
                  bestMatchStudentId: bestStudentId,
                  bestDistance,
                  secondBestDistance,
                  closestStoredDescriptor: closestDescriptorIndex === null
                    ? null
                    : {
                        angle: ['front', 'left', 'right'][closestDescriptorIndex] ?? 'other',
                        index: closestDescriptorIndex,
                      },
                  yawDeg: pose.yawDeg,
                  rollDeg: pose.rollDeg,
                  yawBucket,
                  faceSizePx: quality.faceSizePx,
                  sharpnessVariance: quality.sharpnessVariance,
                  outcome,
                  reason: attempt.status === 'descriptor'
                    ? decision?.result.reason
                    : attempt.status === 'skipped' || attempt.status === 'failed' ||
                        attempt.status === 'quality_rejected'
                      ? attempt.reason
                      : undefined,
                });

                if ((FACE_CROP_RETRY_DIAGNOSTICS_ENABLED || motionEnabled) && attempt.status === 'descriptor') {
                  successfulExtractionsInWindow++;
                  detectorPassesForSuccessfulExtractionsInWindow +=
                    attempt.retryAttempts?.filter(retryAttempt => retryAttempt.detector).length ?? 0;
                }
                if ((FACE_CROP_PADDING_COMPARISON_ENABLED || motionEnabled) && attempt.status === 'descriptor') {
                  if (!paddingComparisonAtByTrack.has(track.id)) {
                    paddingComparisonAtByTrack.set(track.id, timestamp);
                    const comparisonStartedAt = performance.now();
                    void compareFacePaddingDescriptors(attempt.region, frameSource)
                      .then(comparison => {
                        console.info('[FaceRecognition] Same-frame 20% vs 40% crop descriptor comparison', {
                          trackId: track.id,
                          distance: comparison.distance,
                          twentyPercentDescriptorAvailable: comparison.twentyPercent,
                          fortyPercentDescriptorAvailable: comparison.fortyPercent,
                          comparisonMs: Number((performance.now() - comparisonStartedAt).toFixed(1)),
                          adaptiveRetryEnabled: FACE_CROP_ADAPTIVE_RETRY_ENABLED,
                        });
                        if (comparison.distance !== null && comparison.distance > 0.15) {
                          console.warn('[FaceRecognition] Padding comparison exceeded 0.15; review paired live results before changing any default.', {
                            trackId: track.id,
                            distance: comparison.distance,
                          });
                        }
                      })
                      .catch(error => {
                        console.warn('[FaceRecognition] Same-frame crop comparison failed:', error);
                      });
                  }
                }

                if (
                  attempt.status === 'descriptor' &&
                  yawBucket === 'frontal <10' &&
                  bestStudentId
                ) {
                  const reportKey = `${track.id}:${bestStudentId}`;
                  const lastReportAt = reportedStoredDistancesAt.get(reportKey) ?? 0;
                  if (timestamp - lastReportAt >= 10_000) {
                    const stored = galleryRef.current.find(entry => entry.label === bestStudentId);
                    if (stored) {
                      reportedStoredDistancesAt.set(reportKey, timestamp);
                      const angleNames = ['front', 'left', 'right'];
                      const descriptorRows = stored.descriptors.map((storedDescriptor, index) => ({
                        studentId: bestStudentId,
                        descriptor: angleNames[index] ?? `index ${index}`,
                        index,
                        distance: euclideanDistance(attempt.detection.descriptor, storedDescriptor),
                      }));
                      console.info('[FaceRecognition] Stored descriptors vs live frontal descriptor', {
                        trackId: track.id,
                        studentId: bestStudentId,
                        yawDeg: pose.yawDeg,
                      });
                      console.table(descriptorRows);
                    }
                  }
                }
              }
              itemTracks.push(track);
              recognizedItems.push({
                id: track.id,
                student: status === 'recognized' ? track.confirmedStudent : null,
                box,
                isLive: true,
                isMatching: status === 'scanning' && Boolean(track.candidateStudentId),
                status,
                diagnostic: {
                  selectedForExtraction: extractedIndices.has(detectionIndex),
                  trackExists: true,
                  reason: attempt.status === 'descriptor'
                    ? undefined
                    : attempt.status === 'skipped' && attempt.reason === 'low_quality'
                      ? qualityGateReasons[detectionIndex] ?? attempt.reason
                      : attempt.reason,
                  matchReason: decision?.result.reason,
                  distance: decision?.result.distance,
                  cropDurationMs: attempt.durationMs,
                  source: attempt.status === 'descriptor' ? attempt.source : undefined,
                  detectorSource: attempt.region.detectorSource,
                  missedFrames: track.missedFrames,
                  qualityScore: quality.score,
                  faceSizePx: quality.faceSizePx,
                  detectorScore: quality.detectorScore,
                  sharpnessVariance: quality.sharpnessVariance,
                  poseScore: quality.poseScore,
                  retryStepSucceeded: attempt.retryStepSucceeded,
                  extractionFailureReason: attempt.status === 'failed'
                    ? attempt.reason === 'no_face_in_crop'
                      ? 'no_face_in_crop'
                      : 'inference_error'
                    : undefined,
                  timeToConfirmMs: track.confirmedAt
                    ? track.confirmedAt - track.firstDetectedAt
                    : timestamp - track.firstDetectedAt,
                  scansUsed: track.scansUsed,
                },
                score: detection?.score,
              });
            }

            if (regions.length === 0) {
              faceTracksRef.current = [];
            } else {
              faceTracksRef.current.forEach((track, trackIndex) => {
                if (usedTracks.has(trackIndex)) return;
                track.missedFrames++;
                if (track.missedFrames > 1) return;
                nextTracks.push(track);
              });
            }
            const duplicateLosers = findDuplicateStudentClaimLosers(
              recognizedItems.map((item, index) => ({
                studentId: item.student?.id ?? null,
                distance: item.diagnostic.distance ??
                  itemTracks[index]?.lastMatchDistance ??
                  Number.POSITIVE_INFINITY,
              }))
            );
            for (const index of duplicateLosers) {
              const item = recognizedItems[index]!;
              const track = itemTracks[index] ?? nextTracks.find(candidate => candidate.id === item.id);
              if (!track) continue;
              track.confirmedStudent = null;
              track.candidateStudentId = '';
              track.stabilityCount = 0;
              track.pendingSwitch = false;
              track.matchHistory = [];
              track.confirmedAt = undefined;
              track.lastMatchDistance = Number.POSITIVE_INFINITY;
              item.student = null;
              item.status = 'unknown';
              item.isMatching = false;
              item.diagnostic.reason = 'duplicate_student_claim';
            }
            faceTracksRef.current = nextTracks;
            if (FACE_DIAGNOSTICS_ENABLED) {
              const activeTrackIds = new Set(nextTracks.map(track => track.id));
              for (const trackId of diagnosticTrackDistances.keys()) {
                if (!activeTrackIds.has(trackId)) diagnosticTrackDistances.delete(trackId);
              }
              for (const reportKey of reportedStoredDistancesAt.keys()) {
                if (!activeTrackIds.has(reportKey.slice(0, reportKey.indexOf(':')))) {
                  reportedStoredDistancesAt.delete(reportKey);
                }
              }
              for (const trackId of lastSuccessfulCropStepByTrack.keys()) {
                if (!activeTrackIds.has(trackId)) lastSuccessfulCropStepByTrack.delete(trackId);
              }
              for (const trackId of paddingComparisonAtByTrack.keys()) {
                if (!activeTrackIds.has(trackId)) paddingComparisonAtByTrack.delete(trackId);
              }
            }
            if (performance.now() <= overlapDebugUntilRef.current) {
              nextTracks.forEach((track, index) => {
                nextTracks.slice(index + 1).forEach(otherTrack => {
                  const { iou, centerDistance } = faceBoxOverlap(track.box, otherTrack.box);
                  if (iou <= 0.3) return;
                  console.debug('[FaceRecognition] Overlapping tracks', {
                    tracks: [
                      {
                        id: track.id,
                        source: track.detectorSource,
                        status: track.confirmedStudent ? 'confirmed' : track.candidateStudentId ? 'candidate' : 'unconfirmed',
                        missedFrames: track.missedFrames,
                      },
                      {
                        id: otherTrack.id,
                        source: otherTrack.detectorSource,
                        status: otherTrack.confirmedStudent ? 'confirmed' : otherTrack.candidateStudentId ? 'candidate' : 'unconfirmed',
                        missedFrames: otherTrack.missedFrames,
                      },
                    ],
                    iou: Number(iou.toFixed(3)),
                    centerDistance: Number(centerDistance.toFixed(1)),
                  });
                });
              });
            }
            const primaryDetection = attempts
              .filter((attempt): attempt is Extract<FaceRegionRecognitionResult, { status: 'descriptor' }> =>
                attempt.status === 'descriptor'
              )
              .reduce<FaceRegionRecognitionResult | null>((largest, current) =>
                !largest || current.detection.box.width * current.detection.box.height >
                  (largest.status === 'descriptor'
                    ? largest.detection.box.width * largest.detection.box.height
                    : 0)
                  ? current
                  : largest,
                null
              );
            if (primaryDetection?.status === 'descriptor') {
              applyDetectionOverlay(primaryDetection.detection, video);
              const primaryLandmarks = primaryDetection.detection.landmarks;
              const leftEye = primaryLandmarks.length >= 68 ? primaryLandmarks[36] : primaryLandmarks[0];
              const rightEye = primaryLandmarks.length >= 68 ? primaryLandmarks[45] : primaryLandmarks[1];
              setNativeIOD(leftEye && rightEye
                ? Math.round(Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y))
                : 0);
            } else {
              setNativeIOD(0);
              setLandmarks(null);
            }
            const confirmedStudents = recognizedItems
              .map(item => item.student)
              .filter((student): student is RecognizedStudent => student !== null);
            const uniqueStudents = Array.from(
              new Map(confirmedStudents.map(student => [student.id, student])).values()
            );
            if (uniqueStudents.length > 0 && !firstRecognitionLoggedRef.current) {
              firstRecognitionLoggedRef.current = true;
              const durationMs = performance.now();
              setStartupTimings(current => ({ ...current, firstRecognitionMs: durationMs }));
              if (FACE_DIAGNOSTICS_ENABLED) {
                console.info(`[FaceRecognition] Page-open to first successful recognition: ${durationMs.toFixed(0)}ms.`);
              }
            }
            const primaryStudent = recognizedItems
              .find(item => item.student !== null)?.student ?? null;

            setRecognizedFaces(recognizedItems);
            updatesInPerformanceWindow++;
            setMatchedStudents(uniqueStudents);
            setMatchedStudent(primaryStudent);
            setQualityPassed(true);
            setQualityGuidance(
              uniqueStudents.length > 0
                ? `Recognized ${uniqueStudents.length} of ${attempts.length} detected face(s).`
                : `Detected ${attempts.length} face(s); scanning ${recognizedItems.filter(item => item.status === 'scanning').length}.`
            );
            setDiagnosticInfo(
              `Detected ${attempts.length}; descriptors ${attempts.filter(attempt => attempt.status === 'descriptor').length}; ` +
              `recognized ${uniqueStudents.length}; ` +
              (lastMatchResultRef.current
                ? `Match ${lastMatchResultRef.current.reason}; nearest distance ${
                    Number.isFinite(lastMatchResultRef.current.distance)
                      ? lastMatchResultRef.current.distance.toFixed(3)
                      : 'n/a'
                  } (limit ${FACENET_DISTANCE_THRESHOLD}).`
                : '')
            );
            if (import.meta.env.DEV) {
              const regionStatusCounts = attempts.reduce<Record<string, number>>((counts, attempt) => {
                const key = attempt.status === 'descriptor' ? 'ok' : `${attempt.status}:${attempt.reason}`;
                counts[key] = (counts[key] ?? 0) + 1;
                return counts;
              }, {});
              const scanDiagnostics = {
                detectedBoxes: attempts.length,
                descriptorSuccesses: attempts.filter(attempt => attempt.status === 'descriptor').length,
                descriptorsSkipped: attempts.filter(attempt => attempt.status === 'skipped').length,
                gallerySize: galleryRef.current.length,
                modelsLoaded: {
                  tinyFaceDetector: faceapi.nets.tinyFaceDetector.isLoaded,
                  ssdMobilenetv1: faceapi.nets.ssdMobilenetv1.isLoaded,
                  landmarks: faceapi.nets.faceLandmark68Net.isLoaded,
                  recognition: faceapi.nets.faceRecognitionNet.isLoaded,
                },
                matchQueries: decisions.map(decision => decision
                  ? {
                      accepted: decision.result.accepted,
                      reason: decision.result.reason,
                      distance: decision.result.distance,
                      galleryLabel: decision.result.label,
                      hasDescriptor: true,
                    }
                  : { hasDescriptor: false }),
                regionStatusCounts,
                acceptedMatchCandidates: new Set(
                  decisions
                    .map(decision => decision?.student?.id)
                    .filter((studentId): studentId is string => Boolean(studentId))
                ).size,
                recognizedIdentities: uniqueStudents.length,
                unknownFaces: recognizedItems.filter(item => item.status === 'unknown').length,
                qualityRejectedFaces: recognizedItems.filter(item => item.status === 'quality_rejected').length,
                processingFailures: recognizedItems.filter(item => item.status === 'processing_failed').length,
                stability: nextTracks.map(track => ({
                  id: track.id,
                  candidate: track.candidateStudentId || null,
                  count: track.stabilityCount,
                  confirmed: track.confirmedStudent?.id ?? null,
                })),
                detectionOrFrameInferenceMs: detectorDurationMs,
                totalScanDurationMs: performance.now() - recognitionStartedAt,
                faces: recognizedItems.map(item => ({
                  trackId: item.id,
                  box: { x: item.box.x, y: item.box.y, width: item.box.width, height: item.box.height },
                  status: item.status,
                  reason: item.diagnostic.reason,
                  cropDurationMs: item.diagnostic.cropDurationMs,
                  source: item.diagnostic.source,
                  matchReason: item.diagnostic.matchReason,
                  distance: item.diagnostic.distance,
                })),
              };
              if (regionResultLogCount < 8) {
                regionResultLogCount += 1;
                if (FACE_DIAGNOSTICS_ENABLED) console.info('[FaceRecognition] Region results', scanDiagnostics);
              } else {
                if (FACE_DIAGNOSTICS_ENABLED) console.debug('[FaceRecognition] Scan diagnostics', scanDiagnostics);
              }
            }
            setIsLive(uniqueStudents.length > 0);
            isLiveRef.current = uniqueStudents.length > 0;
            setIsAnalyzing(recognizedItems.some(item => item.isMatching));
          } catch (scanError) {
            setIsAnalyzing(false);
            const reason = scanError instanceof Error ? scanError.message : String(scanError);
            setRecognizedFaces(current => current.map(item => item.status === 'scanning'
              ? {
                  ...item,
                  status: 'processing_failed',
                  isMatching: false,
                  diagnostic: { ...item.diagnostic, reason },
                }
              : item
            ));
            console.warn('[FaceRecognition] Live scan failed:', scanError);
          } finally {
            releaseFaceScan(processingRef);
            scansInPerformanceWindow++;
            const completedScanDuration = performance.now() -
              (FACE_MOTION_OPTIMIZATIONS_ENABLED && scanSnapshotStartedAt !== null
                ? scanSnapshotStartedAt
                : scanStartedAt);
            scanDurationInPerformanceWindow += completedScanDuration;
            if (FACE_MOTION_OPTIMIZATIONS_ENABLED) motionScanDurations.push(completedScanDuration);
            const performanceWindowMs = performance.now() - performanceWindowStartedAt;
            if (FACE_DIAGNOSTICS_ENABLED && performanceWindowMs >= 5000) {
              console.info('[FaceRecognition] Performance window', {
                averageScanMs: Number((scanDurationInPerformanceWindow / scansInPerformanceWindow).toFixed(1)),
                scansPerSecond: Number((scansInPerformanceWindow * 1000 / performanceWindowMs).toFixed(2)),
                recognitionUpdatesPerSecond: Number((updatesInPerformanceWindow * 1000 / performanceWindowMs).toFixed(2)),
              });
              performanceWindowStartedAt = performance.now();
              scansInPerformanceWindow = 0;
              updatesInPerformanceWindow = 0;
              scanDurationInPerformanceWindow = 0;
            }
            const recognitionDiagnosticWindowMs = performance.now() - recognitionDiagnosticWindowStartedAt;
            if (
              (FACE_DIAGNOSTICS_ENABLED || (import.meta.env.DEV && FACE_MOTION_OPTIMIZATIONS_ENABLED)) &&
              recognitionDiagnosticWindowMs >= 10_000
            ) {
              console.groupCollapsed('[FaceRecognition] Recognition diagnostics (10-second window)');
              if (FACE_MOTION_OPTIMIZATIONS_ENABLED) {
                console.info('[FaceRecognition] Motion scan metrics (10-second window)', {
                  averageScanMs: motionScanDurations.length
                    ? Number((motionScanDurations.reduce((sum, duration) => sum + duration, 0) / motionScanDurations.length).toFixed(1))
                    : null,
                  scans: motionScanDurations.length,
                  timeToConfirmMs: confirmedTrackReports.map(report => report.timeToConfirmMs),
                });
                motionScanDurations.length = 0;
              }
              console.table(Object.entries(recognitionDiagnosticOutcomes).map(([outcome, count]) => ({
                outcome,
                count,
              })));
              console.table(Object.entries(recognitionDiagnosticBuckets).map(([yawBucket, stats]) => {
                const distances = getMedianAndP90(stats.distances);
                return {
                  yawBucket,
                  attempts: stats.attempts,
                  aboveThreshold: stats.overThreshold,
                  medianBestDistance: distances.median,
                  p90BestDistance: distances.p90,
                  outcomes: JSON.stringify(stats.outcomes),
                };
              }));
              console.table(confirmedTrackReports);
              if (FACE_CROP_RETRY_DIAGNOSTICS_ENABLED || FACE_MOTION_OPTIMIZATIONS_ENABLED) {
                console.table(Array.from(cropRetryAttemptsByStep, ([step, attempts]) => ({
                  step,
                  attempts: attempts.length,
                  successes: attempts.filter(attempt => attempt.failureReason === null).length,
                  noFaceInCrop: attempts.filter(attempt => attempt.failureReason === 'no_face_in_crop').length,
                  successRatePercent: attempts.length
                    ? Number((attempts.filter(attempt => attempt.failureReason === null).length * 100 / attempts.length).toFixed(1))
                    : null,
                  averageStepMs: attempts.length
                    ? Number((attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0) / attempts.length).toFixed(1))
                    : null,
                  detectorInputSizes: Array.from(new Set(attempts.map(attempt => attempt.detectorInputSize).filter(Boolean))).join(', '),
                })));
                console.info('[FaceRecognition] Crop extraction efficiency (10-second window)', {
                  successfulExtractions: successfulExtractionsInWindow,
                  detectorPassesForSuccessfulExtractions: detectorPassesForSuccessfulExtractionsInWindow,
                  averageDetectorPassesPerSuccessfulExtraction: successfulExtractionsInWindow
                    ? Number((detectorPassesForSuccessfulExtractionsInWindow / successfulExtractionsInWindow).toFixed(2))
                    : null,
                  detectorInputSizeForFirstAttempt: getFaceCropDetectorInputSize(),
                });
                for (const attempts of cropRetryAttemptsByStep.values()) {
                  if (attempts.length > 100) attempts.splice(0, attempts.length - 100);
                }
                successfulExtractionsInWindow = 0;
                detectorPassesForSuccessfulExtractionsInWindow = 0;
              }
              console.groupEnd();
              for (const outcome of Object.keys(recognitionDiagnosticOutcomes)) {
                delete recognitionDiagnosticOutcomes[outcome];
              }
              for (const stats of Object.values(recognitionDiagnosticBuckets)) {
                stats.attempts = 0;
                stats.overThreshold = 0;
                stats.distances = [];
                stats.outcomes = {};
              }
              recognitionDiagnosticWindowStartedAt = performance.now();
            }
            if (!cancelled && !shouldPause()) {
              const elapsed = performance.now() - scanStartedAt;
              const delay = elapsed > SCAN_INTERVAL_MS
                ? scanOverrunCooldownMs(elapsed)
                : Math.max(0, SCAN_INTERVAL_MS - elapsed);
              scheduleScan(delay);
            }
          }
        };
        visibilityHandler = () => {
          if (shouldPause()) {
            cancelScheduledScan();
          } else {
            scheduleScan(0);
          }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
        scheduleScan(SCAN_INTERVAL_MS);

        if (missingDescriptorStudents.length > 0) {
          void (async () => {
            const descriptorStartedAt = performance.now();
            for (const student of missingDescriptorStudents) {
              await waitForVisiblePage();
              if (cancelled) return;
              await new Promise(resolve => setTimeout(resolve, 150));
              if (cancelled) return;

              const descriptors: Float32Array[] = [];
              for (const url of getStudentPhotoUrls(student)) {
                await waitForVisiblePage();
                if (cancelled) return;
                try {
                  const image = await loadImage(url);
                  const descriptor = await extractDescriptorFromImage(image);
                  if (descriptor) descriptors.push(descriptor);
                } catch (imageError) {
                  console.warn(`[FaceRecognition] Photo descriptor note for ${student.name}:`, imageError);
                }
              }

              if (cancelled) return;
              if (descriptors.length > 0) {
                assignStudentFaceDescriptors(student.id, descriptors);
                galleryRef.current = [
                  ...galleryRef.current.filter(entry => entry.label !== student.id),
                  { label: student.id, descriptors },
                ];
              }
            }
            const durationMs = performance.now() - descriptorStartedAt;
            setStartupTimings(current => ({ ...current, legacyDescriptorMs: durationMs }));
            if (FACE_DIAGNOSTICS_ENABLED) {
              console.info(`[FaceRecognition] Deferred legacy descriptor computation completed in ${durationMs.toFixed(0)}ms.`);
            }
          })().catch(error => {
            if (!cancelled) console.error('[FaceRecognition] Deferred descriptor computation failed:', error);
          });
        }
      } catch (initializationError: any) {
        clearStartupTimer();
        initializationFailed = true;
        if (!cancelled && !startupTimedOut) {
          setIsLoading(false);
          setStartupStage('error');
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
      clearStartupTimer();
      finishVisibilityWait?.();
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      cancelScheduledScan();
      galleryRef.current = [];
      faceTracksRef.current = [];
      processingRef.current = false;
      isLiveRef.current = false;
      lastMatchResultRef.current = null;
      lastConfirmedMatchRef.current = null;
      lastBoxRef.current = null;
    };
  }, [active, applyDetectionOverlay, resolveMatch, videoRef, detectedFaceBoxesRef, retryToken]);

  return {
    isLoading,
    isReady,
    matchedStudent,
    matchedStudents,
    recognizedFaces,
    error,
    landmarks,
    recognitionBox,
    isLive,
    isAnalyzing,
    diagnosticInfo,
    assignCameraFaceToStudent,
    nativeIOD,
    qualityGuidance,
    qualityPassed,
    startupStage,
    startupTimings,
    retryInitialization,
  };
}
