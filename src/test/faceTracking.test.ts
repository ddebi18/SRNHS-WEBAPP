import { describe, expect, it } from 'vitest';
import { mapVideoFaceBoxToViewport } from '@/lib/faceOverlayGeometry';
import { assignFaceDetectionTracks } from '@/features/attendance/lib/faceTracking';
import { releaseFaceScan, tryAcquireFaceScan } from '@/features/attendance/lib/faceScanLock';

describe('live face tracking', () => {
  it('assigns five simultaneous detections to unique tracks', () => {
    const tracks = Array.from({ length: 5 }, (_, index) => ({
      box: { x: index * 100, y: 40, width: 50, height: 50 },
      velocityX: 0,
      velocityY: 0,
      lastSeenAt: 1000,
      studentId: `student-${index}`,
    }));
    const detections = tracks.map(track => ({ ...track.box }));

    expect(
      assignFaceDetectionTracks(
        detections,
        tracks,
        tracks.map(track => track.studentId),
        1200
      )
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it('uses predicted motion and identity to keep fast crossing faces on their tracks', () => {
    const tracks = [
      {
        box: { x: 80, y: 40, width: 40, height: 40 },
        velocityX: 0.5,
        velocityY: 0,
        lastSeenAt: 1000,
        studentId: 'student-a',
      },
      {
        box: { x: 180, y: 40, width: 40, height: 40 },
        velocityX: -0.5,
        velocityY: 0,
        lastSeenAt: 1000,
        studentId: 'student-b',
      },
    ];
    const detections = [
      { x: 160, y: 40, width: 40, height: 40 },
      { x: 100, y: 40, width: 40, height: 40 },
    ];

    expect(
      assignFaceDetectionTracks(detections, tracks, ['student-a', 'student-b'], 1160)
    ).toEqual([0, 1]);
  });
});

describe('recognition scan serialization', () => {
  it('does not acquire a second scan while the previous scan is running', () => {
    const lock = { current: false };

    expect(tryAcquireFaceScan(lock)).toBe(true);
    expect(tryAcquireFaceScan(lock)).toBe(false);
    releaseFaceScan(lock);
    expect(tryAcquireFaceScan(lock)).toBe(true);
  });
});

describe('face overlay geometry', () => {
  it('compensates for cropping when the video uses object-cover', () => {
    expect(
      mapVideoFaceBoxToViewport(
        { x: 40, y: 60, width: 100, height: 100, videoWidth: 640, videoHeight: 480 },
        { width: 640, height: 360 },
        'cover'
      )
    ).toEqual({ left: 6.25, top: 0, width: 15.625, height: 27.77777777777778 });
  });

  it('compensates for letterboxing when the video uses object-contain', () => {
    const result = mapVideoFaceBoxToViewport(
      { x: 0, y: 0, width: 100, height: 100, videoWidth: 640, videoHeight: 480 },
      { width: 640, height: 360 },
      'contain'
    );

    expect(result?.left).toBe(12.5);
    expect(result?.top).toBe(0);
    expect(result?.width).toBeCloseTo(11.71875);
    expect(result?.height).toBeCloseTo(20.833333);
  });

  it('mirrors mapped boxes to match mirrored camera previews', () => {
    expect(
      mapVideoFaceBoxToViewport(
        { x: 40, y: 60, width: 100, height: 100, videoWidth: 640, videoHeight: 480 },
        { width: 640, height: 360 },
        'cover',
        true
      )
    ).toEqual({ left: 78.125, top: 0, width: 15.625, height: 27.77777777777778 });
  });

  it('rejects unusable source or viewport dimensions', () => {
    expect(
      mapVideoFaceBoxToViewport(
        { x: 0, y: 0, width: 10, height: 10, videoWidth: 0, videoHeight: 480 },
        { width: 640, height: 360 },
        'cover'
      )
    ).toBeNull();
  });
});
