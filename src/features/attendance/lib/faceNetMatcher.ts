/**
 * FaceNet 128D matching helpers.
 * Standards aligned with TESDA BSRS (MegaMatcher Face Engine) recommendations:
 * - High-accuracy distance threshold (0.43 max Euclidean distance)
 * - Ambiguity margin (0.10) to prevent false name mismatches
 * - Stricter duplicate rejection and 3-frame stability requirement
 */

export {
  TESDA_MIN_IOD_PX,
  TESDA_RECOMMENDED_IOD_PX,
  TESDA_LIVENESS_MIN_IOD_PX,
  TESDA_LIVENESS_OPTIMAL_IOD_PX,
  TESDA_MAX_ROLL_DEG,
  TESDA_MAX_PITCH_DEG,
  TESDA_MAX_YAW_DEG,
  evaluateTesdaQuality,
  computeNativeIOD,
  computeHeadPose,
  type TesdaQualityResult,
  type TesdaQualityOptions,
} from './tesdaQualityEngine';

export const FACENET_DISTANCE_THRESHOLD = 0.43;
export const FACENET_AMBIGUITY_MARGIN = 0.10;
export const FACENET_DUPLICATE_DISTANCE = 0.38;
export const SAME_PERSON_RELOCK_THRESHOLD = 0.46;
export const MIN_FACE_SIZE_PX = 70;
export const MIN_LIVE_DETECTION_SCORE = 0.40;
export const MIN_REGISTER_DETECTION_SCORE = 0.45;
export const MIN_PHOTO_DETECTION_SCORE = 0.35;
export const STABILITY_FRAMES_REQUIRED = 3;
export const FACE_DESCRIPTOR_VERSION = 2;
export const MIN_ATTENDANCE_LOG_CONFIDENCE = 0.55;

export interface LabeledDescriptors {
  label: string;
  descriptors: Array<Float32Array | number[]>;
}

export function deserializeFaceDescriptor(value: unknown): Float32Array | null {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(raw) || raw.length === 0) return null;
  const numbers = raw.map(Number);
  if (numbers.some(value => !Number.isFinite(value))) return null;
  return new Float32Array(numbers);
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

export function isSameEnrolledPerson(
  query: Float32Array | number[],
  descriptors: Array<Float32Array | number[]>,
  threshold = SAME_PERSON_RELOCK_THRESHOLD
): boolean {
  return minDistanceToLabel(query, descriptors) <= threshold;
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

export function evaluateFacePartConsistency(
  landmarks: Array<{ x: number; y: number }> | Float32Array | number[] | null | undefined,
  box?: { x: number; y: number; width: number; height: number }
): boolean {
  if (!landmarks || landmarks.length < 68) return false;

  const getPoint = (index: number) => {
    const point = (landmarks as Array<{ x: number; y: number }>)[index];
    if (point && typeof point.x === 'number' && typeof point.y === 'number') return point;
    const arr = landmarks as Float32Array | number[];
    if (!arr || arr.length < index * 2 + 2) return null;
    return { x: arr[index * 2] ?? 0, y: arr[index * 2 + 1] ?? 0 };
  };

  const leftEye = [36, 37, 38, 39, 40, 41].map(getPoint).filter(Boolean) as Array<{ x: number; y: number }>;
  const rightEye = [42, 43, 44, 45, 46, 47].map(getPoint).filter(Boolean) as Array<{ x: number; y: number }>;
  const nose = [27, 28, 29, 30, 31, 32, 33, 34, 35].map(getPoint).filter(Boolean) as Array<{ x: number; y: number }>;
  const mouth = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67].map(getPoint).filter(Boolean) as Array<{ x: number; y: number }>;

  if (leftEye.length < 3 || rightEye.length < 3 || nose.length < 3 || mouth.length < 6) return false;

  const leftEyeCenter = leftEye.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  const rightEyeCenter = rightEye.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  const noseCenter = nose.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  const mouthCenter = mouth.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });

  const eyeDistance = Math.hypot(
    rightEyeCenter.x / rightEye.length - leftEyeCenter.x / leftEye.length,
    rightEyeCenter.y / rightEye.length - leftEyeCenter.y / leftEye.length
  );
  if (!(eyeDistance > 12 && eyeDistance < 260)) return false;

  const faceWidth = box ? box.width : eyeDistance * 2.2;
  const faceHeight = box ? box.height : Math.max(eyeDistance * 2.6, 110);
  if (faceWidth <= 0 || faceHeight <= 0) return false;

  const eyeMidX = (leftEyeCenter.x / leftEye.length + rightEyeCenter.x / rightEye.length) / 2;
  const eyeMidY = (leftEyeCenter.y / leftEye.length + rightEyeCenter.y / rightEye.length) / 2;
  const noseX = noseCenter.x / nose.length;
  const noseY = noseCenter.y / nose.length;
  const mouthX = mouthCenter.x / mouth.length;
  const mouthY = mouthCenter.y / mouth.length;

  const horizontalShift = Math.abs(noseX - eyeMidX) + Math.abs(mouthX - eyeMidX);
  const verticalGap = Math.abs(noseY - eyeMidY) + Math.abs(mouthY - noseY);

  if (horizontalShift > eyeDistance * 0.75) return false;
  if (verticalGap < 12 || verticalGap > faceHeight * 0.9) return false;

  if (box) {
    const insideBox =
      leftEyeCenter.x / leftEye.length >= box.x &&
      rightEyeCenter.x / rightEye.length <= box.x + box.width &&
      noseCenter.x / nose.length >= box.x &&
      mouthCenter.x / mouth.length <= box.x + box.width &&
      eyeMidY >= box.y &&
      mouthCenter.y / mouth.length <= box.y + box.height;
    if (!insideBox) return false;
  }

  return true;
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
