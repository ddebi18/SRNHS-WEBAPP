import { describe, expect, it, vi } from 'vitest';

const { alignedDescriptor, cropDescriptor } = vi.hoisted(() => {
  const aligned = new Float32Array(128).fill(0.04);
  aligned[0] = 0.9;
  const crop = new Float32Array(128).fill(0.04);
  crop[0] = 0.88;
  return { alignedDescriptor: aligned, cropDescriptor: crop };
});

vi.mock('@vladmandic/face-api', () => {
  const mock = {
    nets: {
      tinyFaceDetector: { loadFromUri: vi.fn(), isLoaded: true },
      ssdMobilenetv1: { loadFromUri: vi.fn(), isLoaded: false },
      faceLandmark68Net: { loadFromUri: vi.fn(), isLoaded: true },
      faceRecognitionNet: {
        loadFromUri: vi.fn(),
        isLoaded: true,
        computeFaceDescriptor: vi.fn().mockResolvedValue(alignedDescriptor),
      },
    },
    detectSingleFace: vi.fn((canvas: HTMLCanvasElement) => ({
      withFaceLandmarks: () => ({
        withFaceDescriptor: async () => ({
          detection: {
            box: { x: 8, y: 8, width: Math.max(40, canvas.width - 16), height: Math.max(40, canvas.height - 16) },
            score: 0.9,
          },
          landmarks: { positions: validFaceLandmarks() },
          descriptor: cropDescriptor,
        }),
      }),
    })),
    detectAllFaces: vi.fn(),
    TinyFaceDetectorOptions: class {},
    SsdMobilenetv1Options: class {},
  };
  return { default: mock, ...mock };
});

import {
  compareAlignedAndCropDescriptors,
  describeScrfdFaceRegions,
  estimateSimilarityTransform,
  FACE_NET_FIVE_POINT_TEMPLATE,
  FACE_RECOGNITION_NET_INPUT_SIZE,
  hasScrfdKeypoints,
} from '@/features/attendance/lib/faceNetEngine';
import {
  euclideanDistance,
  FACENET_DISTANCE_THRESHOLD,
  scoreFaceNetMatch,
  type LabeledDescriptors,
} from '@/features/attendance/lib/faceNetMatcher';

const SAMPLE_KEYPOINTS: [number, number][] = [
  [140, 110],
  [190, 108],
  [165, 140],
  [148, 170],
  [185, 168],
];

function validFaceLandmarks() {
  const points = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
  [36, 37, 38, 39, 40, 41].forEach(index => { points[index] = { x: 30, y: 40 }; });
  [42, 43, 44, 45, 46, 47].forEach(index => { points[index] = { x: 70, y: 40 }; });
  [27, 28, 29, 30, 31, 32, 33, 34, 35].forEach(index => { points[index] = { x: 50, y: 54 }; });
  [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]
    .forEach(index => { points[index] = { x: 50, y: 70 }; });
  return points;
}

function mockCanvasContext() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
  } as never));
}

describe('aligned descriptor flow', () => {
  it('does not change the live match threshold', () => {
    expect(FACENET_DISTANCE_THRESHOLD).toBe(0.43);
  });

  it('accepts decoded SCRFD 5-point landmarks', () => {
    expect(hasScrfdKeypoints(SAMPLE_KEYPOINTS)).toBe(true);
    expect(hasScrfdKeypoints(undefined)).toBe(false);
    expect(hasScrfdKeypoints([[1, 1], [2, 2]] as [number, number][])).toBe(false);
  });

  it('maps source keypoints onto the 150px FaceRecognitionNet template', () => {
    const transform = estimateSimilarityTransform(SAMPLE_KEYPOINTS, FACE_NET_FIVE_POINT_TEMPLATE);
    expect(transform).not.toBeNull();
    const mapped = SAMPLE_KEYPOINTS.map(([x, y]) => [
      transform!.a * x - transform!.b * y + transform!.tx,
      transform!.b * x + transform!.a * y + transform!.ty,
    ]);
    const rms = Math.sqrt(
      mapped.reduce((sum, point, index) => {
        const dest = FACE_NET_FIVE_POINT_TEMPLATE[index]!;
        return sum + (point[0]! - dest[0]) ** 2 + (point[1]! - dest[1]) ** 2;
      }, 0) / mapped.length
    );
    expect(FACE_RECOGNITION_NET_INPUT_SIZE).toBe(150);
    expect(rms).toBeLessThan(8);
  });

  it('skips TinyFaceDetector when keypoints are present and falls back without them', async () => {
    mockCanvasContext();
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });
    const region = {
      x: 120,
      y: 80,
      width: 100,
      height: 120,
      landmarks: SAMPLE_KEYPOINTS,
    };
    const aligned = await describeScrfdFaceRegions(video, [region]);
    const crop = await describeScrfdFaceRegions(video, [{ ...region, landmarks: undefined }]);
    expect(aligned[0]?.status === 'descriptor' && aligned[0].source).toBe('aligned');
    expect(crop[0]?.status === 'descriptor' && crop[0].source).toBe('crop');
  });

  it('calculates diagnostic distances from fixture descriptors without changing thresholds', async () => {
    mockCanvasContext();
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });
    const comparison = await compareAlignedAndCropDescriptors(video, {
      x: 120,
      y: 80,
      width: 100,
      height: 120,
      landmarks: SAMPLE_KEYPOINTS,
    });

    const alignedDesc = comparison.aligned.status === 'descriptor'
      ? comparison.aligned.detection.descriptor
      : null;
    const cropDesc = comparison.crop.status === 'descriptor'
      ? comparison.crop.detection.descriptor
      : null;
    expect(alignedDesc).not.toBeNull();
    expect(cropDesc).not.toBeNull();

    const gallery: LabeledDescriptors[] = [{
      label: 'enrolled-old-path',
      descriptors: [cropDesc!],
    }];
    const alignedVsGallery = scoreFaceNetMatch(alignedDesc!, gallery);
    const cropVsGallery = scoreFaceNetMatch(cropDesc!, gallery);
    const alignedVsCrop = euclideanDistance(alignedDesc!, cropDesc!);

    expect(cropVsGallery.accepted).toBe(true);
    expect(alignedVsCrop).toBe(comparison.distance);
    expect(alignedVsCrop).toBeCloseTo(0.02, 5);
    expect(alignedVsGallery.accepted).toBe(true);
  });
});
