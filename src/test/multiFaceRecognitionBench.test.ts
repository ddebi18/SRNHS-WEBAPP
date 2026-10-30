/**
 * Multi-face recognition performance benchmark.
 *
 * Exercises the real matching, scheduling, and tracking functions with
 * synthetic 128-D descriptors.
 *
 * Target: 3 and 5 registered students appearing together.
 * The scan-level descriptor budget is three; these tests do not represent camera inference latency.
 *
 * This benchmark measures CPU-side simulation, not live camera accuracy.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreFaceNetMatch,
  STABILITY_FRAMES_REQUIRED,
  FACENET_DISTANCE_THRESHOLD,
  type LabeledDescriptors,
} from '@/features/attendance/lib/faceNetMatcher';
import {
  assignFaceDetectionTracks,
  selectFaceDescriptorDetections,
  updateFaceTrackIdentity,
  type PredictableFaceTrack,
  type FaceTrackBox,
} from '@/features/attendance/lib/faceTracking';

// ---------------------------------------------------------------------------
// Helpers — deterministic descriptor factory (no randomness, repeatable)
// ---------------------------------------------------------------------------

/** Build a unit-length 128-D vector with energy concentrated at `index`. */
function syntheticDescriptor(index: number): Float32Array {
  const vec = new Float32Array(128);
  for (let i = 0; i < 128; i++) vec[i] = i === index % 128 ? 1.0 : 0.01;
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map(v => v / norm) as Float32Array;
}

/** Slightly perturb a descriptor the way real webcam variance would. */
function perturbDescriptor(base: Float32Array, jitter = 0.015): Float32Array {
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) {
    out[i] = base[i]! + (i % 2 === 0 ? jitter : -jitter) * 0.5;
  }
  let norm = 0;
  for (const v of out) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return out.map(v => v / norm) as Float32Array;
}

/** Generate a fake bounding box for face N in a horizontal row. */
function faceBox(index: number, total: number): FaceTrackBox {
  const spacing = 640 / (total + 1);
  return {
    x: spacing * (index + 1) - 50,
    y: 140,
    width: 100,
    height: 120,
  };
}

// ---------------------------------------------------------------------------
// Core benchmark runner — reuses the real pipeline functions
// ---------------------------------------------------------------------------

interface BenchResult {
  faceCount: number;
  /** Total wall time (ms) from first frame to all identities confirmed. */
  totalTimeMs: number;
  /** Wall time (ms) spent per face on matching only (average). */
  avgMatchTimePerFaceMs: number;
  /** Frames processed until every identity was confirmed. */
  framesToAllConfirmed: number;
  /** Wall time (ms) until every identity was confirmed. */
  timeToAllConfirmedMs: number;
  descriptorsExtracted: number;
  maxDescriptorsInScan: number;
  /** Per-face breakdown: label, match time, frames to stable. */
  perFace: Array<{
    label: string;
    matchTimeMs: number;
    confirmedAtFrame: number;
  }>;
}

/**
 * Simulate N faces entering the camera simultaneously and being matched
 * through the existing stability + tracking logic until every face is
 * confirmed.  Returns fine-grained timing data.
 */
