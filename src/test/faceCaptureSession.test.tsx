import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExtractDescriptors = vi.hoisted(() => vi.fn());

vi.mock('@/features/attendance/lib/faceNetEngine', () => ({
  FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES: {
    no_face_detected: 'no face detected',
    inconsistent_landmarks: 'facial landmarks failed the quality check',
    below_minimum_face_size: 'face was too small in the captured image',
    below_detection_confidence: 'face detection confidence was too low',
    inference_failed: 'face analysis failed; check the browser console for details',
  },
  extractDescriptorsFromBlobsWithDiagnostics: mockExtractDescriptors,
}));

describe('useFaceCaptureSession', () => {
  beforeEach(() => {
    mockExtractDescriptors.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
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
        return { data, width: 8, height: 8 };
      }),
    } as never);
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) => callback(new Blob(['image'])),
    });
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL() {
        return 'blob:capture-preview';
      }

      static revokeObjectURL(_url: string) {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const frontalFace = {
    x: 120,
    y: 80,
    width: 200,
    height: 200,
    videoWidth: 640,
    videoHeight: 480,
    score: 0.9,
    landmarks: [[100, 100], [200, 100], [150, 140], [120, 180], [180, 180]] as [number, number][],
  };

  it('records a capture warning when it fails registration detection', async () => {
    mockExtractDescriptors.mockResolvedValue([{
      descriptor: null,
      failure: 'below_detection_confidence',
    }]);
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    await act(async () => {
      await result.current.captureCurrentAngle(video, frontalFace);
    });

    expect(result.current.currentStep).toBe('front');
    expect(result.current.capturedFrames.front).toBeNull();
    expect(result.current.capturedFrames.front?.descriptor).toBeUndefined();
    expect(result.current.captureErrors.front).toContain('confidence was too low');
    expect(result.current.hasAllDescriptors).toBe(false);
    expect(result.current.isValidatingCapture).toBe(false);
  });

  it('accepts and reuses the descriptor from a capture that passes registration checks', async () => {
    mockExtractDescriptors.mockResolvedValue([{
      descriptor: new Float32Array([0.1, 0.2]),
      failure: null,
    }]);
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    await act(async () => {
      await result.current.captureCurrentAngle(video, frontalFace);
    });

    expect(result.current.currentStep).toBe('left');
    expect(result.current.capturedFrames.front?.descriptor?.[0]).toBeCloseTo(0.1);
    expect(result.current.capturedFrames.front?.descriptor?.[1]).toBeCloseTo(0.2);
    expect(result.current.captureErrors.front).toBeUndefined();
    expect(result.current.hasAllDescriptors).toBe(false);
    expect(result.current.isValidatingCapture).toBe(false);
  });
});
