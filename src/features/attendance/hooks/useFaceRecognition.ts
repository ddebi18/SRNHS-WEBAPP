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
  describeScrfdFaceRegions,
  ensureFaceNetModels,
  extractDescriptorFromImage,
  loadImage,
  type FaceDetectionRegion,
  type FaceNetLiveDetection,
  type FaceRegionRecognitionResult,
} from '../lib/faceNetEngine';
import {
  assignFaceDetectionTracks,
  findDuplicateStudentClaimLosers,
  selectFaceDescriptorDetections,
  updateFaceTrackIdentity,
} from '../lib/faceTracking';
import { releaseFaceScan, tryAcquireFaceScan } from '../lib/faceScanLock';

export type { RecognitionStatusInput } from '../lib/recognitionStatus';
export { computeCosineSimilarity, computeCosineDistance } from '../lib/faceNetMatcher';

const SCAN_INTERVAL_MS = 200;
const SCAN_OVERRUN_COOLDOWN_MIN_MS = 100;
const MATCH_SWITCH_STABILITY_FRAMES = 5;
const MAX_DESCRIPTORS_PER_SCAN = 3;
const CONFIRMED_REVERIFY_INTERVAL_MS = 1000;

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
    source?: 'aligned' | 'crop' | 'full_frame_fallback';
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
}

