// Usage: start `npm run dev`, then pass an optional gallery JSON and filename-to-label JSON.
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://localhost:5173/';
const PORT = 9224;
const SAMPLE_FILES = ['face_1.jpg', 'sample2.jpg', 'sample3.jpg', 'sample4.jpg', 'sample5.jpg'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadGallery(path) {
  if (!path) return [];
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Gallery JSON must be an array of { label, descriptors } objects.');
  for (const entry of parsed) {
    if (typeof entry?.label !== 'string' || !Array.isArray(entry.descriptors) || !entry.descriptors.length) {
      throw new Error('Each gallery entry needs a label and at least one 128-value descriptor.');
    }
    for (const descriptor of entry.descriptors) {
      if (!Array.isArray(descriptor) || descriptor.length !== 128 || descriptor.some(value => !Number.isFinite(Number(value)))) {
        throw new Error(`Gallery descriptor for "${entry.label}" must contain 128 finite numbers.`);
      }
    }
  }
  return parsed;
}

async function loadExpectedLabels(path) {
  if (!path) return {};
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected-label JSON must map sample filenames to enrolled gallery labels.');
  }
  return parsed;
}

async function main() {
  const galleryPath = process.argv[2];
  const gallery = await loadGallery(galleryPath);
  const expectedLabels = await loadExpectedLabels(process.argv[3]);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--ignore-certificate-errors',
    '--disable-web-security',
    '--allow-running-insecure-content',
    '--enable-features=WebAssemblySIMD',
    TARGET_URL,
  ], { stdio: 'ignore' });

  let socket;
  try {
    let target;
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(500);
      try {
        const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        target = pages.find(page => page.type === 'page');
        if (target) break;
      } catch {
        // Chrome may need a moment to open the debugging endpoint.
      }
    }
    if (!target) throw new Error('Could not connect to Chrome. Start the Vite dev server first.');

    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolvePromise, reject) => {
      socket.onopen = resolvePromise;
      socket.onerror = reject;
    });

    let nextId = 1;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    };

    const send = (method, params = {}) => new Promise((resolvePromise, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolvePromise, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

    await send('Runtime.enable');
    const expression = `(async () => {
      const suppliedGallery = ${JSON.stringify(gallery)};
      const expectedLabels = ${JSON.stringify(expectedLabels)};
      const engine = await import('/src/features/attendance/lib/faceNetEngine.ts');
      const scrfd = await import('/src/features/faceRegistration/lib/scrfdDetector.ts');
      const matcher = await import('/src/features/attendance/lib/faceNetMatcher.ts');
      await engine.ensureFaceNetModels();
      const model = await scrfd.getScrfdSession('/models/scrfd/scrfd_2.5g_bnkps.onnx');
      const rows = [];
      let descriptorModesWarmed = false;
      for (const file of ${JSON.stringify(SAMPLE_FILES)}) {
        const image = new Image();
        image.src = '/test/images/' + file;
        await image.decode();
        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = image.naturalWidth;
        imageCanvas.height = image.naturalHeight;
        imageCanvas.getContext('2d').drawImage(image, 0, 0);
        const video = document.createElement('video');
        video.muted = true;
        video.srcObject = imageCanvas.captureStream(1);
        await video.play();
        await new Promise(resolve => {
          const ready = () => video.videoWidth ? resolve() : setTimeout(ready, 20);
          ready();
        });
        const detectorStartedAt = performance.now();
        const detections = await scrfd.detectFacesWithScrfd(model, video, 0.25, 0.4);
        const detectorDurationMs = performance.now() - detectorStartedAt;
        for (let index = 0; index < detections.length; index++) {
          const face = detections[index];
          const region = {
            x: face.x, y: face.y, width: face.width, height: face.height,
            score: face.score, landmarks: face.landmarks,
          };
          if (!descriptorModesWarmed) {
            await engine.describeScrfdFaceRegions(video, [region], undefined, 'legacy');
            await engine.describeScrfdFaceRegions(video, [region], undefined, 'landmark_aligned');
            descriptorModesWarmed = true;
          }
          let oldPath;
          let safePath;
          if (rows.length % 2 === 0) {
            oldPath = await engine.describeScrfdFaceRegions(video, [region], undefined, 'legacy');
            safePath = await engine.describeScrfdFaceRegions(video, [region], undefined, 'landmark_aligned');
          } else {
            safePath = await engine.describeScrfdFaceRegions(video, [region], undefined, 'landmark_aligned');
            oldPath = await engine.describeScrfdFaceRegions(video, [region], undefined, 'legacy');
          }
          const oldResult = oldPath[0];
          const safeResult = safePath[0];
          const oldDescriptor = oldResult?.status === 'descriptor' ? oldResult.detection.descriptor : null;
          const safeDescriptor = safeResult?.status === 'descriptor' ? safeResult.detection.descriptor : null;
          const descriptorDistance = oldDescriptor && safeDescriptor
            ? matcher.euclideanDistance(oldDescriptor, safeDescriptor)
            : null;
          const compareGallery = descriptor => {
            if (!descriptor || !suppliedGallery.length) return null;
            const result = matcher.scoreFaceNetMatch(descriptor, suppliedGallery);
            const expectedLabel = expectedLabels[file];
            const galleryDistances = suppliedGallery.flatMap(entry =>
              entry.descriptors.map(enrolled => ({
                label: entry.label,
                distance: matcher.euclideanDistance(descriptor, enrolled),
              }))
            );
            return {
              label: result.label,
              distance: Number(result.distance.toFixed(4)),
              accepted: result.accepted,
              expectedLabel: expectedLabel ?? null,
              falseAccept: expectedLabel ? result.accepted && result.label !== expectedLabel : null,
              falseReject: expectedLabel ? !result.accepted || result.label !== expectedLabel : null,
              genuineDistances: expectedLabel
                ? galleryDistances.filter(item => item.label === expectedLabel).map(item => item.distance)
                : null,
              impostorDistances: expectedLabel
                ? galleryDistances.filter(item => item.label !== expectedLabel).map(item => item.distance)
                : null,
            };
          };
          rows.push({
            file, face: index + 1, score: Number(face.score.toFixed(3)),
            hasFiveKeypoints: face.landmarks?.length === 5,
            detectorMs: Number(detectorDurationMs.toFixed(1)),
            oldPathStatus: oldResult?.status,
            oldPathReason: oldResult?.status === 'failed' ? oldResult.reason : null,
            oldPathMs: Number(oldResult?.durationMs.toFixed(1) ?? 0),
            safePathStatus: safeResult?.status,
            safePathReason: safeResult?.status === 'failed' ? safeResult.reason : null,
            safePathMs: Number(safeResult?.durationMs.toFixed(1) ?? 0),
            oldVsSafeDistance: Number.isFinite(descriptorDistance) ? Number(descriptorDistance.toFixed(4)) : null,
            withinExistingThreshold: Number.isFinite(descriptorDistance) &&
              descriptorDistance <= matcher.FACENET_DISTANCE_THRESHOLD,
            oldPathGallery: compareGallery(oldDescriptor),
            safePathGallery: compareGallery(safeDescriptor),
          });
        }
        video.pause();
        video.srcObject.getTracks().forEach(track => track.stop());
      }
      const median = values => {
        if (!values.length) return null;
        const sorted = [...values].sort((a, b) => a - b);
        return Number(sorted[Math.floor(sorted.length / 2)].toFixed(1));
      };
      const safeTimes = rows.filter(row => row.safePathStatus === 'descriptor').map(row => row.safePathMs);
      const oldTimes = rows.filter(row => row.oldPathStatus === 'descriptor').map(row => row.oldPathMs);
      const pairedDistances = rows.map(row => row.oldVsSafeDistance).filter(Number.isFinite);
      const withinThresholdCount = pairedDistances.filter(distance => distance <= matcher.FACENET_DISTANCE_THRESHOLD).length;
      const safeMedian = median(safeTimes);
      const oldMedian = median(oldTimes);
      const galleryMetrics = path => {
        const classified = rows.map(row => row[path]).filter(Boolean);
        const distances = key => classified.flatMap(item => item[key] ?? []);
        return {
          labeledQueries: classified.filter(item => item.expectedLabel).length,
          falseAccepts: classified.filter(item => item.falseAccept === true).length,
          falseRejects: classified.filter(item => item.falseReject === true).length,
          genuineDistanceRange: range(distances('genuineDistances')),
          impostorDistanceRange: range(distances('impostorDistances')),
        };
      };
      const range = values => values.length
        ? [Number(Math.min(...values).toFixed(4)), Number(Math.max(...values).toFixed(4))]
        : null;
      return {
        threshold: matcher.FACENET_DISTANCE_THRESHOLD,
        ambiguityMargin: matcher.FACENET_AMBIGUITY_MARGIN,
        modelOutputs: model.outputNames,
        galleryDescriptorsLoaded: suppliedGallery.reduce((sum, item) => sum + item.descriptors.length, 0),
        galleryLabels: suppliedGallery.length,
        verifiedIdentityLabelsProvided: Object.keys(expectedLabels).length,
        oldPathResultCounts: {
          descriptors: oldTimes.length,
          failed: rows.filter(row => row.oldPathStatus === 'failed').length,
          qualityRejected: rows.filter(row => row.oldPathStatus === 'quality_rejected').length,
        },
        safePathResultCounts: {
          descriptors: safeTimes.length,
          failed: rows.filter(row => row.safePathStatus === 'failed').length,
          qualityRejected: rows.filter(row => row.safePathStatus === 'quality_rejected').length,
        },
        compatibility: {
          pairedDescriptors: pairedDistances.length,
          withinThreshold: withinThresholdCount,
          aboveThreshold: pairedDistances.length - withinThresholdCount,
          distanceRange: pairedDistances.length
            ? [Number(Math.min(...pairedDistances).toFixed(4)), Number(Math.max(...pairedDistances).toFixed(4))]
            : null,
        },
        timingMedianMs: {
          safePathAfterWarmup: safeMedian,
          oldPathAfterWarmup: oldMedian,
          scrfdPerImage: median([...new Map(rows.map(row => [row.file, row.detectorMs])).values()]),
        },
        safePathLatencyChangePercent: safeMedian && oldMedian
          ? Number(((safeMedian / oldMedian - 1) * 100).toFixed(1))
          : null,
        galleryClassification: {
          oldPath: galleryMetrics('oldPathGallery'),
          safePath: galleryMetrics('safePathGallery'),
          note: Object.keys(expectedLabels).length
            ? null
            : 'False accepts/rejects and genuine/impostor ranges require a verified filename-to-gallery-label map.',
        },
        rows,
      };
    })()`;
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    console.log(JSON.stringify(result.result.value, null, 2));
  } finally {
    socket?.close();
    chrome.kill();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
