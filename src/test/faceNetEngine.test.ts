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
      detectLandmarks: vi.fn(),
    },
    faceRecognitionNet: {
      loadFromUri: vi.fn().mockResolvedValue(undefined),
      isLoaded: true,
      computeFaceDescriptor: vi.fn().mockResolvedValue(new Float32Array(128).fill(0.02)),
    },
  },
  detectSingleFace: vi.fn(),
  detectAllFaces: vi.fn(),
  extractFaces: vi.fn(),
  Rect: class {
    constructor(public x: number, public y: number, public width: number, public height: number) {}
    clipAtImageBorders() { return this; }
  },
}));

vi.mock('@vladmandic/face-api', () => ({
  default: mockFaceApi,
  ...mockFaceApi,
  TinyFaceDetectorOptions: class {
    constructor(public options: Record<string, number>) {}
  },
  SsdMobilenetv1Options: class {
    constructor(public options: Record<string, number>) {}
  },
}));

describe('faceNetEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFaceApi.nets.tinyFaceDetector.loadFromUri.mockResolvedValue(undefined);
    mockFaceApi.nets.tinyFaceDetector.isLoaded = true;
    mockFaceApi.nets.ssdMobilenetv1.loadFromUri.mockRejectedValue(new Error('model missing'));
    mockFaceApi.nets.ssdMobilenetv1.isLoaded = false;
    mockFaceApi.nets.faceLandmark68Net.loadFromUri.mockResolvedValue(undefined);
    mockFaceApi.nets.faceLandmark68Net.detectLandmarks.mockReset();
    mockFaceApi.nets.faceRecognitionNet.loadFromUri.mockResolvedValue(undefined);
    mockFaceApi.nets.faceRecognitionNet.computeFaceDescriptor.mockResolvedValue(new Float32Array(128).fill(0.02));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses Laplacian variance to distinguish flat crops from sharp edges', async () => {
    const { measureLaplacianVariance } = await import('@/features/attendance/lib/faceNetEngine');
    const flat = new Uint8ClampedArray(5 * 5 * 4);
    for (let index = 0; index < flat.length; index += 4) {
      flat[index] = flat[index + 1] = flat[index + 2] = 128;
      flat[index + 3] = 255;
    }
    const checkerboard = new Uint8ClampedArray(flat.length);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const pixel = (y * 5 + x) * 4;
        const value = (x + y) % 2 ? 255 : 0;
        checkerboard[pixel] = checkerboard[pixel + 1] = checkerboard[pixel + 2] = value;
        checkerboard[pixel + 3] = 255;
      }
    }
    expect(measureLaplacianVariance(flat, 5, 5)).toBe(0);
    expect(measureLaplacianVariance(checkerboard, 5, 5)).toBeGreaterThan(0);
  });

  it('keeps a slightly soft frontal face usable and attempts a descriptor', async () => {
    const { analyzeFaceRegionQuality, describePaddedFaceCrop } = await import('@/features/attendance/lib/faceNetEngine');
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let index = 0; index < data.length; index += 4) {
          data[index] = data[index + 1] = data[index + 2] = 128;
          data[index + 3] = 255;
        }
        for (let y = 20; y < Math.min(height - 1, 80); y++) {
          for (let x = 20; x < Math.min(width - 1, 80); x++) {
            const pixel = (y * width + x) * 4;
            data[pixel] = data[pixel + 1] = data[pixel + 2] = 130;
          }
        }
        return { data };
      }),
    } as never));
    const region = { x: 120, y: 80, width: 100, height: 110, score: 0.9 };
    const quality = analyzeFaceRegionQuality(video, region);
    expect(quality.sharpnessVariance).toBeLessThan(12);
    expect(quality.usable).toBe(true);

    const positions = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
    [36, 37, 38, 39, 40, 41].forEach(index => { positions[index] = { x: 30, y: 40 }; });
    [42, 43, 44, 45, 46, 47].forEach(index => { positions[index] = { x: 70, y: 40 }; });
    [27, 28, 29, 30, 31, 32, 33, 34, 35].forEach(index => { positions[index] = { x: 50, y: 54 }; });
    [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]
      .forEach(index => { positions[index] = { x: 50, y: 70 }; });
    mockFaceApi.detectSingleFace.mockReturnValue({
      withFaceLandmarks: () => ({
        withFaceDescriptor: async () => ({
          detection: { box: { x: 20, y: 20, width: 80, height: 80 }, score: 0.9 },
          landmarks: { positions },
          descriptor: new Float32Array(128).fill(0.02),
        }),
      }),
    } as never);

    const attempt = await describePaddedFaceCrop(region, quality.crop, quality.cropX, quality.cropY);
    expect(mockFaceApi.detectSingleFace).toHaveBeenCalledOnce();
    expect(attempt.status).toBe('descriptor');
  });

  it('retries an angled face with 40% padding and extracts its legacy descriptor', async () => {
    const { describePaddedFaceCrop } = await import('@/features/attendance/lib/faceNetEngine');
    const positions = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
    [36, 37, 38, 39, 40, 41].forEach(index => { positions[index] = { x: 30, y: 40 }; });
    [42, 43, 44, 45, 46, 47].forEach(index => { positions[index] = { x: 70, y: 40 }; });
    [27, 28, 29, 30, 31, 32, 33, 34, 35].forEach(index => { positions[index] = { x: 50, y: 54 }; });
    [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]
      .forEach(index => { positions[index] = { x: 50, y: 70 }; });
    const detection = {
      detection: { box: { x: 20, y: 20, width: 80, height: 80 }, score: 0.9 },
      landmarks: { positions },
      descriptor: new Float32Array(128).fill(0.02),
    };
    mockFaceApi.detectSingleFace.mockImplementation((target: HTMLCanvasElement) => ({
      withFaceLandmarks: () => ({
        withFaceDescriptor: async () => target.width < 160 ? null : detection,
      }),
    } as never));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
    } as never));
    const input = document.createElement('video');
    Object.defineProperties(input, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    const result = await describePaddedFaceCrop(
      { x: 120, y: 80, width: 100, height: 110, score: 0.9 },
      Object.assign(document.createElement('canvas'), { width: 140, height: 154 }),
      100,
      58,
      undefined,
      input
    );

    expect(result.status).toBe('descriptor');
    expect(result.retryStepSucceeded).toBe('larger_padding_40');
    expect(result.retryAttempts?.map(attempt => attempt.failureReason)).toEqual([
      'no_face_in_crop',
      null,
    ]);
    expect(mockFaceApi.detectSingleFace).toHaveBeenCalledTimes(2);
  });

  it('reports extraction failure after all crop retries find no face', async () => {
    const { describePaddedFaceCrop } = await import('@/features/attendance/lib/faceNetEngine');
    mockFaceApi.nets.ssdMobilenetv1.isLoaded = true;
    mockFaceApi.detectSingleFace.mockReturnValue({
      withFaceLandmarks: () => ({
        withFaceDescriptor: async () => null,
      }),
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
    } as never));
    const input = document.createElement('video');
    Object.defineProperties(input, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    const result = await describePaddedFaceCrop(
      { x: 120, y: 80, width: 100, height: 110, score: 0.9 },
      Object.assign(document.createElement('canvas'), { width: 140, height: 154 }),
      100,
      58,
      undefined,
      input
    );

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' && result.reason).toBe('no_face_in_crop');
    expect(result.retryAttempts?.map(attempt => attempt.step)).toEqual([
      'initial',
      'larger_padding_40',
      'lower_score',
      'ssd_mobilenet',
    ]);
    expect(mockFaceApi.detectSingleFace).toHaveBeenCalledTimes(4);
  });

  it('treats a quality-assessment exception as usable', async () => {
    const { analyzeFaceRegionQuality } = await import('@/features/attendance/lib/faceNetEngine');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('canvas read failed');
    });
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    expect(analyzeFaceRegionQuality(video, {
      x: 120,
      y: 80,
      width: 100,
      height: 110,
      score: 0.9,
    }).usable).toBe(true);
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
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: '',
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
    expect(maxConcurrentInferences).toBe(1);
    expect(new Set(cropCanvases).size).toBe(1);
    expect(cropCanvases[0]).toBeInstanceOf(HTMLCanvasElement);
  });

  it('uses the padded SCRFD crop and face-api landmarks without re-detecting the crop', async () => {
    const { describeScrfdFaceRegions } = await import('@/features/attendance/lib/faceNetEngine');
    const positions = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
    [36, 37, 38, 39, 40, 41].forEach(index => { positions[index] = { x: 30, y: 40 }; });
    [42, 43, 44, 45, 46, 47].forEach(index => { positions[index] = { x: 70, y: 40 }; });
    [27, 28, 29, 30, 31, 32, 33, 34, 35].forEach(index => { positions[index] = { x: 50, y: 54 }; });
    [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]
      .forEach(index => { positions[index] = { x: 50, y: 70 }; });
    const align = vi.fn(() => ({ x: 15, y: 12, width: 70, height: 70 }));
    mockFaceApi.nets.faceLandmark68Net.detectLandmarks.mockResolvedValue({ positions, align });
    mockFaceApi.extractFaces.mockImplementation(async () => [document.createElement('canvas')]);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: '',
    } as never));
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    const results = await describeScrfdFaceRegions(
      video,
      [{ x: 120, y: 80, width: 100, height: 120, score: 0.9 }],
      undefined,
      'landmark_aligned'
    );

    expect(results[0]?.status).toBe('descriptor');
    expect(results[0]?.status === 'descriptor' && results[0].source).toBe('landmark_aligned');
    expect(mockFaceApi.nets.faceLandmark68Net.detectLandmarks).toHaveBeenCalledTimes(1);
    expect(align).toHaveBeenCalledWith(null, { useDlibAlignment: true });
    expect(mockFaceApi.extractFaces).toHaveBeenCalledTimes(2);
    expect(mockFaceApi.detectSingleFace).not.toHaveBeenCalled();
    expect(mockFaceApi.nets.faceRecognitionNet.computeFaceDescriptor).toHaveBeenCalledTimes(1);
  });

  it('does not pass OffscreenCanvas into face-api even when OffscreenCanvas exists', async () => {
    class FakeOffscreenCanvas {
      width = 1;
      height = 1;
      getContext() {
        return { drawImage: vi.fn(), clearRect: vi.fn() };
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const { describeScrfdFaceRegions } = await import('@/features/attendance/lib/faceNetEngine');
    mockFaceApi.detectSingleFace.mockImplementation((canvas: HTMLCanvasElement) => ({
      withFaceLandmarks: () => ({
        withFaceDescriptor: async () => {
          expect(canvas).toBeInstanceOf(HTMLCanvasElement);
          return null;
        },
      }),
    }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: '',
    } as never));
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });
    await describeScrfdFaceRegions(video, [{ x: 20, y: 20, width: 80, height: 80 }]);
    expect(mockFaceApi.detectSingleFace.mock.calls[0]?.[0]).toBeInstanceOf(HTMLCanvasElement);
    expect(mockFaceApi.detectSingleFace.mock.calls[0]?.[0]).not.toBeInstanceOf(FakeOffscreenCanvas);
  });

  it('times sequential crop recognition for 1, 3, and 5 faces', async () => {
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
    mockFaceApi.detectSingleFace.mockImplementation(() => ({
      withFaceLandmarks: () => ({
        withFaceDescriptor: async () => {
          await new Promise(resolve => setTimeout(resolve, 20));
          return detection;
        },
      }),
    }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: '',
    } as never));
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    for (const faceCount of [1, 3, 5]) {
      const regions = Array.from({ length: faceCount }, (_, index) => ({
        x: index * 120,
        y: 20,
        width: 80,
        height: 80,
      }));
      const startedAt = performance.now();
      const results = await describeScrfdFaceRegions(video, regions);
      const durationMs = performance.now() - startedAt;
      console.log(`[FaceRecognition] Scan diagnostics`, {
        detectedBoxes: faceCount,
        totalScanDurationMs: durationMs,
        cropDurationMs: results.map(result => result.durationMs),
      });
      expect(results).toHaveLength(faceCount);
      expect(results.every(result => result.status === 'descriptor')).toBe(true);
    }
  });

  it('computes descriptors from SCRFD keypoints without TinyFaceDetector', async () => {
    const { describeScrfdFaceRegions } = await import('@/features/attendance/lib/faceNetEngine');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: '',
    } as never));
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });
    const regions = [{
      x: 120,
      y: 80,
      width: 100,
      height: 120,
      score: 0.9,
      landmarks: [
        [140, 110],
        [190, 108],
        [165, 140],
        [148, 170],
        [185, 168],
      ] as [number, number][],
    }];

    const startedAt = performance.now();
    const results = await describeScrfdFaceRegions(video, regions, undefined, 'keypoint_aligned');
    const durationMs = performance.now() - startedAt;

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('descriptor');
    expect(results[0]?.status === 'descriptor' && results[0].source).toBe('aligned');
    expect(mockFaceApi.detectSingleFace).not.toHaveBeenCalled();
    expect(mockFaceApi.nets.faceRecognitionNet.computeFaceDescriptor).toHaveBeenCalledTimes(1);
    expect(durationMs).toBeLessThan(50);
  });

  it('detects fallback face regions without extracting descriptors', async () => {
    const { detectLiveFaceRegions } = await import('@/features/attendance/lib/faceNetEngine');
    mockFaceApi.detectAllFaces.mockResolvedValue([{
      box: { x: 20, y: 30, width: 80, height: 90 },
      score: 0.9,
    }]);
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    await expect(detectLiveFaceRegions(video)).resolves.toEqual([{
      x: 20,
      y: 30,
      width: 80,
      height: 90,
      score: 0.9,
    }]);
    expect(mockFaceApi.detectAllFaces).toHaveBeenCalledTimes(1);
    expect(mockFaceApi.nets.faceRecognitionNet.computeFaceDescriptor).not.toHaveBeenCalled();
  });
});