function runMultiFaceBench(faceCount: number): BenchResult {
  // ── Build gallery (enrolled students) ────────────────────────────────
  const gallery: LabeledDescriptors[] = Array.from({ length: faceCount }, (_, i) => ({
    label: `student-${i}`,
    descriptors: [syntheticDescriptor(i * 10)],
  }));

  // ── Build per-frame "live" descriptors (simulating webcam frames) ────
  const liveDescriptors = gallery.map(entry =>
    perturbDescriptor(entry.descriptors[0] as Float32Array)
  );

  // ── Tracking state (mirrors useFaceRecognition's faceTracksRef) ──────
  let tracks: (PredictableFaceTrack & {
    candidateStudentId: string;
    stabilityCount: number;
    confirmedStudentId: string | null;
    pendingSwitch: boolean;
    lastDescriptorAt: number;
  })[] = [];
  // ── Per-face timing accumulators ─────────────────────────────────────
  const perFace: BenchResult['perFace'] = gallery.map(entry => ({
    label: entry.label,
    matchTimeMs: 0,
    confirmedAtFrame: -1,
  }));

  let totalMatchTimeMs = 0;
  let descriptorsExtracted = 0;
  let maxDescriptorsInScan = 0;
  let rotationCursor = 0;
  let allConfirmedAtFrame = -1;

  const benchStart = performance.now();
  const MAX_FRAMES = 30; // Safety cap — should converge well before this.

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    const timestamp = Date.now() + frame * 200; // simulate 200 ms scan interval
    const boxes = gallery.map((_, i) => faceBox(i, faceCount));

    const initialAssignments = assignFaceDetectionTracks(
      boxes,
      tracks.map(track => ({
        box: track.box,
        velocityX: track.velocityX,
        velocityY: track.velocityY,
        lastSeenAt: track.lastSeenAt,
        studentId: track.confirmedStudentId,
      })),
      boxes.map(() => null),
      timestamp
    );
    const selection = selectFaceDescriptorDetections(
      boxes.map((_, index) => {
        const trackIndex = initialAssignments[index];
        const track = trackIndex === null || trackIndex === undefined ? undefined : tracks[trackIndex];
        return {
          confirmed: Boolean(track?.confirmedStudentId),
          lastDescriptorAt: track?.lastDescriptorAt ?? 0,
        };
      }),
      timestamp,
      rotationCursor
    );
    rotationCursor = selection.nextRotationCursor;
    maxDescriptorsInScan = Math.max(maxDescriptorsInScan, selection.indices.length);

    // ── 1. Match only new, unconfirmed, or due-for-verification faces ──
    const matchResults: Array<{ studentId: string | null; timeMs: number } | null> =
      Array(faceCount).fill(null);
    for (const i of selection.indices) {
      const t0 = performance.now();
      const result = scoreFaceNetMatch(liveDescriptors[i]!, gallery);
      const elapsed = performance.now() - t0;
      totalMatchTimeMs += elapsed;
      perFace[i]!.matchTimeMs += elapsed;
      matchResults[i] = {
        studentId: result.accepted ? result.label : null,
        timeMs: elapsed,
      };
      descriptorsExtracted++;
    }

    // ── 2. Refine box assignment with identity affinity ─────────────────
    const trackAssignments = assignFaceDetectionTracks(
      boxes,
      tracks.map(t => ({
        box: t.box,
        velocityX: t.velocityX,
        velocityY: t.velocityY,
        lastSeenAt: t.lastSeenAt,
        studentId: t.confirmedStudentId,
      })),
      matchResults.map((match, index) => {
        if (match) return match.studentId;
        const trackIndex = initialAssignments[index];
        return trackIndex === null || trackIndex === undefined
          ? null
          : tracks[trackIndex]?.confirmedStudentId ?? null;
      }),
      timestamp,
    );

    // ── 3. Update / create tracks and apply stability logic ────────────
    const usedTracks = new Set<number>();
    const nextTracks: typeof tracks = [];

    for (let detIdx = 0; detIdx < faceCount; detIdx++) {
      const assignedIdx = trackAssignments[detIdx];
      const existingTrack =
        assignedIdx !== null && assignedIdx !== undefined
          ? tracks[assignedIdx]
          : undefined;
      if (assignedIdx !== null && assignedIdx !== undefined) {
        usedTracks.add(assignedIdx);
      }

      const track = existingTrack ?? {
        box: boxes[detIdx]!,
        velocityX: 0,
        velocityY: 0,
        lastSeenAt: timestamp,
        studentId: null,
        candidateStudentId: '',
        stabilityCount: 0,
        confirmedStudentId: null,
        pendingSwitch: false,
        lastDescriptorAt: 0,
      };

      const matchResult = matchResults[detIdx];
      const matchedId = matchResult?.studentId ?? null;
      track.box = boxes[detIdx]!;
      track.lastSeenAt = timestamp;
      if (matchResult) track.lastDescriptorAt = timestamp;

      const previousIdentity = track.confirmedStudentId;
      const identity = updateFaceTrackIdentity(track, matchedId, Boolean(matchResult));
      Object.assign(track, identity);
      if (matchedId && identity.confirmedStudentId === matchedId && previousIdentity !== matchedId) {
        const faceEntry = perFace.find(f => f.label === matchedId);
        if (faceEntry && faceEntry.confirmedAtFrame === -1) {
          faceEntry.confirmedAtFrame = frame;
        }
      }

      nextTracks.push(track);
    }

    // Carry over missed tracks (not relevant here but mirrors production).
    tracks.forEach((t, idx) => {
      if (!usedTracks.has(idx)) nextTracks.push(t);
    });
    tracks = nextTracks;

    // ── 4. Check if all identities are confirmed ───────────────────────
    if (perFace.every(f => f.confirmedAtFrame >= 0) && allConfirmedAtFrame < 0) {
      allConfirmedAtFrame = frame;
      break; // No need to keep scanning.
    }
  }

  const totalTimeMs = performance.now() - benchStart;

  return {
    faceCount,
    totalTimeMs,
    avgMatchTimePerFaceMs: totalMatchTimeMs / (faceCount * (allConfirmedAtFrame + 1 || 1)),
    framesToAllConfirmed: allConfirmedAtFrame,
    timeToAllConfirmedMs: totalTimeMs,
    descriptorsExtracted,
    maxDescriptorsInScan,
    perFace,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Multi-face recognition performance benchmark', () => {
  it('measures 1 simultaneous face — total, per-face, and confirmation time', () => {
    const result = runMultiFaceBench(1);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  BENCHMARK: 1 Simultaneous Face                         ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Total wall time .............. ${result.totalTimeMs.toFixed(2).padStart(10)} ms      ║`);
    console.log(`║  Avg match time / face ........ ${result.avgMatchTimePerFaceMs.toFixed(3).padStart(10)} ms      ║`);
    console.log(`║  Frames to all confirmed ...... ${String(result.framesToAllConfirmed).padStart(10)}          ║`);
    console.log(`║  Time to all confirmed ........ ${result.timeToAllConfirmedMs.toFixed(2).padStart(10)} ms      ║`);
    console.log('╠──────────────────────────────────────────────────────────╣');
    for (const face of result.perFace) {
      console.log(`║  ${face.label.padEnd(14)} match ${face.matchTimeMs.toFixed(3).padStart(8)} ms  confirmed @ frame ${String(face.confirmedAtFrame).padStart(2)}  ║`);
    }
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    expect(result.perFace.every(f => f.confirmedAtFrame >= 0)).toBe(true);
    expect(result.maxDescriptorsInScan).toBeLessThanOrEqual(3);
    expect(result.framesToAllConfirmed).toBeGreaterThanOrEqual(STABILITY_FRAMES_REQUIRED - 1);
    expect(result.totalTimeMs).toBeLessThan(3_000);
  });

  it('measures 3 simultaneous faces — total, per-face, and confirmation time', () => {
    const result = runMultiFaceBench(3);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  BENCHMARK: 3 Simultaneous Faces                        ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Total wall time .............. ${result.totalTimeMs.toFixed(2).padStart(10)} ms      ║`);
    console.log(`║  Avg match time / face ........ ${result.avgMatchTimePerFaceMs.toFixed(3).padStart(10)} ms      ║`);
    console.log(`║  Frames to all confirmed ...... ${String(result.framesToAllConfirmed).padStart(10)}          ║`);
    console.log(`║  Time to all confirmed ........ ${result.timeToAllConfirmedMs.toFixed(2).padStart(10)} ms      ║`);
    console.log('╠──────────────────────────────────────────────────────────╣');
    for (const face of result.perFace) {
      console.log(`║  ${face.label.padEnd(14)} match ${face.matchTimeMs.toFixed(3).padStart(8)} ms  confirmed @ frame ${String(face.confirmedAtFrame).padStart(2)}  ║`);
    }
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Sanity: every face must be confirmed.
    expect(result.perFace.every(f => f.confirmedAtFrame >= 0)).toBe(true);
    expect(result.maxDescriptorsInScan).toBeLessThanOrEqual(3);

    // Stability requires STABILITY_FRAMES_REQUIRED consecutive matches.
    expect(result.framesToAllConfirmed).toBeGreaterThanOrEqual(STABILITY_FRAMES_REQUIRED - 1);

    // 3 faces should be well under 3 s.
    expect(result.totalTimeMs).toBeLessThan(3_000);
  });

  it('measures 5 simultaneous faces — total, per-face, and confirmation time', () => {
    const result = runMultiFaceBench(5);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  BENCHMARK: 5 Simultaneous Faces                        ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Total wall time .............. ${result.totalTimeMs.toFixed(2).padStart(10)} ms      ║`);
    console.log(`║  Avg match time / face ........ ${result.avgMatchTimePerFaceMs.toFixed(3).padStart(10)} ms      ║`);
    console.log(`║  Frames to all confirmed ...... ${String(result.framesToAllConfirmed).padStart(10)}          ║`);
    console.log(`║  Time to all confirmed ........ ${result.timeToAllConfirmedMs.toFixed(2).padStart(10)} ms      ║`);
    console.log('╠──────────────────────────────────────────────────────────╣');
    for (const face of result.perFace) {
      console.log(`║  ${face.label.padEnd(14)} match ${face.matchTimeMs.toFixed(3).padStart(8)} ms  confirmed @ frame ${String(face.confirmedAtFrame).padStart(2)}  ║`);
    }
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Every face must eventually confirm.
    expect(result.perFace.every(f => f.confirmedAtFrame >= 0)).toBe(true);
    expect(result.maxDescriptorsInScan).toBeLessThanOrEqual(3);

    // Stability gate.
    expect(result.framesToAllConfirmed).toBeGreaterThanOrEqual(STABILITY_FRAMES_REQUIRED - 1);

    // THE 3-SECOND BUDGET: if this fails, the measurements above tell us
    // exactly which part (matching vs. stability frames) needs optimization.
    expect(result.totalTimeMs).toBeLessThan(3_000);
  });

  it('compares 3-face vs 5-face scaling — per-face cost should not grow linearly', () => {
    const r3 = runMultiFaceBench(3);
    const r5 = runMultiFaceBench(5);

    const ratio = r5.avgMatchTimePerFaceMs / Math.max(r3.avgMatchTimePerFaceMs, 0.001);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  SCALING COMPARISON: 3 faces → 5 faces                  ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  3-face avg/face .............. ${r3.avgMatchTimePerFaceMs.toFixed(3).padStart(10)} ms      ║`);
    console.log(`║  5-face avg/face .............. ${r5.avgMatchTimePerFaceMs.toFixed(3).padStart(10)} ms      ║`);
    console.log(`║  Per-face slowdown ratio ...... ${ratio.toFixed(2).padStart(10)}x         ║`);
    console.log(`║  3-face total ................. ${r3.totalTimeMs.toFixed(2).padStart(10)} ms      ║`);
    console.log(`║  5-face total ................. ${r5.totalTimeMs.toFixed(2).padStart(10)} ms      ║`);
    console.log(`║  Total slowdown factor ........ ${(r5.totalTimeMs / Math.max(r3.totalTimeMs, 0.001)).toFixed(2).padStart(10)}x         ║`);
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Per-face cost should not more than double when gallery grows from 3→5.
    // (Gallery has only N entries; scoreFaceNetMatch is O(N) per query.)
    expect(ratio).toBeLessThan(3.0);
  });

  it('produces actionable breakdown showing which phase dominates', () => {
    const r5 = runMultiFaceBench(5);

    // The matching phase runs scoreFaceNetMatch N times × F frames.
    // The tracking phase runs assignFaceDetectionTracks once per frame.
    // If totalTimeMs is above budget, the ratio tells us where the bottleneck is.
    const matchingFraction = (r5.avgMatchTimePerFaceMs * r5.faceCount * (r5.framesToAllConfirmed + 1))
      / Math.max(r5.totalTimeMs, 0.001);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  PHASE BREAKDOWN (5 faces)                               ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Matching share of total ...... ${(matchingFraction * 100).toFixed(1).padStart(10)}%        ║`);
    console.log(`║  Tracking + overhead share .... ${((1 - matchingFraction) * 100).toFixed(1).padStart(10)}%        ║`);
    console.log(`║  Stability frames needed ...... ${String(STABILITY_FRAMES_REQUIRED).padStart(10)}          ║`);
    console.log(`║  Distance threshold ........... ${String(FACENET_DISTANCE_THRESHOLD).padStart(10)}          ║`);
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Just ensure the breakdown is computable — values are informational.
    expect(matchingFraction).toBeGreaterThanOrEqual(0);
    expect(matchingFraction).toBeLessThanOrEqual(1);
  });

  it('simulates 60 seconds of moving 3-5 faces with fair, capped re-verification', () => {
    const scanIntervalMs = 200;
    const simulatedFrames = 60_000 / scanIntervalMs;
    const reports: Array<{ faces: number; maxReverifyGapMs: number; maxDescriptors: number }> = [];

    for (const faceCount of [3, 4, 5]) {
      const tracks = Array.from({ length: faceCount }, (_, index) => ({
        box: faceBox(index, faceCount),
        velocityX: 0,
        velocityY: 0,
        lastSeenAt: 0,
        studentId: `student-${index}`,
      }));
      const lastDescriptorAt = Array(faceCount).fill(-1000) as number[];
      const lastVerifiedAt = [...lastDescriptorAt];
      let rotationCursor = 0;
      let maxDescriptors = 0;
      let maxReverifyGapMs = 0;

      for (let frame = 0; frame < simulatedFrames; frame++) {
        const timestamp = frame * scanIntervalMs;
        const personOrder = Array.from({ length: faceCount }, (_, offset) =>
          (offset + frame) % faceCount
        );
        const boxes = personOrder.map(person => {
          const base = faceBox(person, faceCount);
          const phase = timestamp / 1300 + person;
          return {
            ...base,
            x: base.x + Math.sin(phase) * 18,
            y: base.y + Math.cos(phase) * 10,
          };
        });
        const initialAssignments = assignFaceDetectionTracks(
          boxes,
          tracks,
          boxes.map(() => null),
          timestamp
        );
        const selection = selectFaceDescriptorDetections(
          boxes.map((_, index) => {
            const trackIndex = initialAssignments[index];
            return {
              confirmed: true,
              lastDescriptorAt: trackIndex === null || trackIndex === undefined
                ? 0
                : lastDescriptorAt[trackIndex]!,
            };
          }),
          timestamp,
          rotationCursor
        );
        rotationCursor = selection.nextRotationCursor;
        maxDescriptors = Math.max(maxDescriptors, selection.indices.length);

        const extracted = new Set(selection.indices);
        const detectionStudents = boxes.map((_, index) => {
          const trackIndex = initialAssignments[index];
          if (extracted.has(index)) {
            const person = personOrder[index]!;
            maxReverifyGapMs = Math.max(
              maxReverifyGapMs,
              timestamp - lastVerifiedAt[person]!
            );
            lastVerifiedAt[person] = timestamp;
            if (trackIndex !== null && trackIndex !== undefined) {
              lastDescriptorAt[trackIndex] = timestamp;
            }
            return `student-${person}`;
          }
          return trackIndex === null || trackIndex === undefined
            ? null
            : tracks[trackIndex]!.studentId;
        });
        const assignments = assignFaceDetectionTracks(boxes, tracks, detectionStudents, timestamp);

        assignments.forEach((trackIndex, index) => {
          const person = personOrder[index]!;
          expect(trackIndex).toBe(person);
          if (trackIndex === null) return;
          const previous = tracks[trackIndex]!.box;
          tracks[trackIndex]!.velocityX = (boxes[index]!.x - previous.x) / scanIntervalMs;
          tracks[trackIndex]!.velocityY = (boxes[index]!.y - previous.y) / scanIntervalMs;
          tracks[trackIndex]!.box = boxes[index]!;
          tracks[trackIndex]!.lastSeenAt = timestamp;
        });
      }

      expect(maxDescriptors).toBeLessThanOrEqual(3);
      expect(lastVerifiedAt.every(timestamp => timestamp >= 59_000)).toBe(true);
      expect(maxReverifyGapMs).toBeLessThanOrEqual(1200);
      reports.push({ faces: faceCount, maxReverifyGapMs, maxDescriptors });
    }

    console.info('[FaceRecognition] Simulated 60-second moving-face benchmark', reports);
  });

  it('scales to a 10-student gallery with 5 live faces to stress-test matching', () => {
    // Gallery has 10 enrolled students but only 5 appear on camera.
    const fullGallery: LabeledDescriptors[] = Array.from({ length: 10 }, (_, i) => ({
      label: `student-${i}`,
      descriptors: [syntheticDescriptor(i * 10)],
    }));

    // Only students 0–4 show up.
    const liveDescriptors = fullGallery.slice(0, 5).map(entry =>
      perturbDescriptor(entry.descriptors[0] as Float32Array)
    );

    const t0 = performance.now();
    const results = liveDescriptors.map(desc => scoreFaceNetMatch(desc, fullGallery));
    const elapsed = performance.now() - t0;

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  STRESS: 5 live faces vs 10-student gallery              ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Total 5-query time ........... ${elapsed.toFixed(2).padStart(10)} ms      ║`);
    console.log(`║  Avg per query ................ ${(elapsed / 5).toFixed(3).padStart(10)} ms      ║`);
    for (const r of results) {
      console.log(`║  ${r.label.padEnd(14)} dist ${r.distance.toFixed(4).padStart(8)}  ${r.accepted ? '✓' : '✗'} ${r.reason.padEnd(18)} ║`);
    }
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // All 5 should match correctly.
    expect(results.every(r => r.accepted)).toBe(true);
    expect(results.map(r => r.label)).toEqual([
      'student-0', 'student-1', 'student-2', 'student-3', 'student-4',
    ]);

    // Should still be under budget even with a larger gallery.
    expect(elapsed).toBeLessThan(500);
  });
});
