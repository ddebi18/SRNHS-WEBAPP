// Usage: start `npm run dev`, then run this script with an optional gallery JSON file.
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

async function main() {
  const galleryPath = process.argv[2];
  const gallery = await loadGallery(galleryPath);
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
      const engine = await import('/src/features/attendance/lib/faceNetEngine.ts');
      const scrfd = await import('/src/features/faceRegistration/lib/scrfdDetector.ts');
      const matcher = await import('/src/features/attendance/lib/faceNetMatcher.ts');
      await engine.ensureFaceNetModels();
      const model = await scrfd.getScrfdSession('/models/scrfd/scrfd_2.5g_bnkps.onnx');
      const rows = [];
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
          const comparison = await engine.compareAlignedAndCropDescriptors(video, region);
          const aligned = comparison.aligned.status === 'descriptor' ? comparison.aligned.detection.descriptor : null;
          const crop = comparison.crop.status === 'descriptor' ? comparison.crop.detection.descriptor : null;
          const sameImageGallery = crop ? [{ label: file + ':' + index, descriptors: [crop] }] : [];
          const alignedToSameImage = aligned
            ? matcher.scoreFaceNetMatch(aligned, sameImageGallery)
            : null;
          const alignedToEnrolled = aligned && suppliedGallery.length
            ? matcher.scoreFaceNetMatch(aligned, suppliedGallery)
            : null;
          const cropToEnrolled = crop && suppliedGallery.length
            ? matcher.scoreFaceNetMatch(crop, suppliedGallery)
            : null;
          rows.push({
            file, face: index + 1, score: Number(face.score.toFixed(3)),
            hasFiveKeypoints: face.landmarks?.length === 5,
            detectorMs: Number(detectorDurationMs.toFixed(1)),
            alignedStatus: comparison.aligned.status,
            alignedMs: Number(comparison.aligned.durationMs.toFixed(1)),
            oldCropStatus: comparison.crop.status,
            oldCropMs: Number(comparison.crop.durationMs.toFixed(1)),
            descriptorDistance: Number.isFinite(comparison.distance) ? Number(comparison.distance.toFixed(4)) : null,
            withinExistingThreshold: comparison.withinThreshold,
            alignedVsSameImageOldDescriptor: alignedToSameImage ? {
              distance: Number(alignedToSameImage.distance.toFixed(4)),
              accepted: alignedToSameImage.accepted,
            } : null,
            alignedVsEnrolledGallery: alignedToEnrolled ? {
              label: alignedToEnrolled.label,
              distance: Number(alignedToEnrolled.distance.toFixed(4)),
              accepted: alignedToEnrolled.accepted,
            } : null,
            oldCropVsEnrolledGallery: cropToEnrolled ? {
              label: cropToEnrolled.label,
              distance: Number(cropToEnrolled.distance.toFixed(4)),
              accepted: cropToEnrolled.accepted,
            } : null,
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
      const alignedTimes = rows.filter(row => row.alignedStatus === 'descriptor').map(row => row.alignedMs);
      const cropTimes = rows.filter(row => row.oldCropStatus === 'descriptor').map(row => row.oldCropMs);
      const pairedDistances = rows.map(row => row.descriptorDistance).filter(Number.isFinite);
      const withinThresholdCount = pairedDistances.filter(distance => distance <= matcher.FACENET_DISTANCE_THRESHOLD).length;
      const alignedMedian = median(alignedTimes.slice(1));
      const cropMedian = median(cropTimes.slice(1));
      return {
        threshold: matcher.FACENET_DISTANCE_THRESHOLD,
        modelOutputs: model.outputNames,
        galleryDescriptorsLoaded: suppliedGallery.reduce((sum, item) => sum + item.descriptors.length, 0),
        oldCropResultCounts: {
          descriptors: cropTimes.length,
          failed: rows.filter(row => row.oldCropStatus === 'failed').length,
          qualityRejected: rows.filter(row => row.oldCropStatus === 'quality_rejected').length,
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
          alignedDescriptorWarm: alignedTimes[0] ?? null,
          oldCropDescriptorWarm: cropTimes[0] ?? null,
          alignedDescriptorAfterWarmup: alignedMedian,
          oldCropDescriptorAfterWarmup: cropMedian,
          scrfdPerImage: median([...new Map(rows.map(row => [row.file, row.detectorMs])).values()]),
        },
        descriptorStageReductionPercent: alignedMedian && cropMedian
          ? Number(((1 - alignedMedian / cropMedian) * 100).toFixed(1))
          : null,
        accuracyAssessment: 'Not measurable: sample images have no verified identity labels.',
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
