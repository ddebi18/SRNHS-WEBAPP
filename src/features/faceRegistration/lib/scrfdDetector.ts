import * as ort from 'onnxruntime-web/wasm';
import ortWasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import ortWasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import visionWasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import visionWasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

export interface ScrfdDetection {
  box: [number, number, number, number]; // [x, y, w, h] in video coordinates
  score: number;
  landmarks: [number, number][]; // 5 keypoints [[x, y], ...]
}

export interface ScrfdFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
  score: number;
  landmarks?: [number, number][];
}

const STRIDES = [8, 16, 32] as const;
const ANCHORS_PER_LOCATION = 2;
const TARGET_SIZE = 640;

export const visionWasmFileset = {
  wasmLoaderPath: visionWasmLoaderUrl,
  wasmBinaryPath: visionWasmBinaryUrl,
};

// Use Vite-resolved asset URLs so the runtimes also work in production builds.
try {
  ort.env.wasm.wasmPaths = {
    wasm: ortWasmBinaryUrl,
    mjs: ortWasmModuleUrl,
  };
  const isIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  ort.env.wasm.numThreads = isIsolated ? Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1) || 1) : 1;
  ort.env.wasm.simd = true;
} catch (e) {
  console.warn('Failed to configure ONNX WASM path:', e);
}

const sessionCache = new Map<string, ort.InferenceSession>();
const sessionLoadingPromises = new Map<string, Promise<ort.InferenceSession>>();

export async function getScrfdSession(
  modelUrl: string = '/models/scrfd/scrfd_2.5g_bnkps.onnx'
): Promise<ort.InferenceSession> {
  const cachedSession = sessionCache.get(modelUrl);
  if (cachedSession) return cachedSession;
  const loadingSession = sessionLoadingPromises.get(modelUrl);
  if (loadingSession) return loadingSession;

  const loadingPromise = (async () => {
    // Pre-fetch model as ArrayBuffer to avoid browser MIME type or internal fetch limitations
    let modelData: Uint8Array | string = modelUrl;
    try {
      const resp = await fetch(modelUrl);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        modelData = new Uint8Array(ab);
        console.log(`[SCRFD] Model binary fetched (${(modelData.length / (1024 * 1024)).toFixed(2)} MB).`);
      }
    } catch (fetchErr) {
      console.warn(`[SCRFD] Fetch buffer failed; falling back to URL string:`, fetchErr);
    }

    const epCandidates = ['wasm'];
    let session: ort.InferenceSession | null = null;

    for (const ep of epCandidates) {
      try {
        console.log(`[SCRFD] Attempting session creation with provider [${ep}]...`);
        const sessionOptions: ort.InferenceSession.SessionOptions = {
          executionProviders: [ep],
          graphOptimizationLevel: 'all',
        };
        const s = typeof modelData === 'string'
          ? await ort.InferenceSession.create(modelData, sessionOptions)
          : await ort.InferenceSession.create(modelData, sessionOptions);

        // Dummy verification pass
        const inputName = s.inputNames[0] ?? 'input.1';
        const dummyData = new Float32Array(3 * TARGET_SIZE * TARGET_SIZE);
        const dummyTensor = new ort.Tensor('float32', dummyData, [1, 3, TARGET_SIZE, TARGET_SIZE]);
        const feeds: Record<string, ort.Tensor> = {};
        feeds[inputName] = dummyTensor;
        await s.run(feeds);

        console.log(`[SCRFD] Model initialized & verified successfully on provider [${ep}].`);
        session = s;
        break;
      } catch (err) {
        console.warn(`[SCRFD] Provider [${ep}] failed initialization:`, err);
      }
    }

    if (!session) {
      // Fallback: Try 500m model if 2.5g failed
      if (modelUrl !== '/models/scrfd/scrfd_500m_bnkps.onnx') {
        console.log('[SCRFD] Retrying with lighter SCRFD-500M model...');
        return getScrfdSession('/models/scrfd/scrfd_500m_bnkps.onnx');
      }
      throw new Error('SCRFD engine failed to load on all available execution providers.');
    }

    sessionCache.set(modelUrl, session);
    return session;
  })();

  sessionLoadingPromises.set(modelUrl, loadingPromise);
  try {
    return await loadingPromise;
  } finally {
    if (sessionLoadingPromises.get(modelUrl) === loadingPromise) {
      sessionLoadingPromises.delete(modelUrl);
    }
  }
}

const canvasOffscreen = typeof document !== 'undefined' ? document.createElement('canvas') : null;

export function preprocessVideoFrame(video: HTMLVideoElement, targetSize = TARGET_SIZE) {
  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 480;

  if (!canvasOffscreen) throw new Error('DOM Canvas unavailable');

  canvasOffscreen.width = targetSize;
  canvasOffscreen.height = targetSize;
  const ctx = canvasOffscreen.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');

  const scale = Math.min(targetSize / srcW, targetSize / srcH);
  const scaledW = Math.round(srcW * scale);
  const scaledH = Math.round(srcH * scale);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(video, 0, 0, scaledW, scaledH);

  const imgData = ctx.getImageData(0, 0, targetSize, targetSize).data;
  const floatData = new Float32Array(3 * targetSize * targetSize);
  const area = targetSize * targetSize;

  for (let i = 0; i < area; i++) {
    const r = imgData[i * 4 + 0] ?? 0;
    const g = imgData[i * 4 + 1] ?? 0;
    const b = imgData[i * 4 + 2] ?? 0;
    floatData[i] = (r - 127.5) / 128.0;            // R
    floatData[area + i] = (g - 127.5) / 128.0;     // G
    floatData[2 * area + i] = (b - 127.5) / 128.0; // B
  }

  return {
    tensor: new ort.Tensor('float32', floatData, [1, 3, targetSize, targetSize]),
    scale,
    srcW,
    srcH,
  };
}

