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
  deserializeFaceDescriptor,
  type LabeledDescriptors,
} from '../lib/faceNetMatcher';
import {
  detectAccurateFace,
  detectAllLiveFaces,
  describeScrfdFaceRegions,
  ensureFaceNetModels,
  extractDescriptorFromImage,
  loadImage,
  type FaceDetectionRegion,
  type FaceNetLiveDetection,
} from '../lib/faceNetEngine';
import { assignFaceDetectionTracks } from '../lib/faceTracking';

export type { RecognitionStatusInput } from '../lib/recognitionStatus';
export { computeCosineSimilarity, computeCosineDistance } from '../lib/faceNetMatcher';

const SCAN_INTERVAL_MS = 200;
const MATCH_SWITCH_STABILITY_FRAMES = 5;

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
  score?: number;
}

interface FaceRecognitionTrack {
  id: string;
  box: FaceRecognitionBox;
  velocityX: number;
  velocityY: number;
  lastSeenAt: number;
  missedFrames: number;
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
  const processingRef = useRef(false);
  const lastMatchResultRef = useRef<{ reason: string; distance: number } | null>(null);
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

  const resolveMatch = useCallback((descriptor: Float32Array): RecognizedStudent | null => {
    const result = scoreFaceNetMatch(descriptor, galleryRef.current);
    lastMatchResultRef.current = { reason: result.reason, distance: result.distance };
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
              .map(deserializeFaceDescriptor)
              .filter((descriptor): descriptor is Float32Array => descriptor !== null);
            if (floats.length === 0) return null;
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

        let scrfdSession: Awaited<ReturnType<typeof getScrfdSession>> | null = null;
        if (!detectedFaceBoxesRef) {
          try {
            scrfdSession = await getScrfdSession('/models/scrfd/scrfd_2.5g_bnkps.onnx');
          } catch (scrfdError) {
            console.warn('[FaceRecognition] SCRFD unavailable; using FaceNet detectors:', scrfdError);
          }
        }
        if (cancelled) return;

        const scheduleScan = (delay: number) => {
          interval = setTimeout(() => {
            void scanFrame();
          }, delay);
        };
        const scanFrame = async () => {
          const scanStartedAt = performance.now();
          const video = videoRef.current;
          if (
            !video ||
            galleryRef.current.length === 0 ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            processingRef.current
          ) {
            if (!cancelled) scheduleScan(SCAN_INTERVAL_MS);
            return;
          }

          processingRef.current = true;
          try {
            let detections: FaceNetLiveDetection[] = [];
            if (detectedFaceBoxesRef) {
              const regions = detectedFaceBoxesRef.current;
              if (regions.length > 0) {
                detections = await describeScrfdFaceRegions(video, [...regions]);
              }
            } else if (scrfdSession) {
              try {
                const regions = await detectFacesWithScrfd(scrfdSession, video, 0.25, 0.4);
                detections = await describeScrfdFaceRegions(video, regions);
                if (detections.length < regions.length) {
                  const supplementalDetections = await detectAllLiveFaces(video);
                  for (const candidate of supplementalDetections) {
                    const candidateCenterX = candidate.box.x + candidate.box.width / 2;
                    const candidateCenterY = candidate.box.y + candidate.box.height / 2;
                    const alreadyIncluded = detections.some(existing => {
                      const existingCenterX = existing.box.x + existing.box.width / 2;
                      const existingCenterY = existing.box.y + existing.box.height / 2;
                      return Math.hypot(candidateCenterX - existingCenterX, candidateCenterY - existingCenterY) <
                        Math.min(candidate.box.width, candidate.box.height) * 0.4;
                    });
                    if (!alreadyIncluded) detections.push(candidate);
                  }
                }
              } catch (scrfdScanError) {
                console.warn('[FaceRecognition] SCRFD recognition scan failed; using FaceNet detectors:', scrfdScanError);
                detections = await detectAllLiveFaces(video);
              }
            } else {
              detections = await detectAllLiveFaces(video);
            }
            if (detections.length === 0) {
              faceTracksRef.current = [];
              setRecognizedFaces([]);
              setMatchedStudents([]);
              setMatchedStudent(null);
              setRecognitionBox(null);
              setLandmarks(null);
              setIsLive(false);
              setIsAnalyzing(false);
              setNativeIOD(0);
              setQualityGuidance(null);
              setQualityPassed(false);
              lastBoxRef.current = null;
              return;
            }

            const frameWidth = video.videoWidth || 640;
            const frameHeight = video.videoHeight || 480;
            const nextTracks: FaceRecognitionTrack[] = [];
            const recognizedItems: RecognizedFaceItem[] = [];
            const timestamp = Date.now();
            const matches = detections.map(detection => resolveMatch(detection.descriptor));
            const trackAssignments = assignFaceDetectionTracks(
              detections.map(detection => detection.box),
              faceTracksRef.current.map(track => ({
                ...track,
                studentId: track.confirmedStudent?.id ?? null,
              })),
              matches.map(match => match?.id ?? null),
              timestamp
            );
            const usedTracks = new Set<number>();

            for (let detectionIndex = 0; detectionIndex < detections.length; detectionIndex++) {
              const detection = detections[detectionIndex]!;
              const match = matches[detectionIndex] ?? null;
              const bounds = detection.box;
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

              if (match && track.confirmedStudent?.id === match.id) {
                const enrolledFace = galleryRef.current.find(entry => entry.label === match.id);
                if (enrolledFace && isSameEnrolledPerson(detection.descriptor, enrolledFace.descriptors)) {
                  track.candidateStudentId = match.id;
                  track.stabilityCount = STABILITY_FRAMES_REQUIRED;
                  track.confirmedStudent = match;
                  track.pendingSwitch = false;
                }
              } else if (match) {
                const changingIdentity = track.pendingSwitch ||
                  Boolean(track.confirmedStudent && track.confirmedStudent.id !== match.id);
                track.stabilityCount = track.candidateStudentId === match.id
                  ? track.stabilityCount + 1
                  : 1;
                track.candidateStudentId = match.id;
                const requiredFrames = changingIdentity
                  ? MATCH_SWITCH_STABILITY_FRAMES
                  : STABILITY_FRAMES_REQUIRED;
                if (track.stabilityCount >= requiredFrames) {
                  track.confirmedStudent = match;
                  track.pendingSwitch = false;
                } else if (track.confirmedStudent?.id !== match.id) {
                  track.confirmedStudent = null;
                  track.pendingSwitch = changingIdentity;
                }
              } else {
                track.candidateStudentId = '';
                track.stabilityCount = 0;
                track.confirmedStudent = null;
                track.pendingSwitch = false;
              }

              nextTracks.push(track);
              recognizedItems.push({
                id: track.id,
                student: track.confirmedStudent,
                box,
                isLive: true,
                isMatching: !track.confirmedStudent && Boolean(track.candidateStudentId),
                score: detection.score,
              });
            }

            faceTracksRef.current.forEach((track, trackIndex) => {
              if (usedTracks.has(trackIndex)) return;
              track.missedFrames++;
              if (track.missedFrames <= 2) nextTracks.push(track);
            });
            faceTracksRef.current = nextTracks;
            const primaryDetection = detections.reduce((largest, current) =>
              current.box.width * current.box.height >
                largest.box.width * largest.box.height
                ? current
                : largest
            );
            applyDetectionOverlay(primaryDetection, video);
            const primaryLandmarks = primaryDetection.landmarks;
            setNativeIOD(Math.round(Math.hypot(
              primaryLandmarks[45]!.x - primaryLandmarks[36]!.x,
              primaryLandmarks[45]!.y - primaryLandmarks[36]!.y
            )));
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
                ? `Recognized ${uniqueStudents.length} of ${detections.length} detected face(s).`
                : `Detected ${detections.length} face(s); identifying...`
            );
            setDiagnosticInfo(
              `Detected ${detections.length} face(s); recognized ${uniqueStudents.length}.`
            );
            setIsLive(uniqueStudents.length > 0);
            isLiveRef.current = uniqueStudents.length > 0;
            setIsAnalyzing(recognizedItems.some(item => item.isMatching));
          } catch (scanError) {
            setIsAnalyzing(false);
            console.warn('[FaceRecognition] Live scan failed:', scanError);
          } finally {
            processingRef.current = false;
            if (!cancelled) {
              const delay = Math.max(0, SCAN_INTERVAL_MS - (performance.now() - scanStartedAt));
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
      if (interval) clearTimeout(interval);
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