type LiveFaceBoxesRef = Readonly<{ current: readonly FaceDetectionRegion[] }>;

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
  detectedFaceBoxesRef?: LiveFaceBoxesRef
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

  const galleryRef = useRef<LabeledDescriptors[]>([]);
  const faceTracksRef = useRef<FaceRecognitionTrack[]>([]);
  const nextFaceTrackIdRef = useRef(1);
  const descriptorRotationCursorRef = useRef(0);
  const processingRef = useRef(false);
  const lastMatchResultRef = useRef<{ reason: string; distance: number; secondDistance: number } | null>(null);
  const lastBoxRef = useRef<FaceRecognitionBox | null>(null);

  const isLiveRef = useRef(false);
  const studentsRef = useRef<any[]>([]);
  const lastConfirmedMatchRef = useRef<{ student: RecognizedStudent; timestamp: number } | null>(null);

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
    lastMatchResultRef.current = {
      reason: result.reason,
      distance: result.distance,
      secondDistance: result.secondDistance,
    };
    if (!result.accepted) return { student: null, result };
    const student = studentsRef.current.find((s: any) => s.id === result.label);
    if (!student) return { student: null, result };
    return { student: {
      id: student.id,
      name: student.name,
      studentNumber: student.studentNumber,
      confidence: result.confidence,
    }, result };
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
    let interval: ReturnType<typeof setTimeout> | null = null;
    let videoFrameHandle: number | null = null;

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
            const floats = student.faceDescriptors
              .map(deserializeFaceNetDescriptor)
              .filter((descriptor): descriptor is Float32Array => descriptor !== null);
            if (floats.length > 0) {
              return new faceapi.LabeledFaceDescriptors(student.id, floats);
            }
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
        const descriptorCount = labeledDescriptors.reduce(
          (total, entry) => total + entry.descriptors.length,
          0
        );
        const readyMsg = `Ready — FaceNet scanning ${labeledDescriptors.length} student(s), ${descriptorCount} descriptors, threshold ${FACENET_DISTANCE_THRESHOLD}`;
        setDiagnosticInfo(readyMsg);

        let scrfdSession: Awaited<ReturnType<typeof getScrfdSession>> | null = null;
        if (!detectedFaceBoxesRef) {
          try {
            scrfdSession = await getScrfdSession('/models/scrfd/scrfd_2.5g_bnkps.onnx');
          } catch (scrfdError) {
            console.warn('[FaceRecognition] SCRFD unavailable; using FaceNet detectors:', scrfdError);
          }
        }
        if (cancelled) return;
        let regionResultLogCount = 0;

        const scheduleScan = (delay: number) => {
          cancelScheduledScan();
          const startOnVideoFrame = () => {
            if (cancelled) return;
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
          const video = videoRef.current;
          if (
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

            if (detectedFaceBoxesRef) {
              regions = [...detectedFaceBoxesRef.current];
            } else if (scrfdSession) {
              try {
                const detectionStartedAt = performance.now();
                regions = await detectFacesWithScrfd(scrfdSession, video, 0.25, 0.4);
                detectorDurationMs = performance.now() - detectionStartedAt;
                regions = regions.map(({ x, y, width, height, score, landmarks }) => ({
                  x, y, width, height, score, landmarks,
                }));
              } catch (scrfdScanError) {
                console.warn('[FaceRecognition] SCRFD recognition scan failed; using FaceNet detectors:', scrfdScanError);
                regions = [];
              }
            }
            if (regions.length === 0 && !detectedFaceBoxesRef) {
              const fallbackDetectionStartedAt = performance.now();
              regions = await detectLiveFaceRegions(video);
              detectorDurationMs = (detectorDurationMs ?? 0) +
                performance.now() - fallbackDetectionStartedAt;
            }

            const timestamp = Date.now();
            let provisionalTracks: Array<FaceRecognitionTrack | undefined> = [];
            if (regions.length > 0) {
              const frameWidth = video.videoWidth || 640;
              const frameHeight = video.videoHeight || 480;
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
              const selection = selectFaceDescriptorDetections(
                provisionalTracks.map(track => ({
                  confirmed: Boolean(track?.confirmedStudent),
                  lastDescriptorAt: track?.lastDescriptorAt ?? 0,
                })),
                timestamp,
                descriptorRotationCursorRef.current,
                MAX_DESCRIPTORS_PER_SCAN,
                CONFIRMED_REVERIFY_INTERVAL_MS
              );
              descriptorRotationCursorRef.current = selection.nextRotationCursor;
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

              const selectedRegions = selection.indices.map(index => regions[index]!);
              const selectedResults = selectedRegions.length > 0
                ? await describeScrfdFaceRegions(video, selectedRegions)
                : [];
              const resultByIndex = new Map(
                selection.indices.map((index, selectedIndex) => [index, selectedResults[selectedIndex]!])
              );
              regionResults = regions.map((region, index) => resultByIndex.get(index) ?? {
                region,
                status: 'skipped',
                reason: 'descriptor_budget',
                durationMs: 0,
              });
            } else {
              setRecognizedFaces([]);
            }

            const attempts = regionResults;
            const frameWidth = video.videoWidth || 640;
            const frameHeight = video.videoHeight || 480;
            const nextTracks: FaceRecognitionTrack[] = [];
            const recognizedItems: RecognizedFaceItem[] = [];
            const decisions = attempts.map(attempt =>
              attempt.status === 'descriptor'
                ? resolveMatch(attempt.detection.descriptor)
                : null
            );
            const matches = decisions.map(decision => decision?.student ?? null);
            const trackAssignments = assignFaceDetectionTracks(
              attempts.map(attempt => attempt.status === 'descriptor' ? attempt.detection.box : attempt.region),
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
              const bounds = detection?.box ?? attempt.region;
              const box: FaceRecognitionBox = {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                videoWidth: frameWidth,
                videoHeight: frameHeight,
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
              track.lastSeenAt = timestamp;
              track.missedFrames = 0;
              if (attempt.status !== 'skipped') track.lastDescriptorAt = timestamp;
              if (match && decisions[detectionIndex]) {
                track.lastMatchDistance = decisions[detectionIndex]!.result.distance;
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
              const identity = updateFaceTrackIdentity(
                {
                  candidateStudentId: track.candidateStudentId,
                  stabilityCount: track.stabilityCount,
                  confirmedStudentId: track.confirmedStudent?.id ?? null,
                  pendingSwitch: track.pendingSwitch,
                },
                match?.id ?? null,
                attempt.status === 'descriptor',
                sameStudentVerified,
                STABILITY_FRAMES_REQUIRED,
                MATCH_SWITCH_STABILITY_FRAMES
              );
              track.candidateStudentId = identity.candidateStudentId;
              track.stabilityCount = identity.stabilityCount;
              track.pendingSwitch = identity.pendingSwitch;
              if (!identity.confirmedStudentId) {
                track.confirmedStudent = null;
              } else if (
                match?.id === identity.confirmedStudentId &&
                (!sameConfirmedStudent || sameStudentVerified)
              ) {
                track.confirmedStudent = match;
              }

              nextTracks.push(track);
              const decision = decisions[detectionIndex];
              const status: RecognizedFaceItem['status'] =
                attempt.status === 'failed'
                  ? 'processing_failed'
                  : attempt.status === 'quality_rejected'
                    ? 'quality_rejected'
                    : track.confirmedStudent
                      ? 'recognized'
                    : match || track.candidateStudentId
                        ? 'scanning'
                        : 'unknown';
              itemTracks.push(track);
              recognizedItems.push({
                id: track.id,
                student: status === 'recognized' ? track.confirmedStudent : null,
                box,
                isLive: true,
                isMatching: status === 'scanning' && Boolean(track.candidateStudentId),
                status,
                diagnostic: {
                  reason: attempt.status === 'descriptor'
                    ? undefined
                    : attempt.reason,
                  matchReason: decision?.result.reason,
                  distance: decision?.result.distance,
                  cropDurationMs: attempt.durationMs,
                  source: attempt.status === 'descriptor' ? attempt.source : undefined,
                },
                score: detection?.score,
              });
            }

            const duplicateLosers = findDuplicateStudentClaimLosers(
              recognizedItems.map((item, index) => ({
                studentId: item.student?.id ?? null,
                distance: item.diagnostic.distance ?? itemTracks[index]!.lastMatchDistance,
              }))
            );
            for (const index of duplicateLosers) {
              const track = itemTracks[index]!;
              track.confirmedStudent = null;
              track.candidateStudentId = '';
              track.stabilityCount = 0;
              track.pendingSwitch = false;
              track.lastMatchDistance = Number.POSITIVE_INFINITY;
              recognizedItems[index]!.student = null;
              recognizedItems[index]!.status = 'unknown';
              recognizedItems[index]!.isMatching = false;
              recognizedItems[index]!.diagnostic.reason = 'duplicate_student_claim';
            }

            faceTracksRef.current.forEach((track, trackIndex) => {
              if (usedTracks.has(trackIndex)) return;
              track.missedFrames++;
              if (track.missedFrames <= 2) nextTracks.push(track);
            });
            faceTracksRef.current = nextTracks;
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
            const primaryStudent = recognizedItems
              .find(item => item.student !== null)?.student ?? null;

            setRecognizedFaces(recognizedItems);
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
                console.info('[FaceRecognition] Region results', scanDiagnostics);
              } else {
                console.debug('[FaceRecognition] Scan diagnostics', scanDiagnostics);
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
            if (!cancelled) {
              const elapsed = performance.now() - scanStartedAt;
              const delay = elapsed > SCAN_INTERVAL_MS
                ? scanOverrunCooldownMs(elapsed)
                : Math.max(0, SCAN_INTERVAL_MS - elapsed);
              scheduleScan(delay);
            }
          }
        };
        scheduleScan(SCAN_INTERVAL_MS);
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
      cancelScheduledScan();
      galleryRef.current = [];
      faceTracksRef.current = [];
      processingRef.current = false;
      isLiveRef.current = false;
      lastMatchResultRef.current = null;
      lastConfirmedMatchRef.current = null;
      lastBoxRef.current = null;
    };
  }, [active, applyDetectionOverlay, resolveMatch, videoRef, detectedFaceBoxesRef]);

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
  };
}
