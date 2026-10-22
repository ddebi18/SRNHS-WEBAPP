import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  detectSingleFace: vi.fn(),
  detectAllFaces: vi.fn(),
}));

vi.mock('@vladmandic/face-api', () => ({
  default: mockFaceApi,
  ...mockFaceApi,
  TinyFaceDetectorOptions: class {},
}));

describe('faceNetEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFaceApi.nets.tinyFaceDetector.loadFromUri.mockResolvedValue(undefined);
    mockFaceApi.nets.ssdMobilenetv1.loadFromUri.mockRejectedValue(new Error('model missing'));
    mockFaceApi.nets.faceLandmark68Net.loadFromUri.mockResolvedValue(undefined);
    mockFaceApi.nets.faceRecognitionNet.loadFromUri.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not reject when an individual FaceNet model fails to load', async () => {
    const { ensureFaceNetModels } = await import('@/features/attendance/lib/faceNetEngine');
    await expect(ensureFaceNetModels()).resolves.toBeUndefined();
    expect(mockFaceApi.nets.ssdMobilenetv1.loadFromUri).toHaveBeenCalled();
  });

  it('rejects when face recognition model loading fails and retries on the next call', async () => {
    vi.resetModules();
    mockFaceApi.nets.faceRecognitionNet.loadFromUri
      .mockRejectedValueOnce(new Error('recognition model missing'))
      .mockResolvedValueOnce(undefined);
    const { ensureFaceNetModels } = await import('@/features/attendance/lib/faceNetEngine');

    await expect(ensureFaceNetModels()).rejects.toThrow('recognition model missing');
    await expect(ensureFaceNetModels()).resolves.toBeUndefined();
  });

  it('reports a missing face separately from a quality or inference failure', async () => {
    vi.resetModules();
    mockFaceApi.nets.tinyFaceDetector.isLoaded = true;
    mockFaceApi.nets.ssdMobilenetv1.isLoaded = false;
    mockFaceApi.detectAllFaces.mockResolvedValue([]);
    class TestURL extends URL {
      static override createObjectURL(_object: Blob | MediaSource) {
        return 'blob:face-test';
      }

      static override revokeObjectURL(_url: string) {}
    }
    vi.stubGlobal('URL', TestURL);
    vi.stubGlobal('Image', class {
      naturalWidth = 320;
      naturalHeight = 240;
      onload: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
      putImageData: vi.fn(),
    } as never));

    const { extractDescriptorsFromBlobsWithDiagnostics } = await import('@/features/attendance/lib/faceNetEngine');
    const attempts = await extractDescriptorsFromBlobsWithDiagnostics([
      new Blob(['front']),
      new Blob(['left']),
      new Blob(['right']),
    ]);

    expect(attempts.map(attempt => attempt.failure)).toEqual([
      'no_face_detected',
      'no_face_detected',
      'no_face_detected',
    ]);
    expect(attempts.every(attempt => attempt.descriptor === null)).toBe(true);
  });

  it('processes five regions and isolates one failed crop inference', async () => {
    const { describeScrfdFaceRegions } = await import('@/features/attendance/lib/faceNetEngine');
    const landmarks = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
    [36, 37, 38, 39, 40, 41].forEach(index => { landmarks[index] = { x: 30, y: 40 }; });
    [42, 43, 44, 45, 46, 47].forEach(index => { landmarks[index] = { x: 70, y: 40 }; });
    [27, 28, 29, 30, 31, 32, 33, 34, 35].forEach(index => { landmarks[index] = { x: 50, y: 54 }; });
    [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]
      .forEach(index => { landmarks[index] = { x: 50, y: 70 }; });

    const detection = {
      detection: { box: { x: 20, y: 20, width: 80, height: 80 }, score: 0.9 },
      landmarks: { positions: landmarks },
      descriptor: new Float32Array(128),
    };
    let inferenceIndex = 0;
    let activeInferences = 0;
    let maxConcurrentInferences = 0;
    const cropCanvases: HTMLCanvasElement[] = [];
    mockFaceApi.detectSingleFace.mockImplementation((canvas: HTMLCanvasElement) => {
      cropCanvases.push(canvas);
      const currentInference = ++inferenceIndex;
      return {
        withFaceLandmarks: () => ({
          withFaceDescriptor: async () => {
            activeInferences++;
            maxConcurrentInferences = Math.max(maxConcurrentInferences, activeInferences);
            try {
              await new Promise(resolve => setTimeout(resolve, 0));
              if (currentInference === 2) throw new Error('inference failed');
              return detection;
            } finally {
              activeInferences--;
            }
          },
        }),
      };
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
    } as never));

    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });
    const regions = Array.from({ length: 5 }, (_, index) => ({
      x: index * 120,
      y: 20,
      width: 80,
      height: 80,
    }));

    const results = await describeScrfdFaceRegions(video, regions);

    expect(results).toHaveLength(5);
    expect(results.map(result => result.status)).toEqual([
      'descriptor',
      'failed',
      'descriptor',
      'descriptor',
      'descriptor',
    ]);
    expect(results[1]?.status === 'failed' && results[1].reason).toContain('inference failed');
    expect(mockFaceApi.detectSingleFace).toHaveBeenCalledTimes(5);
    expect(maxConcurrentInferences).toBe(2);
    expect(cropCanvases[0]).not.toBe(cropCanvases[1]);
    expect(new Set(cropCanvases).size).toBe(2);
  });
});
