/**
 * FaceNet 128D matching helpers.
 * face-api FaceMatcher uses Euclidean distance on L2-normalized embeddings.
 * Same-person webcam captures are typically 0.20–0.55; different people sit near 0.6+.
 */

export const FACENET_DISTANCE_THRESHOLD = 0.55;
export const FACENET_AMBIGUITY_MARGIN = 0.08;
export const FACENET_DUPLICATE_DISTANCE = 0.42;
export const MIN_FACE_SIZE_PX = 70;
export const MIN_LIVE_DETECTION_SCORE = 0.32;
export const MIN_REGISTER_DETECTION_SCORE = 0.38;
export const MIN_PHOTO_DETECTION_SCORE = 0.28;
export const STABILITY_FRAMES_REQUIRED = 2;
export const FACE_DESCRIPTOR_VERSION = 2;
export const MIN_ATTENDANCE_LOG_CONFIDENCE = 0.45;

export interface LabeledDescriptors {
  label: string;
  descriptors: Array<Float32Array | number[]>;
}

export interface FaceNetMatchResult {
  label: string;
  distance: number;
  secondDistance: number;
  confidence: number;
  accepted: boolean;
  reason: string;
}

export function euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function computeCosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator < 1e-8) return 0;
  return Math.max(-1, Math.min(1, dotProduct / denominator));
}

export function computeCosineDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  return 1 - computeCosineSimilarity(a, b);
}

export function computeMatchConfidence(distance: number): number {
  return Math.max(0, Math.min(1, Math.round((1 - distance) * 100) / 100));
}

export function minDistanceToLabel(
  query: Float32Array | number[],
  descriptors: Array<Float32Array | number[]>
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const descriptor of descriptors) {
    const distance = euclideanDistance(query, descriptor);
    if (distance < best) best = distance;
  }
  return best;
}

export function scoreFaceNetMatch(
  query: Float32Array | number[],
  gallery: LabeledDescriptors[],
  threshold = FACENET_DISTANCE_THRESHOLD,
  margin = FACENET_AMBIGUITY_MARGIN
): FaceNetMatchResult {
  const ranked = gallery
    .map(entry => ({
      label: entry.label,
      distance: minDistanceToLabel(query, entry.descriptors),
    }))
    .filter(entry => Number.isFinite(entry.distance))
    .sort((a, b) => a.distance - b.distance);

  const best = ranked[0];
  const second = ranked[1];
  const secondDistance = second?.distance ?? Number.POSITIVE_INFINITY;

  if (!best) {
    return {
      label: 'unknown',
      distance: Number.POSITIVE_INFINITY,
      secondDistance,
      confidence: 0,
      accepted: false,
      reason: 'empty_gallery',
    };
  }

  if (best.distance > threshold) {
    return {
      label: 'unknown',
      distance: best.distance,
      secondDistance,
      confidence: computeMatchConfidence(best.distance),
      accepted: false,
      reason: 'below_threshold',
    };
  }

  const secondIsAlsoAMatch = Number.isFinite(secondDistance) && secondDistance <= threshold;
  if (secondIsAlsoAMatch && secondDistance - best.distance < margin) {
    return {
      label: 'unknown',
      distance: best.distance,
      secondDistance,
      confidence: computeMatchConfidence(best.distance),
      accepted: false,
      reason: 'ambiguous',
    };
  }

  return {
    label: best.label,
    distance: best.distance,
    secondDistance,
    confidence: computeMatchConfidence(best.distance),
    accepted: true,
    reason: 'matched',
  };
}

export function findDuplicateStudentId(
  query: Float32Array | number[],
  gallery: LabeledDescriptors[],
  excludeLabel?: string,
  duplicateDistance = FACENET_DUPLICATE_DISTANCE
): string | null {
  let bestLabel: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of gallery) {
    if (excludeLabel && entry.label === excludeLabel) continue;
    const distance = minDistanceToLabel(query, entry.descriptors);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLabel = entry.label;
    }
  }

  if (bestLabel && bestDistance <= duplicateDistance) return bestLabel;
  return null;
}

export function isFaceBoxUsable(
  width: number,
  height: number,
  score?: number,
  minScore = MIN_LIVE_DETECTION_SCORE
): boolean {
  if (width < MIN_FACE_SIZE_PX || height < MIN_FACE_SIZE_PX) return false;
  if (typeof score === 'number' && score < minScore) return false;
  return true;
}
