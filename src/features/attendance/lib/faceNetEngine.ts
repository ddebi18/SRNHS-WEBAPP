import * as faceapi from '@vladmandic/face-api';
import {
  MIN_LIVE_DETECTION_SCORE,
  MIN_LIVE_RECOGNITION_FACE_SIZE_PX,
  MIN_FACE_SIZE_PX,
  MIN_PHOTO_DETECTION_SCORE,
  MIN_REGISTER_DETECTION_SCORE,
  evaluateFacePartConsistency,
} from './faceNetMatcher';

const MODEL_URL = 'https://vladmandic.github.io/face-api/model';
const LOW_LIGHT_MEAN_LUMA = 88;
const LOW_LIGHT_GAMMA = 0.68;

let modelsPromise: Promise<void> | null = null;

export function ensureFaceNetModels(): Promise<void> {
  if (!modelsPromise) {
    const promise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).catch(() => {
        console.warn('[FaceNet] TinyFaceDetector unavailable; SSD will be used');
      }),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL).catch(() => {
        console.warn('[FaceNet] SSD Mobilenet detector unavailable; other FaceNet stages will continue when possible');
      }),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => {
      if (!faceapi.nets.tinyFaceDetector.isLoaded && !faceapi.nets.ssdMobilenetv1.isLoaded) {
        throw new Error('Face detection models could not be loaded.');
      }
    }).catch(error => {
      modelsPromise = null;
      throw error;
    });
    modelsPromise = promise;
  }
  return modelsPromise;
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
}

export type FaceRegionQualityRejection =
  | 'below_minimum_face_size'
  | 'below_detection_confidence'
  | 'inconsistent_landmarks';

export type FaceRegionRecognitionResult =
  | {
      region: FaceDetectionRegion;
      status: 'descriptor';
      detection: FaceNetLiveDetection;
      durationMs: number;
      source: 'crop' | 'full_frame_fallback';
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

export async function describeScrfdFaceRegions(
  input: HTMLVideoElement | HTMLCanvasElement,
  regions: FaceDetectionRegion[],
  minScore = MIN_LIVE_DETECTION_SCORE
): Promise<FaceRegionRecognitionResult[]> {
  const isVideo = typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement;
  const inputWidth = isVideo ? input.videoWidth : input.width;
  const inputHeight = isVideo ? input.videoHeight : input.height;
  const canvases = Array.from(
    { length: Math.min(2, regions.length) },
    () => document.createElement('canvas')
  );
  const contexts = canvases.map(canvas => canvas.getContext('2d', { willReadFrequently: true }));
  const recognizeRegion = async (
    region: FaceDetectionRegion,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D | null
  ): Promise<FaceRegionRecognitionResult> => {
    const startedAt = performance.now();
    try {
      if (!context) {
        return {
          region,
          status: 'failed',
          reason: 'canvas_context_unavailable',
          durationMs: performance.now() - startedAt,
        };
      }

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

      canvas.width = cropWidth;
      canvas.height = cropHeight;
      context.drawImage(input, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      const options = faceapi.nets.tinyFaceDetector.isLoaded
        ? new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minScore })
        : new faceapi.SsdMobilenetv1Options({ minConfidence: minScore });
      const detection = await faceapi
        .detectSingleFace(canvas, options)
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
      const detectedCenterX = cropX + detectedBox.x + detectedBox.width / 2;
      const detectedCenterY = cropY + detectedBox.y + detectedBox.height / 2;
      const regionCenterX = region.x + region.width / 2;
      const regionCenterY = region.y + region.height / 2;
      if (
        Math.hypot(detectedCenterX - regionCenterX, detectedCenterY - regionCenterY) >
        Math.max(region.width, region.height) * 0.45
      ) {
        return {
          region,
          status: 'failed',
          reason: 'crop_detection_misaligned',
          durationMs: performance.now() - startedAt,
        };
      }

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
  await Promise.all(canvases.map(async (canvas, workerIndex) => {
    for (let index = workerIndex; index < regions.length; index += canvases.length) {
      results[index] = await recognizeRegion(regions[index]!, canvas, contexts[workerIndex] ?? null);
    }
  }));

  return results;
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

async function detectAccurateFaceWithDiagnostics(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  minScore: number
): Promise<{ detection: DetectionWithDescriptor | null; failure: FaceDescriptorExtractionFailure | null }> {
  const enhancedInput = (typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement && isLowLightVideo(input))
    ? renderVideoToCanvas(input, LOW_LIGHT_GAMMA)
    : null;
  let failure: FaceDescriptorExtractionFailure = 'no_face_detected';

  if (faceapi.nets.ssdMobilenetv1.isLoaded) {
    try {
      const options = new faceapi.SsdMobilenetv1Options({ minConfidence: minScore });
      if (await hasAtLeastOneFace(input, options)) {
        const detection = await faceapi
          .detectSingleFace(input, options)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection) {
          const rejection = getQualityRejection(detection, minScore, MIN_FACE_SIZE_PX);
          if (!rejection && !enhancedInput) return { detection, failure: null };
          if (rejection) failure = rejection;
        }
      }
      if (enhancedInput) {
        if (await hasAtLeastOneFace(enhancedInput, options)) {
          const enhancedDetection = await faceapi
            .detectSingleFace(enhancedInput, options)
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (enhancedDetection) {
            const rejection = getQualityRejection(enhancedDetection, minScore, MIN_FACE_SIZE_PX);
            if (!rejection) return { detection: enhancedDetection, failure: null };
            failure = rejection;
          }
        }
      }
    } catch {
      failure = 'inference_failed';
    }
  }

  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: minScore,
        });
      if (await hasAtLeastOneFace(input, options)) {
        const detection = await faceapi
          .detectSingleFace(input, options)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection) {
          const rejection = getQualityRejection(detection, minScore, MIN_FACE_SIZE_PX);
          if (!rejection && !enhancedInput) return { detection, failure: null };
          if (rejection) failure = rejection;
        }
      }
      if (enhancedInput) {
        if (await hasAtLeastOneFace(enhancedInput, options)) {
          const enhancedDetection = await faceapi
            .detectSingleFace(enhancedInput, options)
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (enhancedDetection) {
            const rejection = getQualityRejection(enhancedDetection, minScore, MIN_FACE_SIZE_PX);
            if (!rejection) return { detection: enhancedDetection, failure: null };
            failure = rejection;
          }
        }
      }
    } catch {
      failure = 'inference_failed';
    }
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
  minScore: number
): Promise<FaceDescriptorExtractionAttempt> {
  const canvas = renderToCanvas(img, 1.0);
  const primary = await detectAccurateFaceWithDiagnostics(canvas, minScore);
  if (primary.detection) return { descriptor: primary.detection.descriptor, failure: null };

  const enhanced = renderToCanvas(img, 0.7);
  const boosted = await detectAccurateFaceWithDiagnostics(enhanced, minScore);
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
  blobs: Blob[]
): Promise<FaceDescriptorExtractionAttempt[]> {
  await ensureFaceNetModels();
  const attempts: FaceDescriptorExtractionAttempt[] = [];

  for (const blob of blobs) {
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadImage(url);
      attempts.push(await extractDescriptorFromImageWithDiagnostics(image, MIN_PHOTO_DETECTION_SCORE));
    } catch (error) {
      console.warn('[FaceNet] Skipping a registration frame that could not be converted to a descriptor:', error);
      attempts.push({ descriptor: null, failure: 'inference_failed' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return attempts;
}
