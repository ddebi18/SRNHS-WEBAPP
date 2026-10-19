import type {
  FaceDetectionRegion,
  FaceNetLiveDetection,
  FaceRegionRecognitionResult,
} from './faceNetEngine';

function center(box: FaceDetectionRegion) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function mergeFaceRecognitionFallback(
  cropResults: FaceRegionRecognitionResult[],
  fallbackDetections: FaceNetLiveDetection[],
  fallbackDurationMs: number
): FaceRegionRecognitionResult[] {
  const eligibleResults = cropResults
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.status === 'failed');
  const candidates: Array<{ detectionIndex: number; resultIndex: number; distance: number }> = [];

  fallbackDetections.forEach((detection, detectionIndex) => {
    const detectionCenter = center(detection.box);
    const belongsToProcessedRegion = cropResults.some(result => {
      if (result.status === 'failed') return false;
      const processedBox = result.status === 'descriptor' ? result.detection.box : result.region;
      const processedCenter = center(processedBox);
      return Math.hypot(
        detectionCenter.x - processedCenter.x,
        detectionCenter.y - processedCenter.y
      ) <= Math.max(24, Math.max(processedBox.width, processedBox.height) * 0.55);
    });
    if (belongsToProcessedRegion) return;

    const ranked = eligibleResults.map(({ result, index }) => ({
      index,
      distance: Math.hypot(
        detectionCenter.x - center(result.region).x,
        detectionCenter.y - center(result.region).y
      ),
      maxDistance: Math.max(24, Math.max(result.region.width, result.region.height) * 0.55),
    })).filter(candidate => candidate.distance <= candidate.maxDistance)
      .sort((a, b) => a.distance - b.distance);

    const closest = ranked[0];
    const secondClosest = ranked[1];
    if (!closest) return;
    if (
      secondClosest &&
      secondClosest.distance - closest.distance < Math.max(8, closest.maxDistance * 0.15)
    ) return;
    candidates.push({
      detectionIndex,
      resultIndex: closest.index,
      distance: closest.distance / closest.maxDistance,
    });
  });

  candidates.sort((a, b) => a.distance - b.distance);
  const assignedResults = new Set<number>();
  const assignedDetections = new Set<number>();
  const merged = [...cropResults];

  for (const candidate of candidates) {
    if (assignedResults.has(candidate.resultIndex) || assignedDetections.has(candidate.detectionIndex)) continue;
    const previous = merged[candidate.resultIndex];
    const detection = fallbackDetections[candidate.detectionIndex];
    if (!previous || !detection) continue;
    merged[candidate.resultIndex] = {
      region: previous.region,
      status: 'descriptor',
      detection,
      durationMs: previous.durationMs,
      source: 'full_frame_fallback',
      fallbackDurationMs,
    };
    assignedResults.add(candidate.resultIndex);
    assignedDetections.add(candidate.detectionIndex);
  }

  return merged;
}
