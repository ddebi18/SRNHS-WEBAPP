import { euclideanDistance } from '@/features/attendance/lib/faceNetMatcher';
import type { CaptureAngle } from '../types';

export const FACE_REGISTRATION_POSE_CHECK_ENABLED =
  import.meta.env.VITE_FACE_REGISTRATION_POSE_CHECK?.toLowerCase() !== 'false';

export const REGISTRATION_MIN_FACE_SIZE_PX = 120;
export const REGISTRATION_MIN_DETECTOR_SCORE = 0.6;
export const REGISTRATION_MIN_SHARPNESS = 50;
export const REGISTRATION_MIN_BRIGHTNESS = 45;
export const REGISTRATION_MAX_ROLL_DEG = 15;
export const REGISTRATION_FRONT_MAX_YAW_DEG = 10;
export const REGISTRATION_SIDE_MIN_YAW_DEG = 15;
export const REGISTRATION_SIDE_MAX_YAW_DEG = 35;
export const REGISTRATION_MIN_POSE_DESCRIPTOR_DISTANCE = 0.08;

export interface RegistrationFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score?: number;
  landmarks?: [number, number][];
  detectionResultAt?: number;
}

export interface FacePose {
  yawDeg: number;
  rollDeg: number;
}

export interface RegistrationPoseCheck {
  accepted: boolean;
  guidance: string;
  pose: FacePose | null;
}

export interface ImageQuality {
  meanBrightness: number;
  sharpness: number;
}

export interface ImageQualityTimings {
  qualityCopyMs: number;
  brightnessMs: number;
  sharpnessMs: number;
}

export interface RegistrationCapturePreview {
  angle: CaptureAngle;
  canvas: HTMLCanvasElement;
  sampledAt: number;
  face: RegistrationFaceBox;
  poseCheck: RegistrationPoseCheck;
  quality: ImageQuality | null;
  frameCopyMs: number;
  poseMs: number;
  qualityCopyMs: number;
  brightnessMs: number;
  sharpnessMs: number;
}

export function getRegistrationPreviewAgeMs(
  preview: RegistrationCapturePreview | null,
  now = performance.now()
): number {
  return preview
    ? now - (preview.face.detectionResultAt ?? preview.sampledAt)
    : Number.POSITIVE_INFINITY;
}

export function estimateScrfdPose(landmarks?: [number, number][]): FacePose | null {
  if (!landmarks || landmarks.length < 3) return null;
  const [leftEye, rightEye, nose] = landmarks;
  if (
    !leftEye || !rightEye || !nose ||
    ![...leftEye, ...rightEye, ...nose].every(Number.isFinite)
  ) return null;

  const leftEyeDistance = Math.hypot(nose[0] - leftEye[0], nose[1] - leftEye[1]);
  const rightEyeDistance = Math.hypot(nose[0] - rightEye[0], nose[1] - rightEye[1]);
  const distanceSum = leftEyeDistance + rightEyeDistance;
  if (distanceSum < 1) return null;

  const yawRatio = (leftEyeDistance - rightEyeDistance) / distanceSum;
  const rollDeg = Math.atan2(rightEye[1] - leftEye[1], rightEye[0] - leftEye[0]) * (180 / Math.PI);
  return {
    yawDeg: Math.max(-90, Math.min(90, yawRatio * 90)),
    rollDeg,
  };
}

export function checkRegistrationPose(
  angle: CaptureAngle,
  face: RegistrationFaceBox | null | undefined
): RegistrationPoseCheck {
  const pose = estimateScrfdPose(face?.landmarks);
  if (!face || !pose) {
    return { accepted: false, guidance: 'Pose unavailable. Use the SCRFD face detector and try again.', pose };
  }
  if (typeof face.score !== 'number' || face.score < REGISTRATION_MIN_DETECTOR_SCORE) {
    return { accepted: false, guidance: 'Face detection confidence is low. Hold still and try again.', pose };
  }
  if (Math.min(face.width, face.height) < REGISTRATION_MIN_FACE_SIZE_PX) {
    return { accepted: false, guidance: 'Move closer to the camera.', pose };
  }
  if (Math.abs(pose.rollDeg) > REGISTRATION_MAX_ROLL_DEG) {
    return { accepted: false, guidance: 'Keep your head upright.', pose };
  }

  const yaw = pose.yawDeg;
  const accepted = angle === 'front'
    ? Math.abs(yaw) <= REGISTRATION_FRONT_MAX_YAW_DEG
    : angle === 'left'
      ? yaw >= REGISTRATION_SIDE_MIN_YAW_DEG && yaw <= REGISTRATION_SIDE_MAX_YAW_DEG
      : yaw <= -REGISTRATION_SIDE_MIN_YAW_DEG && yaw >= -REGISTRATION_SIDE_MAX_YAW_DEG;
  if (accepted) return { accepted: true, guidance: 'Pose looks good. Capture now.', pose };

  if (angle === 'front') {
    return { accepted: false, guidance: 'Look straight at the camera.', pose };
  }
  const expectedSign = angle === 'left' ? 1 : -1;
  const tooFar = yaw * expectedSign > REGISTRATION_SIDE_MAX_YAW_DEG;
  return {
    accepted: false,
    guidance: tooFar
      ? 'Turn back slightly toward the camera.'
      : `Turn slightly ${angle}.`,
    pose,
  };
}

