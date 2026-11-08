import { describe, expect, it } from 'vitest';
import {
  getFaceDescriptorBudget,
  getFaceCropDetectorInputSize,
  getScrfdInputSize,
  getScanOverrunCooldownMs,
  isRecentFaceDetection,
  isMobileDevice,
} from '@/features/attendance/lib/faceOptimizationFlags';

describe('face optimization flags', () => {
  it('uses the mobile recognition budget only when mobile optimization is active', () => {
    expect(getFaceDescriptorBudget(false)).toBe(3);
    expect(getFaceDescriptorBudget(true)).toBe(2);
  });

  it('bounds scan overrun cooldowns between 100ms and 200ms', () => {
    expect(getScanOverrunCooldownMs(20)).toBe(100);
    expect(getScanOverrunCooldownMs(300)).toBe(150);
    expect(getScanOverrunCooldownMs(4400)).toBe(200);
  });

  it('keeps SCRFD at 640 unless a supported mobile test size is selected', () => {
    expect(getScrfdInputSize(false, '320')).toBe(640);
    expect(getScrfdInputSize(true)).toBe(640);
    expect(getScrfdInputSize(true, '480')).toBe(480);
    expect(getScrfdInputSize(true, '320')).toBe(320);
    expect(getScrfdInputSize(true, 'bad-value')).toBe(640);
  });

  it('keeps crop detector input at 416 by default and accepts only larger supported sizes', () => {
    expect(getFaceCropDetectorInputSize('')).toBe(416);
    expect(getFaceCropDetectorInputSize('512')).toBe(512);
    expect(getFaceCropDetectorInputSize('608')).toBe(608);
    expect(getFaceCropDetectorInputSize('384')).toBe(416);
    expect(getFaceCropDetectorInputSize('640')).toBe(416);
  });

  it('recognizes common mobile user agents and prefers user-agent metadata when available', () => {
    expect(isMobileDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', true)).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (iPhone)', false)).toBe(false);
  });

  it('only retries the lazy fallback shortly after a face was detected', () => {
    expect(isRecentFaceDetection(null, 1000)).toBe(false);
    expect(isRecentFaceDetection(500, 1000)).toBe(true);
    expect(isRecentFaceDetection(0, 1001)).toBe(false);
    expect(isRecentFaceDetection(1100, 1000)).toBe(false);
  });
});
