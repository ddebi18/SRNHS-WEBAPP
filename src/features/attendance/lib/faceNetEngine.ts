import * as faceapi from '@vladmandic/face-api';
import {
  MIN_LIVE_DETECTION_SCORE,
  MIN_LIVE_RECOGNITION_FACE_SIZE_PX,
  MIN_FACE_SIZE_PX,
  MIN_PHOTO_DETECTION_SCORE,
  MIN_REGISTER_DETECTION_SCORE,
  FACENET_DISTANCE_THRESHOLD,
  euclideanDistance,
  evaluateFacePartConsistency,
} from './faceNetMatcher';
import {
  FACE_DIAGNOSTICS_ENABLED,
  FACE_SELF_HOSTED_MODELS_ENABLED,
  FACE_STARTUP_OPTIMIZATIONS_ENABLED,
} from './faceOptimizationFlags';

const MODEL_URL = 'https://vladmandic.github.io/face-api/model';
const LOCAL_MODEL_URL = '/models/face-api-v1';
const LOW_LIGHT_MEAN_LUMA = 88;
const LOW_LIGHT_GAMMA = 0.68;

let modelsPromise: Promise<void> | null = null;

export function ensureFaceNetModels(): Promise<void> {
  if (!modelsPromise) {
    const startedAt = performance.now();
    const loadModel = async (net: { isLoaded: boolean; loadFromUri: (url: string) => Promise<unknown> }) => {
      if (FACE_SELF_HOSTED_MODELS_ENABLED) {
        try {
          await net.loadFromUri(LOCAL_MODEL_URL);
          return;
        } catch (error) {
          console.warn('[FaceNet] Self-hosted model load failed; falling back to the external model URL:', error);
        }
      }
      await net.loadFromUri(MODEL_URL);
    };
    const promise = Promise.all([
      loadModel(faceapi.nets.tinyFaceDetector).catch(() => {
        console.warn('[FaceNet] TinyFaceDetector unavailable; SSD will be used');
      }),
      loadModel(faceapi.nets.ssdMobilenetv1).catch(() => {
        console.warn('[FaceNet] SSD Mobilenet detector unavailable; other FaceNet stages will continue when possible');
      }),
      loadModel(faceapi.nets.faceLandmark68Net),
      loadModel(faceapi.nets.faceRecognitionNet),
    ]).then(() => {
      if (!faceapi.nets.tinyFaceDetector.isLoaded && !faceapi.nets.ssdMobilenetv1.isLoaded) {
        throw new Error('Face detection models could not be loaded.');
      }
      if (FACE_STARTUP_OPTIMIZATIONS_ENABLED) return warmUpFaceNetModels();
    }).catch(error => {
      modelsPromise = null;
      throw error;
    });
    void promise.then(
      () => {
        if (FACE_DIAGNOSTICS_ENABLED) {
          console.info(`[FaceNet] Models loaded${FACE_STARTUP_OPTIMIZATIONS_ENABLED ? ' and warmed' : ''} in ${(performance.now() - startedAt).toFixed(0)}ms.`);
        }
      },
      () => undefined
    );
    modelsPromise = promise;
  }
  return modelsPromise;
}

async function warmUpFaceNetModels(): Promise<void> {
  const warmupFrame = document.createElement('canvas');
  warmupFrame.width = 320;
  warmupFrame.height = 320;

  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    await faceapi.detectAllFaces(
      warmupFrame,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: MIN_LIVE_DETECTION_SCORE })
    );
  }
  if (faceapi.nets.ssdMobilenetv1.isLoaded) {
    await faceapi.detectAllFaces(
      warmupFrame,
      new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_LIVE_DETECTION_SCORE })
    );
  }
  const landmarks = await faceapi.nets.faceLandmark68Net.forward(warmupFrame);
  landmarks.dispose();
  await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(warmupFrame);
}

export type FaceDescriptorMode = 'legacy' | 'landmark_aligned' | 'keypoint_aligned';

export function resolveFaceDescriptorMode(
  keypointAlignmentEnabled: boolean,
  landmarkAlignmentEnabled: boolean
): FaceDescriptorMode {
  if (keypointAlignmentEnabled) return 'keypoint_aligned';
  if (landmarkAlignmentEnabled) return 'landmark_aligned';
  return 'legacy';
}

function enhanceCanvas(canvas: HTMLCanvasElement, gamma: number): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || gamma === 1.0) return canvas;

  const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = idata.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, Math.pow(d[i]! / 255, gamma) * 255 * 1.15);
    d[i + 1] = Math.min(255, Math.pow(d[i + 1]! / 255, gamma) * 255 * 1.15);
    d[i + 2] = Math.min(255, Math.pow(d[i + 2]! / 255, gamma) * 255 * 1.15);
  }
  ctx.putImageData(idata, 0, 0);
  return canvas;
}

function renderToCanvas(img: HTMLImageElement, gamma = 1.0): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width || 640;
  canvas.height = img.naturalHeight || img.height || 480;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    enhanceCanvas(canvas, gamma);
  }
  return canvas;
}

function renderVideoToCanvas(video: HTMLVideoElement, gamma = 1.0): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    enhanceCanvas(canvas, gamma);
  }
  return canvas;
}

function isLowLightVideo(video: HTMLVideoElement): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let totalLuma = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    totalLuma += 0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!;
  }
  return totalLuma / (pixels.length / 4) < LOW_LIGHT_MEAN_LUMA;
}

