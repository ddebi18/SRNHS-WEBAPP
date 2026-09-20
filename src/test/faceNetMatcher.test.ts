import { describe, expect, it } from 'vitest';
import {
  computeCosineSimilarity,
  euclideanDistance,
  findDuplicateStudentId,
  isFaceBoxUsable,
  isSameEnrolledPerson,
  scoreFaceNetMatch,
} from '@/features/attendance/lib/faceNetMatcher';

function unit(values: number[]): Float32Array {
  const vec = new Float32Array(values);
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map(v => v / norm) as Float32Array;
}

describe('FaceNet matcher', () => {
  const studentA = unit(Array.from({ length: 128 }, (_, i) => (i === 0 ? 1 : 0.01)));
  const studentAClose = unit(Array.from({ length: 128 }, (_, i) => (i === 0 ? 0.98 : 0.012)));
  const studentB = unit(Array.from({ length: 128 }, (_, i) => (i === 7 ? 1 : 0.01)));
  const stranger = unit(Array.from({ length: 128 }, (_, i) => (i === 40 ? 1 : 0.02)));

  const gallery = [
    { label: 'std-a', descriptors: [studentA] },
    { label: 'std-b', descriptors: [studentB] },
  ];

  it('accepts a registered face when it is clearly closer than anyone else', () => {
    const result = scoreFaceNetMatch(studentAClose, gallery);
    expect(result.accepted).toBe(true);
    expect(result.label).toBe('std-a');
    expect(result.distance).toBeLessThan(0.55);
  });

  it('still accepts a registered face under normal webcam variance', () => {
    const result = scoreFaceNetMatch(
      [0.40, 0],
      [
        { label: 'std-a', descriptors: [[0, 0]] },
        { label: 'std-b', descriptors: [[0.90, 0]] },
      ]
    );
    expect(result.accepted).toBe(true);
    expect(result.label).toBe('std-a');
  });

  it('rejects an unknown face instead of assigning the nearest student', () => {
    const result = scoreFaceNetMatch(stranger, gallery);
    expect(result.accepted).toBe(false);
    expect(result.label).toBe('unknown');
  });

  it('rejects an ambiguous nearest-neighbor when two students are similarly close', () => {
    const result = scoreFaceNetMatch(
      [0, 0],
      [
        { label: 'std-a', descriptors: [[0.20, 0]] },
        { label: 'std-b', descriptors: [[0.25, 0]] },
      ],
      0.5,
      0.12
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('ambiguous');
  });

  it('keeps a previously verified student when the live embedding is still theirs', () => {
    expect(isSameEnrolledPerson(studentAClose, [studentA])).toBe(true);
    expect(isSameEnrolledPerson(stranger, [studentA])).toBe(false);
  });

  it('blocks registering a face that already belongs to another student', () => {
    expect(findDuplicateStudentId(studentAClose, gallery, 'std-new')).toBe('std-a');
    expect(findDuplicateStudentId(stranger, gallery, 'std-new')).toBeNull();
  });

  it('ignores tiny or low-score detections so the camera loop can stay smooth', () => {
    expect(isFaceBoxUsable(40, 40, 0.9)).toBe(false);
    expect(isFaceBoxUsable(120, 120, 0.2)).toBe(false);
    expect(isFaceBoxUsable(120, 120, 0.6)).toBe(true);
  });

  it('keeps cosine similarity in the valid range', () => {
    expect(computeCosineSimilarity(studentA, studentA)).toBeCloseTo(1, 5);
    expect(euclideanDistance(studentA, studentA)).toBeCloseTo(0, 5);
  });
});
