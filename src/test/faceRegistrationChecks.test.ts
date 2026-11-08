import { describe, expect, it } from 'vitest';
import {
  checkRegistrationPose,
  estimateScrfdPose,
  getMinimumPoseDescriptorDistance,
  imageQualityGuidance,
  measureImageQuality,
  REGISTRATION_MIN_BRIGHTNESS,
  REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE,
} from '@/features/faceRegistration/lib/registrationChecks';

const face = (noseX: number) => ({
  x: 80,
  y: 60,
  width: 200,
  height: 200,
  score: 0.9,
  landmarks: [[100, 100], [200, 100], [noseX, 140], [120, 180], [180, 180]] as [number, number][],
});

describe('registration pose checks', () => {
  it('rejects a frontal face for the left capture', () => {
    const result = checkRegistrationPose('left', face(150));

    expect(result.accepted).toBe(false);
    expect(result.guidance).toBe('Turn slightly left.');
    expect(result.pose?.yawDeg).toBeCloseTo(0);
  });

  it('accepts a measured left turn within the configured range', () => {
    const result = checkRegistrationPose('left', face(165));

    expect(result.accepted).toBe(true);
    expect(result.pose?.yawDeg).toBeGreaterThanOrEqual(15);
    expect(result.pose?.yawDeg).toBeLessThanOrEqual(35);
  });

  it('estimates roll from the SCRFD eye line', () => {
    const pose = estimateScrfdPose([
      [100, 100],
      [200, 110],
      [150, 140],
      [120, 180],
      [180, 180],
    ]);

    expect(pose?.rollDeg).toBeCloseTo(Math.atan2(10, 100) * (180 / Math.PI));
  });

  it('flags pose descriptors that are nearly identical', () => {
    const minimumDistance = getMinimumPoseDescriptorDistance([
      [0, 0],
      [0.03, 0],
      [0.2, 0],
    ]);

    expect(REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE).toBe(0.08);
    expect(minimumDistance).toBeLessThanOrEqual(REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE);
  });

  it('warns when measured mean brightness is below the capture minimum', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20;
      data[i + 1] = 20;
      data[i + 2] = 20;
      data[i + 3] = 255;
    }

    const quality = measureImageQuality({ data, width: 4, height: 4 } as ImageData);

    expect(REGISTRATION_MIN_BRIGHTNESS).toBe(45);
    expect(quality.meanBrightness).toBe(20);
    expect(imageQualityGuidance(quality)).toContain('Too dark');
  });

  it('measures sharpness from grayscale neighborhood variation', () => {
    const data = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const value = (x + y) % 2 ? 220 : 40;
        const offset = (y * 8 + x) * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }

    expect(measureImageQuality({ data, width: 8, height: 8 } as ImageData).sharpness).toBeGreaterThan(50);
  });
});
