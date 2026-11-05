export type FaceYawBucket = 'frontal <10' | '10-20' | '20-30' | '>30' | 'unknown';

export interface ScrfdPoseEstimate {
  yawDeg: number | null;
  rollDeg: number | null;
}

export function estimateScrfdPose(
  landmarks?: readonly [number, number][]
): ScrfdPoseEstimate {
  if (!landmarks || landmarks.length < 3) return { yawDeg: null, rollDeg: null };
  const leftEye = landmarks[0];
  const rightEye = landmarks[1];
  const nose = landmarks[2];
  if (!leftEye || !rightEye || !nose) return { yawDeg: null, rollDeg: null };

  const eyeSpan = Math.hypot(rightEye[0] - leftEye[0], rightEye[1] - leftEye[1]);
  if (eyeSpan < 1) return { yawDeg: null, rollDeg: null };

  const eyeMidpointX = (leftEye[0] + rightEye[0]) / 2;
  const yawDeg = Math.atan2(2 * (nose[0] - eyeMidpointX), eyeSpan) * 180 / Math.PI;
  const rollDeg = Math.atan2(rightEye[1] - leftEye[1], rightEye[0] - leftEye[0]) * 180 / Math.PI;
  return { yawDeg, rollDeg };
}

export function getFaceYawBucket(yawDeg: number | null): FaceYawBucket {
  if (yawDeg === null || !Number.isFinite(yawDeg)) return 'unknown';
  const yaw = Math.abs(yawDeg);
  if (yaw < 10) return 'frontal <10';
  if (yaw < 20) return '10-20';
  if (yaw < 30) return '20-30';
  return '>30';
}

export function getMedianAndP90(values: readonly number[]): { median: number | null; p90: number | null } {
  if (values.length === 0) return { median: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {
    median,
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1]!,
  };
}
