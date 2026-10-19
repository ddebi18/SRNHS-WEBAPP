import { describe, expect, it } from 'vitest';
import type {
  FaceNetLiveDetection,
  FaceRegionRecognitionResult,
} from '@/features/attendance/lib/faceNetEngine';
import { mergeFaceRecognitionFallback } from '@/features/attendance/lib/faceRecognitionFallback';

function liveFace(x: number): FaceNetLiveDetection {
  return {
    box: { x, y: 20, width: 60, height: 60 },
    landmarks: [],
    descriptor: new Float32Array(128).fill(x),
    score: 0.9,
  };
}

describe('multi-face recognition fallback', () => {
  it('recovers only failed faces and preserves successful, unknown, and quality-rejected outcomes', () => {
    const cropResults: FaceRegionRecognitionResult[] = [
      {
        region: { x: 0, y: 20, width: 60, height: 60 },
        status: 'descriptor',
        detection: liveFace(0),
        durationMs: 10,
        source: 'crop',
      },
      {
        region: { x: 100, y: 20, width: 60, height: 60 },
        status: 'failed',
        reason: 'inference error',
        durationMs: 11,
      },
      {
        region: { x: 200, y: 20, width: 60, height: 60 },
        status: 'quality_rejected',
        reason: 'below_minimum_face_size',
        durationMs: 12,
      },
      {
        region: { x: 300, y: 20, width: 60, height: 60 },
        status: 'failed',
        reason: 'no_face_in_crop',
        durationMs: 13,
      },
    ];

    const merged = mergeFaceRecognitionFallback(
      cropResults,
      [liveFace(100), liveFace(300)],
      35
    );

    expect(merged.map(result => result.status)).toEqual([
      'descriptor',
      'descriptor',
      'quality_rejected',
      'descriptor',
    ]);
    expect(merged[0]).toEqual(cropResults[0]);
    expect(merged[1]?.status === 'descriptor' && merged[1].source).toBe('full_frame_fallback');
    expect(merged[1]?.status === 'descriptor' && merged[1].fallbackDurationMs).toBe(35);
    expect(merged[2]).toEqual(cropResults[2]);
    expect(merged[3]?.status === 'descriptor' && merged[3].source).toBe('full_frame_fallback');
  });

  it('does not associate one fallback face ambiguously with two nearby failures', () => {
    const cropResults: FaceRegionRecognitionResult[] = [90, 110].map(x => ({
      region: { x, y: 20, width: 60, height: 60 },
      status: 'failed',
      reason: 'no_face_in_crop',
      durationMs: 5,
    }));

    const merged = mergeFaceRecognitionFallback(cropResults, [liveFace(100)], 20);

    expect(merged.map(result => result.status)).toEqual(['failed', 'failed']);
  });

  it('does not recover an unknown face because its descriptor was already processed', () => {
    const cropResults: FaceRegionRecognitionResult[] = [{
      region: { x: 100, y: 20, width: 60, height: 60 },
      status: 'descriptor',
      detection: liveFace(100),
      durationMs: 8,
      source: 'crop',
    }];

    const merged = mergeFaceRecognitionFallback(cropResults, [liveFace(100)], 20);

    expect(merged).toEqual(cropResults);
  });

  it('does not attach a processed quality-rejected face to a nearby failed crop', () => {
    const cropResults: FaceRegionRecognitionResult[] = [
      {
        region: { x: 100, y: 20, width: 60, height: 60 },
        status: 'quality_rejected',
        reason: 'below_minimum_face_size',
        durationMs: 8,
      },
      {
        region: { x: 130, y: 20, width: 60, height: 60 },
        status: 'failed',
        reason: 'no_face_in_crop',
        durationMs: 9,
      },
    ];

    const merged = mergeFaceRecognitionFallback(cropResults, [liveFace(100)], 20);

    expect(merged.map(result => result.status)).toEqual(['quality_rejected', 'failed']);
  });
});
