import { describe, expect, it } from 'vitest';
import {
  getUnpairedFaceBoxIndices,
  mapVideoFaceBoxToViewport,
} from '@/lib/faceOverlayGeometry';
import {
  assignFaceDetectionTracks,
  canFastConfirmFaceMatch,
  findDuplicateStudentClaimLosers,
  predictFaceTrackBox,
  selectFaceDescriptorDetections,
  updateFaceTrackIdentity,
} from '@/features/attendance/lib/faceTracking';
import { scoreFaceNetMatch } from '@/features/attendance/lib/faceNetMatcher';
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

  it('predicts a missed track box from velocity and caps stale extrapolation', () => {
    expect(predictFaceTrackBox(
      { x: 10, y: 20, width: 30, height: 40 },
      0.1,
      -0.05,
      1000,
      1200
    )).toEqual({ x: 30, y: 10, width: 30, height: 40 });
    expect(predictFaceTrackBox(
      { x: 10, y: 20, width: 30, height: 40 },
      0.1,
      0,
      1000,
      3000
    ).x).toBe(50);
  });

  it('prevents identity swaps among five close faces with a global assignment', () => {
    const tracks = Array.from({ length: 5 }, (_, index) => ({
      box: { x: index * 36, y: 40, width: 40, height: 48 },
      velocityX: index % 2 ? -0.08 : 0.08,
      velocityY: 0,
      lastSeenAt: 1000,
      studentId: `student-${index}`,
    }));
    const detections = [...tracks]
      .reverse()
      .map(track => ({ ...track.box }));
    const ids = tracks.map(track => track.studentId).reverse();

    expect(assignFaceDetectionTracks(detections, tracks, ids, 1200)).toEqual([4, 3, 2, 1, 0]);
  });

  it('keeps only the lower-distance claim when two tracks resolve to one student', () => {
    expect(findDuplicateStudentClaimLosers([
      { studentId: 'student-a', distance: 0.31 },
      { studentId: 'student-b', distance: 0.28 },
      { studentId: 'student-a', distance: 0.19 },
      { studentId: null, distance: 0.8 },
    ])).toEqual([0]);
  });

  it('caps extraction at three and fairly rotates unconfirmed tracks', () => {
    const tracks = Array.from({ length: 5 }, () => ({ confirmed: false, lastDescriptorAt: 0 }));
    const first = selectFaceDescriptorDetections(tracks, 0);
    const second = selectFaceDescriptorDetections(tracks, 200, first.nextRotationCursor);

    expect(first.indices).toEqual([0, 1, 2]);
    expect(second.indices).toEqual([3, 4, 0]);
    expect(first.indices.length).toBeLessThanOrEqual(3);
    expect(second.indices.length).toBeLessThanOrEqual(3);
  });

  it('re-verifies confirmed tracks at one second without reprocessing early', () => {
    const tracks = Array.from({ length: 5 }, () => ({ confirmed: true, lastDescriptorAt: 0 }));
    expect(selectFaceDescriptorDetections(tracks, 999).indices).toEqual([]);
    const first = selectFaceDescriptorDetections(tracks, 1000);
    expect(first.indices).toEqual([0, 1, 2]);

    first.indices.forEach(index => { tracks[index]!.lastDescriptorAt = 1000; });
    const second = selectFaceDescriptorDetections(tracks, 1100, first.nextRotationCursor);
    expect(second.indices).toEqual([3, 4]);
    expect(second.indices.length).toBeLessThanOrEqual(3);
  });

  it('confirms on two matching results in four scans, switches in five, and survives a skipped scan', () => {
    let state = {
      candidateStudentId: '',
      stabilityCount: 0,
      confirmedStudentId: null as string | null,
      pendingSwitch: false,
      matchHistory: [] as Array<string | null>,
    };
    state = updateFaceTrackIdentity(state, 'student-a', true);
    state = updateFaceTrackIdentity(state, null, false);
    state = updateFaceTrackIdentity(state, 'student-a', true);
    expect(state.confirmedStudentId).toBe('student-a');

    for (let frame = 0; frame < 4; frame++) {
      state = updateFaceTrackIdentity(state, 'student-b', true);
      expect(state.confirmedStudentId).toBe('student-a');
    }
    state = updateFaceTrackIdentity(state, 'student-b', true);
    expect(state.confirmedStudentId).toBe('student-b');

    const failed = updateFaceTrackIdentity(state, null, false);
    expect(failed).toEqual(state);
  });

  it('does not confirm when accepted matches alternate between two students', () => {
    let state = {
      candidateStudentId: '',
      stabilityCount: 0,
      confirmedStudentId: null as string | null,
      pendingSwitch: false,
      matchHistory: [] as Array<string | null>,
    };
    for (const id of ['student-a', 'student-b', 'student-a', 'student-b']) {
      state = updateFaceTrackIdentity(state, id, true);
    }
    expect(state.confirmedStudentId).toBeNull();
  });

  it('keeps unknown and ambiguous faces unconfirmed', () => {
    const gallery = [
      { label: 'student-a', descriptors: [[0.2, 0]] },
      { label: 'student-b', descriptors: [[0.25, 0]] },
    ];
    const unknown = scoreFaceNetMatch([1, 0], gallery);
    const similar = scoreFaceNetMatch([0, 0], gallery);
    expect(unknown.accepted).toBe(false);
    expect(similar.reason).toBe('ambiguous');

    let state = {
      candidateStudentId: '',
      stabilityCount: 0,
      confirmedStudentId: null as string | null,
      pendingSwitch: false,
      matchHistory: [] as Array<string | null>,
    };
    state = updateFaceTrackIdentity(state, unknown.accepted ? unknown.label : null, true);
    state = updateFaceTrackIdentity(state, similar.accepted ? similar.label : null, true);
    expect(state.confirmedStudentId).toBeNull();
  });

  it('keeps fast confirmation disabled by default and enforces its distance/margin gates', () => {
    expect(canFastConfirmFaceMatch(0.30, 0.50, false)).toBe(false);
    expect(canFastConfirmFaceMatch(0.30, 0.395, true)).toBe(false);
    expect(canFastConfirmFaceMatch(0.30, 0.50, true)).toBe(true);
    expect(canFastConfirmFaceMatch(0.33, 0.60, true)).toBe(false);
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
  it('draws one box for one moving face when detector and track boxes overlap', () => {
    let tracks: Array<{
      box: { x: number; y: number; width: number; height: number };
      velocityX: number;
      velocityY: number;
      lastSeenAt: number;
      studentId: string | null;
    }> = [];
    for (const [frame, x] of [100, 112, 124].entries()) {
      const detections = [{ x, y: 80, width: 80, height: 90 }];
      const assignments = assignFaceDetectionTracks(
        detections,
        tracks,
        [null],
        frame * 200
      );
      if (assignments[0] === null) {
        tracks.push({
          box: detections[0]!,
          velocityX: 0,
          velocityY: 0,
          lastSeenAt: frame * 200,
          studentId: null,
        });
      } else {
        tracks[assignments[0]!]!.box = detections[0]!;
        tracks[assignments[0]!]!.lastSeenAt = frame * 200;
      }
      const unpaired = getUnpairedFaceBoxIndices(detections, tracks.map(track => track.box));
      expect(tracks.length + unpaired.length).toBe(1);
    }
    expect(tracks).toHaveLength(1);
  });

  it('keeps two close faces as two separate drawn tracks', () => {
    let tracks: Array<{
      box: { x: number; y: number; width: number; height: number };
      velocityX: number;
      velocityY: number;
      lastSeenAt: number;
      studentId: string | null;
    }> = [];
    for (const [frame, offset] of [0, 4].entries()) {
      const detections = [
        { x: 100 + offset, y: 80, width: 60, height: 70 },
        { x: 150 - offset, y: 80, width: 60, height: 70 },
      ];
      const assignments = assignFaceDetectionTracks(
        detections,
        tracks,
        [null, null],
        frame * 200
      );
      detections.forEach((box, index) => {
        const trackIndex = assignments[index];
        if (trackIndex === null || trackIndex === undefined) {
          tracks.push({
            box,
            velocityX: 0,
            velocityY: 0,
            lastSeenAt: frame * 200,
            studentId: null,
          });
        } else {
          tracks[trackIndex]!.box = box;
          tracks[trackIndex]!.lastSeenAt = frame * 200;
        }
      });
      const unpaired = getUnpairedFaceBoxIndices(detections, tracks.map(track => track.box));
      expect(tracks.length + unpaired.length).toBe(2);
    }
    expect(tracks).toHaveLength(2);
  });

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
