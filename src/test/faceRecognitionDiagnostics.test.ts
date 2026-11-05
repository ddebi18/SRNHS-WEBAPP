import { describe, expect, it } from 'vitest';
import {
  estimateScrfdPose,
  getFaceYawBucket,
  getMedianAndP90,
} from '@/features/attendance/lib/faceRecognitionDiagnostics';

describe('face recognition diagnostics', () => {
  it('estimates frontal yaw and eye-line roll from SCRFD keypoints', () => {
    expect(estimateScrfdPose([[10, 10], [30, 10], [20, 15]])).toEqual({
      yawDeg: 0,
      rollDeg: 0,
    });
    expect(estimateScrfdPose([[10, 10], [30, 14], [25, 16]]).rollDeg).toBeCloseTo(11.31, 1);
  });

  it('buckets absolute yaw and marks missing keypoints unknown', () => {
    expect(getFaceYawBucket(9.9)).toBe('frontal <10');
    expect(getFaceYawBucket(-10)).toBe('10-20');
    expect(getFaceYawBucket(20)).toBe('20-30');
    expect(getFaceYawBucket(-30)).toBe('>30');
    expect(getFaceYawBucket(null)).toBe('unknown');
  });

  it('summarizes median and nearest-rank p90 without mutating input', () => {
    const values = [5, 1, 4, 2, 3];
    expect(getMedianAndP90(values)).toEqual({ median: 3, p90: 5 });
    expect(values).toEqual([5, 1, 4, 2, 3]);
    expect(getMedianAndP90([])).toEqual({ median: null, p90: null });
  });
});
