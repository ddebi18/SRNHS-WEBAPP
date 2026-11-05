export interface VideoFaceBox {
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

type FaceDetectionBox = Pick<VideoFaceBox, 'x' | 'y' | 'width' | 'height'> &
  Partial<Pick<VideoFaceBox, 'videoWidth' | 'videoHeight' | 'frameCapturedAt'>>;

export function getFreshFaceBoxPairs<T extends VideoFaceBox>(
  boxes: readonly T[],
  detections: readonly FaceDetectionBox[],
  now: number,
  maxAgeMs = 400
): Array<{ boxIndex: number; detectionIndex: number }> {
  const pairs = boxes.flatMap((box, boxIndex) => {
    return detections.flatMap((detection, detectionIndex) => {
      const ageMs = detection.frameCapturedAt ?? box.frameCapturedAt;
      if (ageMs === undefined || now - ageMs > maxAgeMs || now - ageMs < 0) return [];
      const { box: visibleBox } = clampVideoFaceBox(box);
      const { box: visibleDetection } = clampVideoFaceBox({
        ...detection,
        videoWidth: detection.videoWidth ?? box.videoWidth,
        videoHeight: detection.videoHeight ?? box.videoHeight,
      });
      const { iou } = faceBoxOverlap(visibleBox, visibleDetection);
      return iou > 0 ? [{ boxIndex, detectionIndex, iou }] : [];
    });
  }).sort((a, b) => b.iou - a.iou);
  const pairedBoxes = new Set<number>();
  const pairedDetections = new Set<number>();
  const selectedPairs: Array<{ boxIndex: number; detectionIndex: number }> = [];
  for (const pair of pairs) {
    if (pairedBoxes.has(pair.boxIndex) || pairedDetections.has(pair.detectionIndex)) continue;
    pairedBoxes.add(pair.boxIndex);
    pairedDetections.add(pair.detectionIndex);
    selectedPairs.push({ boxIndex: pair.boxIndex, detectionIndex: pair.detectionIndex });
  }
  return selectedPairs.sort((a, b) => a.boxIndex - b.boxIndex);
}

export function getFreshFaceBoxIndices<T extends VideoFaceBox>(
  boxes: readonly T[],
  detections: readonly FaceDetectionBox[],
  now: number,
  maxAgeMs = 400
): number[] {
  return getFreshFaceBoxPairs(boxes, detections, now, maxAgeMs)
    .map(pair => pair.boxIndex);
}

export interface OverlayViewport {
  width: number;
  height: number;
}

export interface OverlayBoxStyle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clampVideoFaceBox<T extends VideoFaceBox>(box: T): {
  box: T;
  clipped: boolean;
} {
  const left = Math.min(box.videoWidth, Math.max(0, box.x));
  const top = Math.min(box.videoHeight, Math.max(0, box.y));
  const right = Math.min(box.videoWidth, box.x + box.width);
  const bottom = Math.min(box.videoHeight, box.y + box.height);
  return {
    box: {
      ...box,
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    },
    clipped: left !== box.x || top !== box.y ||
      right !== box.x + box.width || bottom !== box.y + box.height,
  };
}

export function getRecognitionOverlayLabel(
  status: 'recognized' | 'unknown' | 'scanning' | 'quality_rejected' | 'processing_failed',
  options: { studentName?: string; edgeClipped?: boolean; reason?: string } = {}
): string {
  if (status === 'recognized' && options.studentName) return options.studentName;
  if (status === 'unknown') return 'Unknown Face';
  if (options.edgeClipped || options.reason === 'below_minimum_face_size') return 'Move into view';
  if (status === 'scanning') return 'Scanning';
  return 'Hold still / face the camera';
}

export interface FaceBoxOverlayCheck {
  index: number;
  reasons: Array<'stale' | 'no_latest_detection_overlap' | 'below_minimum_size' | 'edge_clipped'>;
  visible: boolean;
}

export function inspectFaceBoxOverlays<T extends VideoFaceBox>(
  boxes: readonly T[],
  detections: readonly FaceDetectionBox[],
  now: number,
  maxAgeMs = 400,
  minFaceSize = 60
): FaceBoxOverlayCheck[] {
  const freshPairs = getFreshFaceBoxPairs(boxes, detections, now, maxAgeMs);
  const freshDetectionByBox = new Map(
    freshPairs.map(({ boxIndex, detectionIndex }) => [boxIndex, detections[detectionIndex]])
  );
  return boxes.map((box, index) => {
    const reasons: FaceBoxOverlayCheck['reasons'] = [];
    const displayedDetection = freshDetectionByBox.get(index);
    const capturedAt = displayedDetection?.frameCapturedAt ?? box.frameCapturedAt;
    const boxAgeMs = capturedAt === undefined ? Number.POSITIVE_INFINITY : now - capturedAt;
    const { clipped } = clampVideoFaceBox(box);
    if (boxAgeMs > maxAgeMs || boxAgeMs < 0) reasons.push('stale');
    if (!displayedDetection) reasons.push('no_latest_detection_overlap');
    if (Math.min(box.width, box.height) < minFaceSize) reasons.push('below_minimum_size');
    if (clipped) reasons.push('edge_clipped');
    return {
      index,
      reasons,
      visible: reasons.includes('stale') || reasons.includes('no_latest_detection_overlap')
        ? false
        : true,
    };
  });
}

export function faceBoxOverlap(
  a: Pick<VideoFaceBox, 'x' | 'y' | 'width' | 'height'>,
  b: Pick<VideoFaceBox, 'x' | 'y' | 'width' | 'height'>
): { iou: number; centerDistance: number } {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return {
    iou: union > 0 ? intersection / union : 0,
    centerDistance: Math.hypot(
      a.x + a.width / 2 - b.x - b.width / 2,
      a.y + a.height / 2 - b.y - b.height / 2
    ),
  };
}

export function getUnpairedFaceBoxIndices(
  detections: Array<Pick<VideoFaceBox, 'x' | 'y' | 'width' | 'height'>>,
  tracks: Array<Pick<VideoFaceBox, 'x' | 'y' | 'width' | 'height'>>
): number[] {
  const pairs = detections.flatMap((detection, detectionIndex) =>
    tracks.flatMap((track, trackIndex) => {
      const { iou, centerDistance } = faceBoxOverlap(detection, track);
      const maxCenterDistance = Math.max(
        40,
        Math.min(detection.width, detection.height, track.width, track.height) * 0.75
      );
      return iou > 0.3 || centerDistance <= maxCenterDistance
        ? [{ detectionIndex, trackIndex, iou, centerDistance }]
        : [];
    })
  ).sort((a, b) => b.iou - a.iou || a.centerDistance - b.centerDistance);
  const pairedDetections = new Set<number>();
  const pairedTracks = new Set<number>();
  for (const pair of pairs) {
    if (pairedDetections.has(pair.detectionIndex) || pairedTracks.has(pair.trackIndex)) continue;
    pairedDetections.add(pair.detectionIndex);
    pairedTracks.add(pair.trackIndex);
  }
  return detections.flatMap((_, index) => pairedDetections.has(index) ? [] : [index]);
}

export function mapVideoFaceBoxToViewport(
  box: VideoFaceBox,
  viewport: OverlayViewport,
  fit: 'cover' | 'contain',
  mirrorHorizontal = false
): OverlayBoxStyle | null {
  if (
    box.videoWidth <= 0 ||
    box.videoHeight <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return null;
  }

  const scaleX = viewport.width / box.videoWidth;
  const scaleY = viewport.height / box.videoHeight;
  const scale = fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const renderedWidth = box.videoWidth * scale;
  const renderedHeight = box.videoHeight * scale;
  const offsetX = (viewport.width - renderedWidth) / 2;
  const offsetY = (viewport.height - renderedHeight) / 2;

  const left = ((box.x * scale + offsetX) / viewport.width) * 100;
  const width = ((box.width * scale) / viewport.width) * 100;

  return {
    left: mirrorHorizontal ? 100 - left - width : left,
    top: ((box.y * scale + offsetY) / viewport.height) * 100,
    width,
    height: ((box.height * scale) / viewport.height) * 100,
  };
}