export function calculateIoU(b1: [number, number, number, number], b2: [number, number, number, number]): number {
  const x1 = Math.max(b1[0], b2[0]);
  const y1 = Math.max(b1[1], b2[1]);
  const x2 = Math.min(b1[0] + b1[2], b2[0] + b2[2]);
  const y2 = Math.min(b1[1] + b1[3], b2[1] + b2[3]);
  const inter = Math.max(0, x2 - x1 + 1) * Math.max(0, y2 - y1 + 1);
  const area1 = (b1[2] + 1) * (b1[3] + 1);
  const area2 = (b2[2] + 1) * (b2[3] + 1);
  const union = area1 + area2 - inter;
  return union <= 0 ? 0 : inter / union;
}

export function applyNms(candidates: ScrfdDetection[], iouThreshold = 0.4): ScrfdDetection[] {
  if (candidates.length === 0) return [];
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const picked: ScrfdDetection[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (!a) continue;
    let keep = true;
    for (let j = 0; j < picked.length; j++) {
      const b = picked[j];
      if (b && calculateIoU(a.box, b.box) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) picked.push(a);
  }
  return picked;
}

export function decodeScrfdOutputs(
  outputs: Record<string, ort.Tensor>,
  outputNames: readonly string[],
  scale: number,
  confThreshold = 0.25,
  nmsThreshold = 0.4
): ScrfdDetection[] {
  const candidates: ScrfdDetection[] = [];

  for (let level = 0; level < STRIDES.length; level++) {
    const stride: number = STRIDES[level] ?? 8;
    const scoreName = outputNames[level];
    const bboxName = outputNames[level + STRIDES.length];
    const kpsName = outputNames[level + STRIDES.length * 2];

    if (!scoreName || !bboxName || !kpsName) continue;

    const scoreTensor = outputs[scoreName];
    const bboxTensor = outputs[bboxName];
    const kpsTensor = outputs[kpsName];
    const featureWidth = TARGET_SIZE / stride;
    const anchorCount = featureWidth * featureWidth * ANCHORS_PER_LOCATION;

    if (
      !scoreTensor ||
      !bboxTensor ||
      !kpsTensor ||
      scoreTensor.data.length !== anchorCount ||
      bboxTensor.data.length !== anchorCount * 4 ||
      kpsTensor.data.length !== anchorCount * 10
    ) {
      continue;
    }

    const scoreData = scoreTensor.data as Float32Array;
    const bboxData = bboxTensor.data as Float32Array;
    const kpsData = kpsTensor.data as Float32Array;

    for (let i = 0; i < anchorCount; i++) {
      const score = scoreData[i];
      if (score === undefined || score < confThreshold) continue;

      const gridIndex = Math.floor(i / ANCHORS_PER_LOCATION);
      const centerX = (gridIndex % featureWidth) * stride;
      const centerY = Math.floor(gridIndex / featureWidth) * stride;
      const boxOffset = i * 4;

      const dx1 = bboxData[boxOffset] ?? 0;
      const dy1 = bboxData[boxOffset + 1] ?? 0;
      const dx2 = bboxData[boxOffset + 2] ?? 0;
      const dy2 = bboxData[boxOffset + 3] ?? 0;

      const x1 = (centerX - dx1 * stride) / scale;
      const y1 = (centerY - dy1 * stride) / scale;
      const x2 = (centerX + dx2 * stride) / scale;
      const y2 = (centerY + dy2 * stride) / scale;

      const landmarks: [number, number][] = [];
      for (let point = 0; point < 5; point++) {
        const kpsOffset = i * 10 + point * 2;
        const kx = kpsData[kpsOffset] ?? 0;
        const ky = kpsData[kpsOffset + 1] ?? 0;
        landmarks.push([
          (centerX + kx * stride) / scale,
          (centerY + ky * stride) / scale,
        ]);
      }

      candidates.push({
        box: [x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1)],
        score,
        landmarks,
      });
    }
  }

  return applyNms(candidates, nmsThreshold);
}

export async function detectFacesWithScrfd(
  session: ort.InferenceSession,
  video: HTMLVideoElement,
  confThreshold = 0.30,
  nmsThreshold = 0.4
): Promise<ScrfdFaceBox[]> {
  const { tensor, scale, srcW, srcH } = preprocessVideoFrame(video);
  const inputName = session.inputNames[0] ?? 'input.1';
  const feeds: Record<string, ort.Tensor> = {};
  feeds[inputName] = tensor;

  const outputs = await session.run(feeds);
  const rawDetections = decodeScrfdOutputs(outputs, session.outputNames, scale, confThreshold, nmsThreshold);

  return rawDetections.map((det) => ({
    x: det.box[0],
    y: det.box[1],
    width: det.box[2],
    height: det.box[3],
    videoWidth: srcW,
    videoHeight: srcH,
    score: det.score,
    landmarks: det.landmarks,
  }));
}
