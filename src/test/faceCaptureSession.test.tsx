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
      await result.current.captureCurrentAngle(video);
    });

    expect(result.current.currentStep).toBe('left');
    expect(result.current.capturedFrames.front).not.toBeNull();
    expect(result.current.capturedFrames.front?.descriptor).toBeUndefined();
    expect(result.current.captureErrors.front).toContain('confidence was too low');
    expect(result.current.hasValidDescriptor).toBe(false);
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
      await result.current.captureCurrentAngle(video);
    });

    expect(result.current.currentStep).toBe('left');
    expect(result.current.capturedFrames.front?.descriptor?.[0]).toBeCloseTo(0.1);
    expect(result.current.capturedFrames.front?.descriptor?.[1]).toBeCloseTo(0.2);
    expect(result.current.captureErrors.front).toBeUndefined();
    expect(result.current.hasValidDescriptor).toBe(true);
    expect(result.current.isValidatingCapture).toBe(false);
  });
});
