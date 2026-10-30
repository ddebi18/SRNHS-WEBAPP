export interface VideoFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
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
