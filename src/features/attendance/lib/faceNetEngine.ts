import * as faceapi from '@vladmandic/face-api';
import {
  MIN_LIVE_DETECTION_SCORE,
  MIN_PHOTO_DETECTION_SCORE,
  MIN_REGISTER_DETECTION_SCORE,
  isFaceBoxUsable,
} from './faceNetMatcher';

const MODEL_URL = 'https://vladmandic.github.io/face-api/model';
const LOW_LIGHT_MEAN_LUMA = 88;
const LOW_LIGHT_GAMMA = 0.68;

let modelsPromise: Promise<void> | null = null;

export function ensureFaceNetModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).catch(() => {
        console.warn('[FaceNet] TinyFaceDetector unavailable; SSD will be used');
      }),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => undefined);
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

function isQualityDetection(
  detection: DetectionWithDescriptor | undefined | null,
  minScore: number
): detection is DetectionWithDescriptor {
  if (!detection) return false;
  const box = detection.detection.box;
  const score = detection.detection.score;
  return isFaceBoxUsable(box.width, box.height, score, minScore);
}

export async function detectLiveFace(
  input: HTMLVideoElement | HTMLCanvasElement
): Promise<DetectionWithDescriptor | null> {
  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    const enhancedInput = shouldEnhanceLiveInput(input)
      ? renderVideoToCanvas(input, LOW_LIGHT_GAMMA)
      : null;
    try {
      const detection = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: MIN_LIVE_DETECTION_SCORE,
        }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (isQualityDetection(detection, MIN_LIVE_DETECTION_SCORE) && !enhancedInput) return detection;

      if (enhancedInput) {
        const enhancedDetection = await faceapi
          .detectSingleFace(enhancedInput, new faceapi.TinyFaceDetectorOptions({
            inputSize: 320,
            scoreThreshold: MIN_LIVE_DETECTION_SCORE,
          }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (isQualityDetection(enhancedDetection, MIN_LIVE_DETECTION_SCORE)) return enhancedDetection;
        if (isQualityDetection(detection, MIN_LIVE_DETECTION_SCORE)) return detection;
      }
    } catch {
      // Keep the camera loop moving if a single inference frame fails.
    }
  }
  return null;
}

export async function detectAccurateFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  minScore = MIN_REGISTER_DETECTION_SCORE
): Promise<DetectionWithDescriptor | null> {
  const enhancedInput = (typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement && isLowLightVideo(input))
    ? renderVideoToCanvas(input, LOW_LIGHT_GAMMA)
    : null;

  if (faceapi.nets.ssdMobilenetv1.isLoaded) {
    try {
      const detection = await faceapi
        .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: minScore }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (isQualityDetection(detection, minScore) && !enhancedInput) return detection;
      if (enhancedInput) {
        const enhancedDetection = await faceapi
          .detectSingleFace(enhancedInput, new faceapi.SsdMobilenetv1Options({ minConfidence: minScore }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (isQualityDetection(enhancedDetection, minScore)) return enhancedDetection;
        if (isQualityDetection(detection, minScore)) return detection;
      }
    } catch {}
  }

  if (faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      const detection = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: minScore,
        }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (isQualityDetection(detection, minScore) && !enhancedInput) return detection;
      if (enhancedInput) {
        const enhancedDetection = await faceapi
          .detectSingleFace(enhancedInput, new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: minScore,
          }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (isQualityDetection(enhancedDetection, minScore)) return enhancedDetection;
        if (isQualityDetection(detection, minScore)) return detection;
      }
    } catch {}
  }

  return null;
}

export async function extractDescriptorFromImage(
  img: HTMLImageElement,
  minScore = MIN_PHOTO_DETECTION_SCORE
): Promise<Float32Array | null> {
  const canvas = renderToCanvas(img, 1.0);
  const primary = await detectAccurateFace(canvas, minScore);
  if (primary) return primary.descriptor;

  const enhanced = renderToCanvas(img, 0.7);
  const boosted = await detectAccurateFace(enhanced, minScore);
  return boosted?.descriptor ?? null;
}

export async function extractDescriptorsFromBlobs(blobs: Blob[]): Promise<Float32Array[]> {
  await ensureFaceNetModels();
  const descriptors: Float32Array[] = [];

  for (const blob of blobs) {
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadImage(url);
      const descriptor = await extractDescriptorFromImage(image, MIN_PHOTO_DETECTION_SCORE);
      if (descriptor) descriptors.push(descriptor);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return descriptors;
}
