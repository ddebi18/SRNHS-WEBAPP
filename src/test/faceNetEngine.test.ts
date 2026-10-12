import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFaceApi = vi.hoisted(() => ({
  nets: {
    tinyFaceDetector: {
      loadFromUri: vi.fn().mockResolvedValue(undefined),
      isLoaded: true,
    },
    ssdMobilenetv1: {
      loadFromUri: vi.fn().mockRejectedValue(new Error('model missing')),
      isLoaded: false,
    },
    faceLandmark68Net: {
      loadFromUri: vi.fn().mockResolvedValue(undefined),
      isLoaded: true,
    },
    faceRecognitionNet: {
      loadFromUri: vi.fn().mockResolvedValue(undefined),
      isLoaded: true,
    },
  },
}));

vi.mock('@vladmandic/face-api', () => ({
  default: mockFaceApi,
  ...mockFaceApi,
}));

import { ensureFaceNetModels } from '@/features/attendance/lib/faceNetEngine';

describe('faceNetEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFaceApi.nets.tinyFaceDetector.loadFromUri.mockResolvedValue(undefined);
    mockFaceApi.nets.ssdMobilenetv1.loadFromUri.mockRejectedValue(new Error('model missing'));
    mockFaceApi.nets.faceLandmark68Net.loadFromUri.mockResolvedValue(undefined);
    mockFaceApi.nets.faceRecognitionNet.loadFromUri.mockResolvedValue(undefined);
  });

  it('does not reject when an individual FaceNet model fails to load', async () => {
    await expect(ensureFaceNetModels()).resolves.toBeUndefined();
    expect(mockFaceApi.nets.ssdMobilenetv1.loadFromUri).toHaveBeenCalled();
  });
});