export function measureImageQuality(
  image: ImageData,
  onTimings?: (timings: ImageQualityTimings) => void
): ImageQuality {
  const { data, width, height } = image;
  const brightnessStartedAt = onTimings ? performance.now() : 0;
  let brightnessTotal = 0;
  const grayscale = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const brightness = 0.299 * (data[offset] ?? 0) +
        0.587 * (data[offset + 1] ?? 0) +
        0.114 * (data[offset + 2] ?? 0);
      brightnessTotal += brightness;
      grayscale[y * width + x] = brightness;
    }
  }

  const brightnessMs = onTimings ? performance.now() - brightnessStartedAt : 0;
  const sharpnessStartedAt = onTimings ? performance.now() : 0;
  let laplacianMean = 0;
  let laplacianSquaredDelta = 0;
  let laplacianCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = grayscale[y * width + x]!;
      const left = grayscale[y * width + x - 1]!;
      const right = grayscale[y * width + x + 1]!;
      const up = grayscale[(y - 1) * width + x]!;
      const down = grayscale[(y + 1) * width + x]!;
      const laplacian = left + right + up + down - 4 * center;
      laplacianCount++;
      const delta = laplacian - laplacianMean;
      laplacianMean += delta / laplacianCount;
      laplacianSquaredDelta += delta * (laplacian - laplacianMean);
    }
  }
  const sharpness = laplacianCount
    ? laplacianSquaredDelta / laplacianCount
    : 0;
  if (onTimings) {
    onTimings({
      qualityCopyMs: 0,
      brightnessMs,
      sharpnessMs: performance.now() - sharpnessStartedAt,
    });
  }

  return {
    meanBrightness: data.length ? brightnessTotal / (data.length / 4) : 0,
    sharpness,
  };
}

export function measureDownscaledCanvasQuality(
  source: HTMLCanvasElement,
  qualityCanvas: HTMLCanvasElement,
  scale = 0.9,
  onTimings?: (timings: ImageQualityTimings) => void
): ImageQuality {
  const downscale = Math.min(1, Math.max(0.1, scale));
  const width = Math.max(1, Math.round(source.width * downscale));
  const height = Math.max(1, Math.round(source.height * downscale));
  if (qualityCanvas.width !== width) qualityCanvas.width = width;
  if (qualityCanvas.height !== height) qualityCanvas.height = height;
  const context = qualityCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not initialize the registration quality canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const qualityCopyStartedAt = onTimings ? performance.now() : 0;
  context.drawImage(source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  const qualityCopyMs = onTimings ? performance.now() - qualityCopyStartedAt : 0;
  return measureImageQuality(image, timings => onTimings?.({ ...timings, qualityCopyMs }));
}

export function imageQualityGuidance(quality: ImageQuality): string | null {
  if (quality.meanBrightness < REGISTRATION_MIN_BRIGHTNESS) return 'Too dark. Improve the lighting and try again.';
  if (quality.sharpness < REGISTRATION_MIN_SHARPNESS) return 'Image is blurry. Hold still and try again.';
  return null;
}

export function getMinimumPoseDescriptorDistance(descriptors: number[][]): number {
  if (descriptors.length < 2) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let i = 0; i < descriptors.length; i++) {
    for (let j = i + 1; j < descriptors.length; j++) {
      minimum = Math.min(minimum, euclideanDistance(descriptors[i]!, descriptors[j]!));
    }
  }
  return minimum;
}
