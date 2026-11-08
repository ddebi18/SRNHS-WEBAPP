import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRegistrationPose, type RegistrationCapturePreview } from '@/features/faceRegistration/lib/registrationChecks';

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

vi.mock('@/features/attendance/lib/faceOptimizationFlags', () => ({
  FACE_DIAGNOSTICS_ENABLED: false,
}));

vi.mock('@/features/faceRegistration/lib/registrationChecks', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/faceRegistration/lib/registrationChecks')>();
  return { ...actual, FACE_REGISTRATION_POSE_CHECK_ENABLED: true };
});

describe('useFaceCaptureSession', () => {
  beforeEach(() => {
    mockExtractDescriptors.mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 0;
    });
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
  const preview = (angle: 'front' | 'left' = 'front'): RegistrationCapturePreview => ({
    angle,
    canvas: document.createElement('canvas'),
    sampledAt: performance.now(),
    face: angle === 'front'
      ? frontalFace
      : { ...frontalFace, landmarks: [[100, 100], [200, 100], [165, 140], [120, 180], [180, 180]] },
    poseCheck: checkRegistrationPose(angle, angle === 'front'
      ? frontalFace
      : { ...frontalFace, landmarks: [[100, 100], [200, 100], [165, 140], [120, 180], [180, 180]] }),
    quality: { meanBrightness: 120, sharpness: 100 },
    frameCopyMs: 1,
    poseMs: 0.1,
    qualityCopyMs: 0.2,
    brightnessMs: 0.1,
    sharpnessMs: 0.2,
  });

  it('records a capture warning when it fails registration detection', async () => {
    mockExtractDescriptors.mockResolvedValue([{
      descriptor: null,
      failure: 'below_detection_confidence',
    }]);
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    await act(async () => {
      await result.current.captureCurrentAngle(preview());
    });

    expect(result.current.currentStep).toBe('front');
    expect(result.current.capturedFrames.front).toBeNull();
    expect(result.current.capturedFrames.front?.descriptor).toBeUndefined();
    expect(result.current.captureErrors.front).toContain('confidence was too low');
    expect(result.current.hasAllDescriptors).toBe(false);
    expect(result.current.isValidatingCapture).toBe(false);
    expect(mockExtractDescriptors).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ maxPasses: 2 })
    );
  });

  it('does not extract or capture when the pose check rejects the preview', async () => {
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    const rejectedPreview = preview();
    rejectedPreview.poseCheck = { accepted: false, guidance: 'Look straight.', pose: null };

    await act(async () => {
      await result.current.captureCurrentAngle(rejectedPreview);
    });

    expect(result.current.currentStep).toBe('front');
    expect(result.current.capturedFrames.front).toBeNull();
    expect(result.current.captureErrors.front).toBe('Look straight.');
    expect(mockExtractDescriptors).not.toHaveBeenCalled();
  });

  it('rejects a stale preview frame and asks staff to hold still', async () => {
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    const stalePreview = preview();
    stalePreview.sampledAt = performance.now() - 2000;

    await act(async () => {
      await result.current.captureCurrentAngle(stalePreview);
    });

    expect(result.current.currentStep).toBe('front');
    expect(result.current.captureErrors.front).toContain('fresh face detection');
    expect(mockExtractDescriptors).not.toHaveBeenCalled();
  });

  it('accepts a preview older than 500 ms when it is within the supplied detection-age limit', async () => {
    mockExtractDescriptors.mockResolvedValue([{
      descriptor: new Float32Array([0.1, 0.2]),
      failure: null,
    }]);
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    const recentPreview = preview();
    recentPreview.sampledAt = performance.now() - 750;

    await act(async () => {
      await result.current.captureCurrentAngle(recentPreview, 1500);
    });

    expect(result.current.currentStep).toBe('left');
    expect(result.current.capturedFrames.front?.descriptor?.[0]).toBeCloseTo(0.1);
    expect(result.current.capturedFrames.front?.descriptor?.[1]).toBeCloseTo(0.2);
  });

  it('requests exactly one fresh preview when the current preview exceeds the age limit', async () => {
    mockExtractDescriptors.mockResolvedValue([{
      descriptor: new Float32Array([0.1, 0.2]),
      failure: null,
    }]);
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    const stalePreview = preview();
    stalePreview.sampledAt = performance.now() - 2000;
    const freshPreview = preview();
    const refreshPreview = vi.fn().mockResolvedValue(freshPreview);

    await act(async () => {
      await result.current.captureCurrentAngle(stalePreview, 1500, refreshPreview);
    });

    expect(refreshPreview).toHaveBeenCalledTimes(1);
    expect(result.current.currentStep).toBe('left');
    expect(result.current.capturedFrames.front?.descriptor?.[0]).toBeCloseTo(0.1);
    expect(result.current.capturedFrames.front?.descriptor?.[1]).toBeCloseTo(0.2);
  });

  it('uses the completed detection age, not just the crop timestamp', async () => {
    mockExtractDescriptors.mockResolvedValue([{
      descriptor: new Float32Array([0.1, 0.2]),
      failure: null,
    }]);
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    const delayedDetectionPreview = preview();
    delayedDetectionPreview.face = {
      ...delayedDetectionPreview.face,
      detectionResultAt: performance.now() - 2000,
    };
    const freshPreview = preview();
    freshPreview.face = { ...freshPreview.face, detectionResultAt: performance.now() };
    const refreshPreview = vi.fn().mockResolvedValue(freshPreview);

    await act(async () => {
      await result.current.captureCurrentAngle(delayedDetectionPreview, 1500, refreshPreview);
    });

    expect(refreshPreview).toHaveBeenCalledTimes(1);
    expect(result.current.currentStep).toBe('left');
  });

  it('accepts and reuses the descriptor from a capture that passes registration checks', async () => {
    mockExtractDescriptors.mockResolvedValue([{
      descriptor: new Float32Array([0.1, 0.2]),
      failure: null,
    }]);
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());
    await act(async () => {
      await result.current.captureCurrentAngle(preview());
    });

    expect(result.current.currentStep).toBe('left');
    expect(result.current.capturedFrames.front?.descriptor?.[0]).toBeCloseTo(0.1);
    expect(result.current.capturedFrames.front?.descriptor?.[1]).toBeCloseTo(0.2);
    expect(result.current.captureErrors.front).toBeUndefined();
    expect(result.current.hasAllDescriptors).toBe(false);
    expect(result.current.isValidatingCapture).toBe(false);
  });

  it('rejects a descriptor that is too similar to a prior pose capture', async () => {
    mockExtractDescriptors.mockResolvedValue([{
      descriptor: new Float32Array([0.1, 0.2]),
      failure: null,
    }]);
    const { useFaceCaptureSession } = await import('@/features/faceRegistration/hooks/useFaceCaptureSession');
    const { result } = renderHook(() => useFaceCaptureSession());

    await act(async () => {
      await result.current.captureCurrentAngle(preview());
    });
    await act(async () => {
      await result.current.captureCurrentAngle(preview('left'));
    });

    expect(result.current.currentStep).toBe('left');
    expect(result.current.capturedFrames.left).toBeNull();
    expect(result.current.captureErrors.left).toContain('too similar');
  });
});