function shouldEnhanceLiveInput(input: HTMLVideoElement | HTMLCanvasElement): input is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement && isLowLightVideo(input);
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url.substring(0, 60)}...`));
    img.src = url;
  });
}

type DetectionWithDescriptor = faceapi.WithFaceDescriptor<
  faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>
>;

export interface FaceNetLiveDetection {
  box: { x: number; y: number; width: number; height: number };
  landmarks: Array<{ x: number; y: number }>;
  descriptor: Float32Array;
  score: number;
}

export interface FaceDetectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  score?: number;
  /** SCRFD 5-point landmarks: left eye, right eye, nose, left mouth, right mouth. */
  landmarks?: [number, number][];
  detectorSource?: 'scrfd' | 'fallback';
  predicted?: boolean;
  frameCapturedAt?: number;
  detectionResultAt?: number;
  frameTimestamp?: number;
  snapshotDurationMs?: number;
  scrfdDurationMs?: number;
}

export type FaceRegionQualityRejection =
  | 'below_minimum_face_size'
  | 'below_detection_confidence'
  | 'inconsistent_landmarks';

export interface FaceRegionQualityAssessment {
  score: number;
  faceSizePx: number;
  detectorScore: number;
  sizeScore: number;
  sharpnessVariance: number;
  poseScore: number;
  usable: boolean;
  reason?: 'below_minimum_face_size' | 'below_detection_confidence' | 'blurry' | 'poor_pose';
  crop: HTMLCanvasElement;
  cropX: number;
  cropY: number;
}

export function captureFaceFrame(video: HTMLVideoElement): {
  source: HTMLCanvasElement;
  capturedAt: number;
  frameTimestamp: number;
} {
  const source = document.createElement('canvas');
  source.width = video.videoWidth || 640;
  source.height = video.videoHeight || 480;
  const context = source.getContext('2d');
  if (!context) throw new Error('Could not create the face frame snapshot.');
  const capturedAt = performance.now();
  const frameTimestamp = video.currentTime;
  context.drawImage(video, 0, 0, source.width, source.height);
  return { source, capturedAt, frameTimestamp };
}

export type FaceCropRetryStep = 'initial' | 'larger_padding_40' | 'lower_score' | 'ssd_mobilenet';

export type FaceCropFailureReason =
  | 'no_face_in_crop'
  | 'inference_error'
  | 'low_score'
  | 'misaligned'
  | 'quality_rejected';

export interface FaceCropRetryAttempt {
  step: FaceCropRetryStep;
  failureReason: FaceCropFailureReason | null;
  durationMs: number;
  detector?: 'tiny' | 'ssd';
  detectorInputSize?: number;
  centerDriftPx?: number;
  faceSizePx?: number;
  error?: string;
}

export type FaceRegionRecognitionResult = (
  | {
      region: FaceDetectionRegion;
      status: 'descriptor';
      detection: FaceNetLiveDetection;
      durationMs: number;
      source: 'aligned' | 'landmark_aligned' | 'crop' | 'full_frame_fallback';
      fallbackDurationMs?: number;
    }
  | {
      region: FaceDetectionRegion;
      status: 'quality_rejected';
      reason: FaceRegionQualityRejection;
      durationMs: number;
    }
  | {
      region: FaceDetectionRegion;
      status: 'failed';
      reason: string;
      durationMs: number;
    }
  | {
      region: FaceDetectionRegion;
      status: 'skipped';
      reason: 'descriptor_budget' | 'reverify_not_due' | 'low_quality' | 'retry_budget_exhausted' | 'motion_time_budget';
      durationMs: 0;
    }
) & {
  retryAttempts?: FaceCropRetryAttempt[];
  retryStepSucceeded?: FaceCropRetryStep;
};

function getQualityRejection(
  detection: DetectionWithDescriptor | undefined | null,
  minScore: number,
  minFaceSize: number
): FaceRegionQualityRejection | null {
  if (!detection) return null;
  const box = detection.detection.box;
  if (box.width < minFaceSize || box.height < minFaceSize) return 'below_minimum_face_size';
  if (typeof detection.detection.score === 'number' && detection.detection.score < minScore) {
    return 'below_detection_confidence';
  }
  if (!evaluateFacePartConsistency(detection.landmarks.positions, box)) {
    return 'inconsistent_landmarks';
  }
  return null;
}

function isQualityDetection(
  detection: DetectionWithDescriptor | undefined | null,
  minScore: number,
  minFaceSize = MIN_FACE_SIZE_PX
): detection is DetectionWithDescriptor {
  return Boolean(detection) && getQualityRejection(detection, minScore, minFaceSize) === null;
}

async function hasAtLeastOneFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  detector: faceapi.TinyFaceDetectorOptions | faceapi.SsdMobilenetv1Options
): Promise<boolean> {
  const detections = await faceapi.detectAllFaces(input, detector);
  return detections.length >= 1;
}

export async function detectLiveFace(
  input: HTMLVideoElement | HTMLCanvasElement
): Promise<DetectionWithDescriptor | null> {
  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    const enhancedInput = shouldEnhanceLiveInput(input)
      ? renderVideoToCanvas(input, LOW_LIGHT_GAMMA)
      : null;
    try {
      const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: MIN_LIVE_DETECTION_SCORE,
        });
      if (await hasAtLeastOneFace(input, options)) {
        const detection = await faceapi
          .detectSingleFace(input, options)
        .withFaceLandmarks()
        .withFaceDescriptor();
        if (isQualityDetection(detection, MIN_LIVE_DETECTION_SCORE) && !enhancedInput) return detection;
      }

      if (enhancedInput) {
        if (await hasAtLeastOneFace(enhancedInput, options)) {
          const enhancedDetection = await faceapi
            .detectSingleFace(enhancedInput, options)
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (isQualityDetection(enhancedDetection, MIN_LIVE_DETECTION_SCORE)) return enhancedDetection;
        }
      }
    } catch {
      // Keep the camera loop moving if a single inference frame fails.
    }
  }
  return null;
}

export async function detectAllLiveFaces(
  input: HTMLVideoElement | HTMLCanvasElement,
  minScore = MIN_LIVE_DETECTION_SCORE
): Promise<FaceNetLiveDetection[]> {
  const enhancedInput = shouldEnhanceLiveInput(input)
    ? renderVideoToCanvas(input, LOW_LIGHT_GAMMA)
    : null;
  const target = enhancedInput || input;

  const detections: DetectionWithDescriptor[] = [];

  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: minScore,
      });
      const tinyDetections = await faceapi
        .detectAllFaces(target, options)
        .withFaceLandmarks()
        .withFaceDescriptors();
      detections.push(...tinyDetections.filter(d =>
        isQualityDetection(d, minScore, MIN_LIVE_RECOGNITION_FACE_SIZE_PX)
      ));
    } catch (error) {
      console.warn('[FaceNet] TinyFaceDetector multi-face scan failed:', error);
    }
  }

  if (faceapi.nets.ssdMobilenetv1.isLoaded) {
    try {
      const options = new faceapi.SsdMobilenetv1Options({ minConfidence: minScore });
      const ssdDetections = await faceapi
        .detectAllFaces(target, options)
        .withFaceLandmarks()
        .withFaceDescriptors();
      for (const candidate of ssdDetections.filter(d =>
        isQualityDetection(d, minScore, MIN_LIVE_RECOGNITION_FACE_SIZE_PX)
      )) {
        const candidateBox = candidate.detection.box;
        const duplicateIndex = detections.findIndex(existing => {
          const existingBox = existing.detection.box;
          const intersectionWidth = Math.max(
            0,
            Math.min(candidateBox.x + candidateBox.width, existingBox.x + existingBox.width) -
              Math.max(candidateBox.x, existingBox.x)
          );
          const intersectionHeight = Math.max(
            0,
            Math.min(candidateBox.y + candidateBox.height, existingBox.y + existingBox.height) -
              Math.max(candidateBox.y, existingBox.y)
          );
          const intersection = intersectionWidth * intersectionHeight;
          const union = candidateBox.width * candidateBox.height +
            existingBox.width * existingBox.height - intersection;
          const overlap = union > 0 ? intersection / union : 0;
          const centerDistance = Math.hypot(
            candidateBox.x + candidateBox.width / 2 - (existingBox.x + existingBox.width / 2),
            candidateBox.y + candidateBox.height / 2 - (existingBox.y + existingBox.height / 2)
          );
          return overlap >= 0.35 || centerDistance < Math.min(candidateBox.width, candidateBox.height) * 0.25;
        });
        if (duplicateIndex < 0) {
          detections.push(candidate);
        } else if (
          (candidate.detection.score ?? 0) >
          (detections[duplicateIndex]?.detection.score ?? 0)
        ) {
          detections[duplicateIndex] = candidate;
        }
      }
    } catch (error) {
      console.warn('[FaceNet] SSD multi-face scan failed:', error);
    }
  }

  return detections.map(detection => ({
    box: detection.detection.box,
    landmarks: detection.landmarks.positions.map(point => ({ x: point.x, y: point.y })),
    descriptor: detection.descriptor,
    score: detection.detection.score,
  }));
}

export async function detectLiveFaceRegions(
  input: HTMLVideoElement | HTMLCanvasElement,
  minScore = MIN_LIVE_DETECTION_SCORE
): Promise<FaceDetectionRegion[]> {
  const target = shouldEnhanceLiveInput(input)
    ? renderVideoToCanvas(input, LOW_LIGHT_GAMMA)
    : input;
  const options = faceapi.nets.tinyFaceDetector.isLoaded
    ? new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minScore })
    : faceapi.nets.ssdMobilenetv1.isLoaded
      ? new faceapi.SsdMobilenetv1Options({ minConfidence: minScore })
      : null;
  if (!options) return [];

  const detections = await faceapi.detectAllFaces(target, options);
  return detections.flatMap(detection => {
    const box = detection.box;
    if (
      box.width < MIN_LIVE_RECOGNITION_FACE_SIZE_PX ||
      box.height < MIN_LIVE_RECOGNITION_FACE_SIZE_PX ||
      detection.score < minScore
    ) return [];
    return [{
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      score: detection.score,
    }];
  });
}

export function measureLaplacianVariance(pixels: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3 || pixels.length < width * height * 4) return 0;
  const gray = new Float32Array(width * height);
  for (let index = 0; index < gray.length; index++) {
    const pixel = index * 4;
    gray[index] = 0.299 * pixels[pixel]! + 0.587 * pixels[pixel + 1]! + 0.114 * pixels[pixel + 2]!;
  }
  let sum = 0;
  let squaredSum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const laplacian = gray[index - width]! + gray[index - 1]! - 4 * gray[index]! +
        gray[index + 1]! + gray[index + width]!;
      sum += laplacian;
      squaredSum += laplacian * laplacian;
      count++;
    }
  }
  const mean = sum / count;
  return Math.max(0, squaredSum / count - mean * mean);
}

export function analyzeFaceRegionQuality(
  input: HTMLVideoElement | HTMLCanvasElement,
  region: FaceDetectionRegion,
  minFaceSize = 60,
  minSharpnessVariance = 0,
  reusableCanvas?: HTMLCanvasElement
): FaceRegionQualityAssessment {
  const isVideo = typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement;
  const inputWidth = isVideo ? input.videoWidth : input.width;
  const inputHeight = isVideo ? input.videoHeight : input.height;
  const paddingX = Math.max(8, region.width * 0.2);
  const paddingY = Math.max(8, region.height * 0.2);
  const cropX = Math.max(0, Math.floor(region.x - paddingX));
  const cropY = Math.max(0, Math.floor(region.y - paddingY));
  const cropRight = Math.min(inputWidth, Math.ceil(region.x + region.width + paddingX));
  const cropBottom = Math.min(inputHeight, Math.ceil(region.y + region.height + paddingY));
  const crop = reusableCanvas ?? document.createElement('canvas');
  if (crop.width !== cropRight - cropX) crop.width = cropRight - cropX;
  if (crop.height !== cropBottom - cropY) crop.height = cropBottom - cropY;
  let sharpnessVariance = 0;
  let assessmentFailed = false;
  try {
    const context = crop.getContext('2d', { willReadFrequently: true });
    if (!context || crop.width <= 0 || crop.height <= 0) {
      assessmentFailed = true;
    } else {
      context.drawImage(input, cropX, cropY, crop.width, crop.height, 0, 0, crop.width, crop.height);
      sharpnessVariance = measureLaplacianVariance(
        context.getImageData(0, 0, crop.width, crop.height).data,
        crop.width,
        crop.height
      );
    }
  } catch (error) {
    assessmentFailed = true;
    if (import.meta.env.DEV) {
      console.warn('[FaceRecognition] Quality assessment failed; allowing descriptor attempt:', error);
    }
  }
  const detectorScore = region.score ?? 1;
  const sizeScore = Math.min(1, Math.min(region.width, region.height) / 120);
  const faceSizePx = Math.min(region.width, region.height);
  const sharpnessScore = Math.min(1, sharpnessVariance / 100);
  let poseScore = 1;
  if (hasScrfdKeypoints(region.landmarks)) {
    const leftEye = region.landmarks[0]!;
    const rightEye = region.landmarks[1]!;
    const nose = region.landmarks[2]!;
    const leftMouth = region.landmarks[3]!;
    const rightMouth = region.landmarks[4]!;
    const eyeDistance = Math.hypot(rightEye[0] - leftEye[0], rightEye[1] - leftEye[1]);
    if (eyeDistance > 0) {
      const roll = Math.abs(Math.atan2(rightEye[1] - leftEye[1], rightEye[0] - leftEye[0]) * 180 / Math.PI);
      const leftNoseDistance = Math.hypot(nose[0] - leftEye[0], nose[1] - leftEye[1]);
      const rightNoseDistance = Math.hypot(nose[0] - rightEye[0], nose[1] - rightEye[1]);
      const yawBalance = 1 - Math.abs(leftNoseDistance - rightNoseDistance) /
        Math.max(1, leftNoseDistance + rightNoseDistance);
      const eyeY = (leftEye[1] + rightEye[1]) / 2;
      const mouthY = (leftMouth[1] + rightMouth[1]) / 2;
      const noseRatio = (nose[1] - eyeY) / Math.max(1, mouthY - eyeY);
      const pitchBalance = Math.max(0, 1 - Math.abs(noseRatio - 0.5) * 1.5);
      poseScore = Math.max(0, 1 - roll / 60) * yawBalance * pitchBalance;
    }
  }
  const reason = assessmentFailed
    ? undefined
    : region.width < minFaceSize || region.height < minFaceSize
    ? 'below_minimum_face_size'
    : detectorScore < MIN_LIVE_DETECTION_SCORE
      ? 'below_detection_confidence'
      : sharpnessVariance < minSharpnessVariance
        ? 'blurry'
        : poseScore < 0.25
          ? 'poor_pose'
          : undefined;
  return {
    score: sizeScore * 0.2 + detectorScore * 0.2 + sharpnessScore * 0.4 + poseScore * 0.2,
    faceSizePx,
    detectorScore,
    sizeScore,
    sharpnessVariance,
    poseScore,
    usable: !reason,
    reason,
    crop,
    cropX,
    cropY,
  };
}

let regionCropCanvas: HTMLCanvasElement | null = null;

function getRegionCropCanvas(): HTMLCanvasElement {
  // face-api toNetInput() only accepts HTMLCanvasElement, not OffscreenCanvas.
  if (!regionCropCanvas || !(regionCropCanvas instanceof HTMLCanvasElement)) {
    regionCropCanvas = document.createElement('canvas');
  }
  return regionCropCanvas;
}

export const FACE_RECOGNITION_NET_INPUT_SIZE = 150;
const ARC_FACE_112_TEMPLATE: Array<[number, number]> = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];
const TEMPLATE_SCALE = FACE_RECOGNITION_NET_INPUT_SIZE / 112;
export const FACE_NET_FIVE_POINT_TEMPLATE: Array<[number, number]> = ARC_FACE_112_TEMPLATE.map(
  ([x, y]) => [x * TEMPLATE_SCALE, y * TEMPLATE_SCALE]
);

export interface SimilarityTransform {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export function hasScrfdKeypoints(
  landmarks: [number, number][] | undefined
): landmarks is [number, number][] {
  return Boolean(
    landmarks &&
    landmarks.length === 5 &&
    landmarks.every(point =>
      Number.isFinite(point[0]) && Number.isFinite(point[1])
    )
  );
}

export function estimateSimilarityTransform(
  source: Array<[number, number]>,
  destination: Array<[number, number]>
): SimilarityTransform | null {
  const count = Math.min(source.length, destination.length);
  if (count < 2) return null;

  let srcMeanX = 0;
  let srcMeanY = 0;
  let dstMeanX = 0;
  let dstMeanY = 0;
  for (let i = 0; i < count; i++) {
    srcMeanX += source[i]![0];
    srcMeanY += source[i]![1];
    dstMeanX += destination[i]![0];
    dstMeanY += destination[i]![1];
  }
  srcMeanX /= count;
  srcMeanY /= count;
  dstMeanX /= count;
  dstMeanY /= count;

  let srcVar = 0;
  let c00 = 0;
  let c01 = 0;
  let c10 = 0;
  let c11 = 0;
  for (let i = 0; i < count; i++) {
    const sx = source[i]![0] - srcMeanX;
    const sy = source[i]![1] - srcMeanY;
    const dx = destination[i]![0] - dstMeanX;
    const dy = destination[i]![1] - dstMeanY;
    srcVar += sx * sx + sy * sy;
    c00 += sx * dx;
    c01 += sx * dy;
    c10 += sy * dx;
    c11 += sy * dy;
  }
  if (srcVar < 1e-6) return null;

  const a = (c00 + c11) / srcVar;
  const b = (c01 - c10) / srcVar;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a * a + b * b < 1e-8) return null;

  return {
    a,
    b,
    tx: dstMeanX - a * srcMeanX + b * srcMeanY,
    ty: dstMeanY - b * srcMeanX - a * srcMeanY,
  };
}

function drawAlignedFace(
  input: HTMLVideoElement | HTMLCanvasElement,
  keypoints: [number, number][],
  canvas: HTMLCanvasElement
): boolean {
  const transform = estimateSimilarityTransform(keypoints, FACE_NET_FIVE_POINT_TEMPLATE);
  if (!transform) return false;
  canvas.width = FACE_RECOGNITION_NET_INPUT_SIZE;
  canvas.height = FACE_RECOGNITION_NET_INPUT_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(transform.a, transform.b, -transform.b, transform.a, transform.tx, transform.ty);
  context.drawImage(input, 0, 0);
  context.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}

async function computeDescriptorFromCanvas(canvas: HTMLCanvasElement): Promise<Float32Array | null> {
  if (!faceapi.nets.faceRecognitionNet.isLoaded) return null;
  const descriptor = await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(canvas);
  if (descriptor instanceof Float32Array) return descriptor;
  if (Array.isArray(descriptor) && descriptor[0] instanceof Float32Array) return descriptor[0];
  return null;
}

export async function describeScrfdFaceRegions(
  input: HTMLVideoElement | HTMLCanvasElement,
  regions: FaceDetectionRegion[],
  minScore = MIN_LIVE_DETECTION_SCORE,
  mode: FaceDescriptorMode = 'legacy'
): Promise<FaceRegionRecognitionResult[]> {
  const isVideo = typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement;
  const inputWidth = isVideo ? input.videoWidth : input.width;
  const inputHeight = isVideo ? input.videoHeight : input.height;
  const canvas = getRegionCropCanvas();
  const recognizeAligned = async (
    region: FaceDetectionRegion,
    keypoints: [number, number][],
    cropCanvas: HTMLCanvasElement
  ): Promise<FaceRegionRecognitionResult> => {
    const startedAt = performance.now();
    try {
      if (region.width < MIN_LIVE_RECOGNITION_FACE_SIZE_PX || region.height < MIN_LIVE_RECOGNITION_FACE_SIZE_PX) {
        return {
          region,
          status: 'quality_rejected',
          reason: 'below_minimum_face_size',
          durationMs: performance.now() - startedAt,
        };
      }
      if (!drawAlignedFace(input, keypoints, cropCanvas)) {
        return {
          region,
          status: 'failed',
          reason: 'align_transform_failed',
          durationMs: performance.now() - startedAt,
        };
      }
      const descriptor = await computeDescriptorFromCanvas(cropCanvas);
      if (!descriptor) {
        return {
          region,
          status: 'failed',
          reason: 'aligned_descriptor_unavailable',
          durationMs: performance.now() - startedAt,
        };
      }
      return {
        region,
        status: 'descriptor',
        detection: {
          box: { x: region.x, y: region.y, width: region.width, height: region.height },
          landmarks: keypoints.map(([x, y]) => ({ x, y })),
          descriptor,
          score: region.score ?? 1,
        },
        durationMs: performance.now() - startedAt,
        source: 'aligned',
      };
    } catch (error) {
      return {
        region,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        durationMs: performance.now() - startedAt,
      };
    }
  };
  const recognizeRegion = async (
    region: FaceDetectionRegion,
    cropCanvas: HTMLCanvasElement
  ): Promise<FaceRegionRecognitionResult> => {
    if (mode === 'keypoint_aligned' && hasScrfdKeypoints(region.landmarks)) {
      return recognizeAligned(region, region.landmarks, cropCanvas);
    }
    const startedAt = performance.now();
    try {
      const paddingX = Math.max(8, region.width * 0.2);
      const paddingY = Math.max(8, region.height * 0.2);
      const cropX = Math.max(0, Math.floor(region.x - paddingX));
      const cropY = Math.max(0, Math.floor(region.y - paddingY));
      const cropRight = Math.min(inputWidth, Math.ceil(region.x + region.width + paddingX));
      const cropBottom = Math.min(inputHeight, Math.ceil(region.y + region.height + paddingY));
      const cropWidth = cropRight - cropX;
      const cropHeight = cropBottom - cropY;
      if (cropWidth <= 0 || cropHeight <= 0) {
        return {
          region,
          status: 'failed',
          reason: 'invalid_crop_bounds',
          durationMs: performance.now() - startedAt,
        };
      }

      cropCanvas.width = cropWidth;
      cropCanvas.height = cropHeight;
      const cropContext = cropCanvas.getContext('2d', { willReadFrequently: true });
      if (!cropContext) {
        return {
          region,
          status: 'failed',
          reason: 'canvas_context_unavailable',
          durationMs: performance.now() - startedAt,
        };
      }
      cropContext.clearRect(0, 0, cropWidth, cropHeight);
      cropContext.drawImage(input, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      if (mode === 'landmark_aligned') {
        if (region.width < MIN_LIVE_RECOGNITION_FACE_SIZE_PX || region.height < MIN_LIVE_RECOGNITION_FACE_SIZE_PX) {
          return {
            region,
            status: 'quality_rejected',
            reason: 'below_minimum_face_size',
            durationMs: performance.now() - startedAt,
          };
        }
        if (typeof region.score === 'number' && region.score < minScore) {
          return {
            region,
            status: 'quality_rejected',
            reason: 'below_detection_confidence',
            durationMs: performance.now() - startedAt,
          };
        }
        const [faceCrop] = await faceapi.extractFaces(cropCanvas, [
          new faceapi.Rect(region.x - cropX, region.y - cropY, region.width, region.height),
        ]);
        if (!faceCrop) {
          return {
            region,
            status: 'failed',
            reason: 'scrfd_face_crop_unavailable',
            durationMs: performance.now() - startedAt,
          };
        }
        const landmarks = await faceapi.nets.faceLandmark68Net.detectLandmarks(faceCrop);
        const faceLandmarks = Array.isArray(landmarks) ? landmarks[0] : landmarks;
        if (!faceLandmarks) {
          return {
            region,
            status: 'failed',
            reason: 'no_landmarks_in_crop',
            durationMs: performance.now() - startedAt,
          };
        }
        if (!evaluateFacePartConsistency(faceLandmarks.positions, {
          x: 0,
          y: 0,
          width: region.width,
          height: region.height,
        })) {
          return {
            region,
            status: 'quality_rejected',
            reason: 'inconsistent_landmarks',
            durationMs: performance.now() - startedAt,
          };
        }
        const alignedBox = faceLandmarks.align(null, { useDlibAlignment: true });
        const [alignedCanvas] = await faceapi.extractFaces(faceCrop, [alignedBox]);
        if (!alignedCanvas) {
          return {
            region,
            status: 'failed',
            reason: 'aligned_crop_unavailable',
            durationMs: performance.now() - startedAt,
          };
        }
        const descriptor = await computeDescriptorFromCanvas(alignedCanvas);
        if (!descriptor) {
          return {
            region,
            status: 'failed',
            reason: 'aligned_descriptor_unavailable',
            durationMs: performance.now() - startedAt,
          };
        }
        return {
          region,
          status: 'descriptor',
          detection: {
            box: { x: region.x, y: region.y, width: region.width, height: region.height },
            landmarks: faceLandmarks.positions.map(point => ({
              x: region.x + point.x,
              y: region.y + point.y,
            })),
            descriptor,
            score: region.score ?? 1,
          },
          durationMs: performance.now() - startedAt,
          source: 'landmark_aligned',
        };
      }

      const options = faceapi.nets.tinyFaceDetector.isLoaded
        ? new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minScore })
        : new faceapi.SsdMobilenetv1Options({ minConfidence: minScore });
      const detection = await faceapi
        .detectSingleFace(cropCanvas, options)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!detection) {
        return {
          region,
          status: 'failed',
          reason: 'no_face_in_crop',
          durationMs: performance.now() - startedAt,
        };
      }
      const rejection = getQualityRejection(
        detection,
        minScore,
        MIN_LIVE_RECOGNITION_FACE_SIZE_PX
      );
      if (rejection) {
        return {
          region,
          status: 'quality_rejected',
          reason: rejection,
          durationMs: performance.now() - startedAt,
        };
      }

      const detectedBox = detection.detection.box;
      return {
        region,
        status: 'descriptor',
        detection: {
          box: {
            x: cropX + detectedBox.x,
            y: cropY + detectedBox.y,
            width: detectedBox.width,
            height: detectedBox.height,
          },
          landmarks: detection.landmarks.positions.map(point => ({
            x: cropX + point.x,
            y: cropY + point.y,
          })),
          descriptor: detection.descriptor,
          score: detection.detection.score,
        },
        durationMs: performance.now() - startedAt,
        source: 'crop',
      };
    } catch (error) {
      return {
        region,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        durationMs: performance.now() - startedAt,
      };
    }
  };

  const results = new Array<FaceRegionRecognitionResult>(regions.length);
  for (let index = 0; index < regions.length; index++) {
    results[index] = await recognizeRegion(regions[index]!, canvas);
  }

  return results;
}

export async function describePaddedFaceCrop(
  region: FaceDetectionRegion,
  crop: HTMLCanvasElement,
  cropX: number,
  cropY: number,
  minScore = MIN_LIVE_DETECTION_SCORE,
  input?: HTMLVideoElement | HTMLCanvasElement,
  allowRetries = true,
  options?: {
    preferredStep?: FaceCropRetryStep;
    maxDetectorPasses?: number;
    detectorInputSize?: number;
    shouldStop?: () => boolean;
    logAttempts?: boolean;
    onConsoleLogDuration?: (durationMs: number) => void;
  }
): Promise<FaceRegionRecognitionResult> {
  const startedAt = performance.now();
  const attempts: FaceCropRetryAttempt[] = [];
  const initialDetector = faceapi.nets.tinyFaceDetector.isLoaded
    ? 'tiny'
    : faceapi.nets.ssdMobilenetv1.isLoaded
      ? 'ssd'
      : null;
  const run = async (
    step: FaceCropRetryStep,
    targetCrop: HTMLCanvasElement,
    targetX: number,
    targetY: number,
    detector: 'tiny' | 'ssd',
    scoreThreshold: number,
    detectorInputSize = 416,
    setupDurationMs = 0
  ): Promise<FaceRegionRecognitionResult> => {
    const attemptStartedAt = performance.now();
    const record = (
      failureReason: FaceCropFailureReason | null,
      extra: Pick<FaceCropRetryAttempt, 'centerDriftPx' | 'faceSizePx' | 'error'> = {}
    ) => attempts.push({
      step,
      failureReason,
      durationMs: performance.now() - attemptStartedAt + setupDurationMs,
      detector,
      detectorInputSize: detector === 'tiny' ? detectorInputSize : undefined,
      ...extra,
    });
    try {
      if (detector === 'tiny' && !faceapi.nets.tinyFaceDetector.isLoaded) {
        throw new Error('TinyFaceDetector is not loaded.');
      }
      if (detector === 'ssd' && !faceapi.nets.ssdMobilenetv1.isLoaded) {
        throw new Error('SSD Mobilenet is not loaded.');
      }
      const detectorOptions = detector === 'tiny'
        ? new faceapi.TinyFaceDetectorOptions({ inputSize: detectorInputSize, scoreThreshold })
        : new faceapi.SsdMobilenetv1Options({ minConfidence: scoreThreshold });
      const detection = await faceapi
        .detectSingleFace(targetCrop, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!detection) {
        record('no_face_in_crop');
        return { region, status: 'failed', reason: 'no_face_in_crop', durationMs: 0 };
      }
      const rejection = getQualityRejection(detection, scoreThreshold, MIN_LIVE_RECOGNITION_FACE_SIZE_PX);
      if (rejection) {
        const failureReason: FaceCropFailureReason = rejection === 'below_detection_confidence'
          ? 'low_score'
          : rejection === 'inconsistent_landmarks'
            ? 'misaligned'
            : 'quality_rejected';
        const faceSizePx = Math.min(detection.detection.box.width, detection.detection.box.height);
        const positions = detection.landmarks.positions;
        const landmarkCenter = positions.reduce(
          (center, point) => ({ x: center.x + point.x, y: center.y + point.y }),
          { x: 0, y: 0 }
        );
        const centerDriftPx = positions.length > 0
          ? Math.hypot(
              landmarkCenter.x / positions.length -
                (detection.detection.box.x + detection.detection.box.width / 2),
              landmarkCenter.y / positions.length -
                (detection.detection.box.y + detection.detection.box.height / 2)
            )
          : null;
        record(failureReason, {
          ...(centerDriftPx === null ? {} : { centerDriftPx }),
          faceSizePx,
        });
        if (failureReason === 'misaligned' && options?.logAttempts) {
          const logStartedAt = performance.now();
          console.info('[FaceRecognition] Misaligned crop rejection (threshold unchanged)', {
            step,
            centerDriftPx,
            faceSizePx,
            detectorInputSize,
            reason: 'Face landmarks failed evaluateFacePartConsistency; centerDriftPx is diagnostic only.',
          });
          options.onConsoleLogDuration?.(performance.now() - logStartedAt);
        }
        return { region, status: 'quality_rejected', reason: rejection, durationMs: 0 };
      }
      record(null);
      const box = detection.detection.box;
      return {
        region,
        status: 'descriptor',
        detection: {
          box: { x: targetX + box.x, y: targetY + box.y, width: box.width, height: box.height },
          landmarks: detection.landmarks.positions.map(point => ({ x: targetX + point.x, y: targetY + point.y })),
          descriptor: detection.descriptor,
          score: detection.detection.score,
        },
        durationMs: 0,
        source: 'crop',
      };
    } catch (error) {
      record('inference_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        region,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        durationMs: 0,
      };
    }
  };
  const finish = (result: FaceRegionRecognitionResult, step: FaceCropRetryStep): FaceRegionRecognitionResult => {
    result.durationMs = performance.now() - startedAt;
    result.retryAttempts = attempts;
    if (result.status === 'descriptor') result.retryStepSucceeded = step;
    return result;
  };

  if (!initialDetector) {
    attempts.push({
      step: 'initial',
      failureReason: 'inference_error',
      durationMs: 0,
      error: 'No face detector is loaded for the padded crop.',
    });
    return finish({
      region,
      status: 'failed',
      reason: 'No face detector is loaded for the padded crop.',
      durationMs: 0,
    }, 'initial');
  }
  const defaultOrder: FaceCropRetryStep[] = options?.preferredStep
    ? [options.preferredStep, 'initial', 'larger_padding_40', 'lower_score', 'ssd_mobilenet']
    : ['initial', 'larger_padding_40', 'lower_score', 'ssd_mobilenet'];
  const order = defaultOrder.filter((step, index) => defaultOrder.indexOf(step) === index);
  const maxDetectorPasses = options?.maxDetectorPasses === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.floor(options.maxDetectorPasses));
  let retryCrop: HTMLCanvasElement | null = null;
  let retryCropPreparationMs = 0;
  let retryCropPreparationIncluded = false;
  let retryX = cropX;
  let retryY = cropY;
  let result: FaceRegionRecognitionResult = {
    region,
    status: 'failed',
    reason: 'no_face_in_crop',
    durationMs: 0,
  };
  const stopForBudget = (): FaceRegionRecognitionResult => finish({
    region,
    status: 'skipped',
    reason: 'motion_time_budget',
    durationMs: 0,
  }, attempts[attempts.length - 1]?.step ?? 'initial');
  if (options?.shouldStop?.()) return stopForBudget();
  const makeLargerCrop = (): boolean => {
    if (retryCrop) return true;
    if (!input) {
      retryCrop = crop;
      return true;
    }
    const cropStartedAt = performance.now();
    try {
      const inputIsVideo = typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement;
      const inputWidth = inputIsVideo ? input.videoWidth : input.width;
      const inputHeight = inputIsVideo ? input.videoHeight : input.height;
      const paddingX = Math.max(8, region.width * 0.4);
      const paddingY = Math.max(8, region.height * 0.4);
      retryX = Math.max(0, Math.floor(region.x - paddingX));
      retryY = Math.max(0, Math.floor(region.y - paddingY));
      const right = Math.min(inputWidth, Math.ceil(region.x + region.width + paddingX));
      const bottom = Math.min(inputHeight, Math.ceil(region.y + region.height + paddingY));
      retryCrop = document.createElement('canvas');
      retryCrop.width = right - retryX;
      retryCrop.height = bottom - retryY;
      const context = retryCrop.getContext('2d');
      if (!context || retryCrop.width <= 0 || retryCrop.height <= 0) {
        throw new Error('Could not create the larger padded face crop.');
      }
      context.drawImage(input, retryX, retryY, retryCrop.width, retryCrop.height, 0, 0, retryCrop.width, retryCrop.height);
      retryCropPreparationMs = performance.now() - cropStartedAt;
      return true;
    } catch (error) {
      attempts.push({
        step: 'larger_padding_40',
        failureReason: 'inference_error',
        durationMs: performance.now() - cropStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  if (!allowRetries) {
    result = await run(
      'initial',
      crop,
      cropX,
      cropY,
      initialDetector,
      minScore,
      options?.detectorInputSize ?? 416
    );
    return finish(result, 'initial');
  }

  let detectorPasses = 0;
  for (const step of order) {
    if (options?.shouldStop?.()) return stopForBudget();
    if (step === 'ssd_mobilenet' && (!faceapi.nets.ssdMobilenetv1.isLoaded || initialDetector === 'ssd')) continue;
    if (detectorPasses >= maxDetectorPasses) break;
    const isInitial = step === 'initial';
    const needsLargerCrop = !isInitial;
    if (needsLargerCrop && !makeLargerCrop()) {
      return finish({
        region,
        status: 'failed',
        reason: attempts[attempts.length - 1]?.error ?? 'Could not create the larger padded face crop.',
        durationMs: 0,
      }, step);
    }
    const detector = step === 'ssd_mobilenet' ? 'ssd' : initialDetector;
    const sourceCrop = isInitial ? crop : retryCrop!;
    const sourceX = isInitial ? cropX : retryX;
    const sourceY = isInitial ? cropY : retryY;
    const scoreThreshold = step === 'lower_score' || step === 'ssd_mobilenet'
      ? Math.min(minScore, 0.1)
      : minScore;
    const setupDurationMs = needsLargerCrop && !retryCropPreparationIncluded
      ? retryCropPreparationMs
      : 0;
    if (needsLargerCrop) retryCropPreparationIncluded = true;
    detectorPasses++;
    result = await run(
      step,
      sourceCrop,
      sourceX,
      sourceY,
      detector,
      scoreThreshold,
      detectorPasses === 1 ? options?.detectorInputSize ?? 416 : 416,
      setupDurationMs
    );
    if (
      result.status === 'descriptor' ||
      result.status === 'quality_rejected' ||
      result.reason !== 'no_face_in_crop'
    ) {
      return finish(result, step);
    }
  }
  if (
    detectorPasses >= maxDetectorPasses &&
    result.status === 'failed' &&
    result.reason === 'no_face_in_crop' &&
    order.some(step =>
      !attempts.some(attempt => attempt.step === step) &&
      (step !== 'ssd_mobilenet' ||
        (faceapi.nets.ssdMobilenetv1.isLoaded && initialDetector !== 'ssd'))
    )
  ) {
    return finish({
      region,
      status: 'skipped',
      reason: 'retry_budget_exhausted',
      durationMs: 0,
    }, attempts[attempts.length - 1]?.step ?? 'initial');
  }
  return finish(result, attempts[attempts.length - 1]?.step ?? 'initial');
}

export async function compareFacePaddingDescriptors(
  region: FaceDetectionRegion,
  input: HTMLVideoElement | HTMLCanvasElement,
  minScore = MIN_LIVE_DETECTION_SCORE
): Promise<{ distance: number | null; twentyPercent: boolean; fortyPercent: boolean }> {
  const inputIsVideo = typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement;
  const width = inputIsVideo ? input.videoWidth : input.width;
  const height = inputIsVideo ? input.videoHeight : input.height;
  const snapshot = document.createElement('canvas');
  snapshot.width = width;
  snapshot.height = height;
  const snapshotContext = snapshot.getContext('2d');
  if (!snapshotContext) throw new Error('Could not create a padding comparison frame.');
  snapshotContext.drawImage(input, 0, 0, width, height);

  const detector = faceapi.nets.tinyFaceDetector.isLoaded ? 'tiny' : 'ssd';
  const describePadding = async (padding: number): Promise<Float32Array | null> => {
    const paddingX = Math.max(8, region.width * padding);
    const paddingY = Math.max(8, region.height * padding);
    const x = Math.max(0, Math.floor(region.x - paddingX));
    const y = Math.max(0, Math.floor(region.y - paddingY));
    const right = Math.min(width, Math.ceil(region.x + region.width + paddingX));
    const bottom = Math.min(height, Math.ceil(region.y + region.height + paddingY));
    const crop = document.createElement('canvas');
    crop.width = right - x;
    crop.height = bottom - y;
    const context = crop.getContext('2d');
    if (!context || crop.width <= 0 || crop.height <= 0) return null;
    context.drawImage(snapshot, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const options = detector === 'tiny'
      ? new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minScore })
      : new faceapi.SsdMobilenetv1Options({ minConfidence: minScore });
    const detection = await faceapi.detectSingleFace(crop, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection && getQualityRejection(
      detection,
      minScore,
      MIN_LIVE_RECOGNITION_FACE_SIZE_PX
    ) === null
      ? detection.descriptor
      : null;
  };
  const twenty = await describePadding(0.2);
  const forty = await describePadding(0.4);
  return {
    distance: twenty && forty ? euclideanDistance(twenty, forty) : null,
    twentyPercent: Boolean(twenty),
    fortyPercent: Boolean(forty),
  };
}

export async function compareAlignedAndCropDescriptors(
  input: HTMLVideoElement | HTMLCanvasElement,
  region: FaceDetectionRegion
): Promise<{
  aligned: FaceRegionRecognitionResult;
  crop: FaceRegionRecognitionResult;
  distance: number;
  withinThreshold: boolean;
}> {
  const withKeypoints = hasScrfdKeypoints(region.landmarks)
    ? region
    : { ...region, landmarks: undefined };
  const aligned = await describeScrfdFaceRegions(input, [withKeypoints], undefined, 'keypoint_aligned');
  const crop = await describeScrfdFaceRegions(input, [{ ...region, landmarks: undefined }]);
  const alignedDesc = aligned[0]?.status === 'descriptor' ? aligned[0].detection.descriptor : null;
  const cropDesc = crop[0]?.status === 'descriptor' ? crop[0].detection.descriptor : null;
  let distance = Number.POSITIVE_INFINITY;
  if (alignedDesc && cropDesc) {
    let sum = 0;
    for (let i = 0; i < alignedDesc.length; i++) {
      const delta = (alignedDesc[i] ?? 0) - (cropDesc[i] ?? 0);
      sum += delta * delta;
    }
    distance = Math.sqrt(sum);
  }
  return {
    aligned: aligned[0]!,
    crop: crop[0]!,
    distance,
    withinThreshold: distance <= FACENET_DISTANCE_THRESHOLD,
  };
}

export type FaceDescriptorExtractionFailure =
  | 'no_face_detected'
  | 'inconsistent_landmarks'
  | 'below_minimum_face_size'
  | 'below_detection_confidence'
  | 'inference_failed';

export const FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES: Record<FaceDescriptorExtractionFailure, string> = {
  no_face_detected: 'no face detected',
  below_minimum_face_size: 'face was too small in the captured image',
  below_detection_confidence: 'face detection confidence was too low',
  inconsistent_landmarks: 'facial landmarks failed the quality check',
  inference_failed: 'face analysis failed; check the browser console for details',
};

export interface FaceDescriptorExtractionAttempt {
  descriptor: Float32Array | null;
  failure: FaceDescriptorExtractionFailure | null;
}

export interface FaceDescriptorExtractionPass {
  step: 'initial' | 'enhanced';
  detector: 'ssd_mobilenet' | 'tiny_face_detector';
  sourceStep: 'initial' | 'enhanced';
  durationMs: number;
  result: 'descriptor' | 'failed';
  failure: FaceDescriptorExtractionFailure | null;
}

export interface FaceDescriptorExtractionOptions {
  maxPasses?: number;
  onPassStart?: (step: FaceDescriptorExtractionPass['step']) => void | Promise<void>;
  onPassComplete?: (pass: FaceDescriptorExtractionPass) => void;
}

interface FaceDescriptorPassBudget {
  remaining: number;
  onPassStart?: FaceDescriptorExtractionOptions['onPassStart'];
  onPassComplete?: FaceDescriptorExtractionOptions['onPassComplete'];
}

async function detectAccurateFaceWithDiagnostics(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  minScore: number,
  budget?: FaceDescriptorPassBudget,
  sourceStep: FaceDescriptorExtractionPass['step'] = 'initial'
): Promise<{ detection: DetectionWithDescriptor | null; failure: FaceDescriptorExtractionFailure | null }> {
  const enhancedInput = (typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement && isLowLightVideo(input))
    ? renderVideoToCanvas(input, LOW_LIGHT_GAMMA)
    : null;
  let failure: FaceDescriptorExtractionFailure = 'no_face_detected';
  const tryDetector = async (
    detector: FaceDescriptorExtractionPass['detector'],
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    variant: 'initial' | 'enhanced'
  ): Promise<{ detection: DetectionWithDescriptor | null; inferenceFailed: boolean }> => {
    const netLoaded = detector === 'ssd_mobilenet'
      ? faceapi.nets.ssdMobilenetv1.isLoaded
      : faceapi.nets.tinyFaceDetector.isLoaded;
    if (!netLoaded || (budget && budget.remaining <= 0)) {
      return { detection: null, inferenceFailed: false };
    }
    await budget?.onPassStart?.(variant);
    if (budget) budget.remaining--;
    const shouldTime = Boolean(budget?.onPassComplete);
    const startedAt = shouldTime ? performance.now() : 0;
    let passFailure: FaceDescriptorExtractionFailure = 'no_face_detected';
    let accepted: DetectionWithDescriptor | null = null;
    let inferenceFailed = false;
    try {
      const options = detector === 'ssd_mobilenet'
        ? new faceapi.SsdMobilenetv1Options({ minConfidence: minScore })
        : new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minScore });
      if (await hasAtLeastOneFace(source, options)) {
        const detection = await faceapi
          .detectSingleFace(source, options)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection) {
          const rejection = getQualityRejection(detection, minScore, MIN_FACE_SIZE_PX);
          if (!rejection) accepted = detection;
          else passFailure = rejection;
        }
      }
    } catch {
      passFailure = 'inference_failed';
      inferenceFailed = true;
    } finally {
      if (budget?.onPassComplete) {
        budget.onPassComplete({
          step: sourceStep,
          detector,
          sourceStep: variant,
          durationMs: performance.now() - startedAt,
          result: accepted ? 'descriptor' : 'failed',
          failure: accepted ? null : passFailure,
        });
      }
    }
    if (!accepted && passFailure !== 'no_face_detected') failure = passFailure;
    return { detection: accepted, inferenceFailed };
  };

  for (const detector of ['ssd_mobilenet', 'tiny_face_detector'] as const) {
    const primary = await tryDetector(detector, input, 'initial');
    if (primary.detection && !enhancedInput) return { detection: primary.detection, failure: null };
    if (enhancedInput && !primary.inferenceFailed) {
      const enhanced = await tryDetector(detector, enhancedInput, 'enhanced');
      if (enhanced.detection) return { detection: enhanced.detection, failure: null };
    }
    if (budget?.remaining === 0) break;
  }

  return { detection: null, failure };
}

export async function detectAccurateFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  minScore = MIN_REGISTER_DETECTION_SCORE
): Promise<DetectionWithDescriptor | null> {
  return (await detectAccurateFaceWithDiagnostics(input, minScore)).detection;
}

export async function extractDescriptorFromImage(
  img: HTMLImageElement,
  minScore = MIN_PHOTO_DETECTION_SCORE
): Promise<Float32Array | null> {
  return (await extractDescriptorFromImageWithDiagnostics(img, minScore)).descriptor;
}

async function extractDescriptorFromImageWithDiagnostics(
  img: HTMLImageElement,
  minScore: number,
  options?: FaceDescriptorExtractionOptions
): Promise<FaceDescriptorExtractionAttempt> {
  const budget: FaceDescriptorPassBudget = {
    remaining: options?.maxPasses === undefined
      ? Number.POSITIVE_INFINITY
      : Math.min(2, Math.max(1, Math.floor(options.maxPasses))),
    onPassStart: options?.onPassStart,
    onPassComplete: options?.onPassComplete,
  };
  const runPass = async (
    step: FaceDescriptorExtractionPass['step'],
    canvas: HTMLCanvasElement
  ) => {
    return detectAccurateFaceWithDiagnostics(canvas, minScore, budget, step);
  };
  const canvas = renderToCanvas(img, 1.0);
  const primary = await runPass('initial', canvas);
  if (primary.detection) return { descriptor: primary.detection.descriptor, failure: null };
  if (budget.remaining <= 0) return { descriptor: null, failure: primary.failure };

  const enhanced = renderToCanvas(img, 0.7);
  const boosted = await runPass('enhanced', enhanced);
  if (boosted.detection) return { descriptor: boosted.detection.descriptor, failure: null };

  const failures = [primary.failure, boosted.failure];
  return {
    descriptor: null,
    failure: failures.find(reason => reason && reason !== 'no_face_detected') ?? 'no_face_detected',
  };
}

export async function extractDescriptorsFromBlobs(blobs: Blob[]): Promise<Float32Array[]> {
  const attempts = await extractDescriptorsFromBlobsWithDiagnostics(blobs);
  return attempts.flatMap(attempt => attempt.descriptor ? [attempt.descriptor] : []);
}

export async function extractDescriptorsFromBlobsWithDiagnostics(
  blobs: Blob[],
  options?: FaceDescriptorExtractionOptions
): Promise<FaceDescriptorExtractionAttempt[]> {
  await ensureFaceNetModels();
  const attempts: FaceDescriptorExtractionAttempt[] = [];

  for (const blob of blobs) {
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadImage(url);
      attempts.push(await extractDescriptorFromImageWithDiagnostics(image, MIN_PHOTO_DETECTION_SCORE, options));
    } catch (error) {
      console.warn('[FaceNet] Skipping a registration frame that could not be converted to a descriptor:', error);
      attempts.push({ descriptor: null, failure: 'inference_failed' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return attempts;
}
