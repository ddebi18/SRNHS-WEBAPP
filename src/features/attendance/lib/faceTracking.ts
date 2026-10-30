export interface FaceTrackBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PredictableFaceTrack {
  box: FaceTrackBox;
  velocityX: number;
  velocityY: number;
  lastSeenAt: number;
  studentId: string | null;
}

export function predictFaceTrackBox(
  box: FaceTrackBox,
  velocityX: number,
  velocityY: number,
  lastSeenAt: number,
  timestamp: number,
  maxPredictionMs = 400
): FaceTrackBox {
  const elapsed = Math.min(maxPredictionMs, Math.max(0, timestamp - lastSeenAt));
  return {
    ...box,
    x: box.x + velocityX * elapsed,
    y: box.y + velocityY * elapsed,
  };
}

export interface DescriptorTrackState {
  confirmed: boolean;
  lastDescriptorAt: number;
}

export interface FaceTrackIdentityState {
  candidateStudentId: string;
  stabilityCount: number;
  confirmedStudentId: string | null;
  pendingSwitch: boolean;
  matchHistory: Array<string | null>;
}

export function canFastConfirmFaceMatch(
  distance: number,
  secondDistance: number,
  enabled: boolean,
  fastThreshold = 0.33,
  ambiguityMargin = 0.1
): boolean {
  return enabled &&
    distance < fastThreshold &&
    secondDistance - distance > ambiguityMargin;
}

export function updateFaceTrackIdentity(
  state: FaceTrackIdentityState,
  matchedStudentId: string | null,
  descriptorEvaluated: boolean,
  sameStudentVerified = true,
  confirmationFrames = 3,
  switchFrames = 5,
  fastConfirm = false
): FaceTrackIdentityState {
  if (!descriptorEvaluated) return state;
  if (matchedStudentId && matchedStudentId === state.confirmedStudentId) {
    if (!sameStudentVerified) return state;
    return {
      ...state,
      candidateStudentId: matchedStudentId,
      stabilityCount: confirmationFrames,
      confirmedStudentId: matchedStudentId,
      pendingSwitch: false,
    };
  }
  const matchHistory = [...state.matchHistory, matchedStudentId].slice(-4);
  if (matchedStudentId) {
    if (!state.confirmedStudentId) {
      const count = matchHistory.filter(id => id === matchedStudentId).length;
      const hasConflictingMatch = matchHistory.some(id => id !== null && id !== matchedStudentId);
      return {
        candidateStudentId: matchedStudentId,
        stabilityCount: count,
        confirmedStudentId: fastConfirm || (count >= 2 && !hasConflictingMatch)
          ? matchedStudentId
          : null,
        pendingSwitch: false,
        matchHistory,
      };
    }
    const changingIdentity = state.pendingSwitch ||
      Boolean(state.confirmedStudentId && state.confirmedStudentId !== matchedStudentId);
    const stabilityCount = state.candidateStudentId === matchedStudentId
      ? state.stabilityCount + 1
      : 1;
    const requiredFrames = changingIdentity ? switchFrames : confirmationFrames;
    return {
      matchHistory,
      candidateStudentId: matchedStudentId,
      stabilityCount,
      confirmedStudentId: stabilityCount >= requiredFrames
        ? matchedStudentId
        : state.confirmedStudentId,
      pendingSwitch: changingIdentity && stabilityCount < requiredFrames,
    };
  }
  return {
    matchHistory,
    candidateStudentId: '',
    stabilityCount: 0,
    confirmedStudentId: state.confirmedStudentId,
    pendingSwitch: state.confirmedStudentId ? state.pendingSwitch : false,
  };
}

export function selectFaceDescriptorDetections(
  tracks: DescriptorTrackState[],
  timestamp: number,
  rotationCursor = 0,
  maxPerScan = 3,
  reverifyIntervalMs = 1000
): { indices: number[]; nextRotationCursor: number } {
  const rotated = (indices: number[]) => {
    if (indices.length === 0) return indices;
    const start = ((rotationCursor % tracks.length) + tracks.length) % tracks.length;
    return indices.sort((a, b) =>
      (a - start + tracks.length) % tracks.length -
      (b - start + tracks.length) % tracks.length
    );
  };
  const unconfirmed = rotated(tracks.flatMap((track, index) => track.confirmed ? [] : [index]));
  const dueConfirmed = rotated(tracks.flatMap((track, index) =>
    track.confirmed && timestamp - track.lastDescriptorAt >= reverifyIntervalMs ? [index] : []
  ));
  const reserveForConfirmed = dueConfirmed.length > 0 && maxPerScan > 1 ? 1 : 0;
  const selected = unconfirmed.slice(0, maxPerScan - reserveForConfirmed);
  const remaining = maxPerScan - selected.length;
  selected.push(...dueConfirmed.slice(0, remaining));
  if (selected.length < maxPerScan) {
    selected.push(...unconfirmed.slice(selected.length, maxPerScan));
  }
  const last = selected.at(-1);
  return {
    indices: selected,
    nextRotationCursor: tracks.length && last !== undefined ? (last + 1) % tracks.length : rotationCursor,
  };
}

export function findDuplicateStudentClaimLosers(
  claims: Array<{ studentId: string | null; distance: number }>
): number[] {
  const winners = new Map<string, number>();
  claims.forEach((claim, index) => {
    if (!claim.studentId) return;
    const currentIndex = winners.get(claim.studentId);
    if (currentIndex === undefined || claim.distance < claims[currentIndex]!.distance) {
      winners.set(claim.studentId, index);
    }
  });
  return claims.flatMap((claim, index) =>
    claim.studentId && winners.get(claim.studentId) !== index ? [index] : []
  );
}

function intersectionOverUnion(a: FaceTrackBox, b: FaceTrackBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

export function assignFaceDetectionTracks(
  detections: FaceTrackBox[],
  tracks: PredictableFaceTrack[],
  detectionStudentIds: Array<string | null>,
  timestamp: number
): Array<number | null> {
  if (!detections.length || !tracks.length) return Array(detections.length).fill(null);
  const detectionCount = detections.length;
  const trackCount = tracks.length;
  const unmatchedCost = 1.25;
  const impossibleCost = 1_000_000;
  const size = detectionCount + trackCount;
  const costs = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => {
      if (row >= detectionCount && column >= trackCount) return 0;
      if (row >= detectionCount || column >= trackCount) return unmatchedCost;
      const detection = detections[row]!;
      const track = tracks[column]!;
      const studentId = detectionStudentIds[row] ?? null;
      const elapsed = Math.min(400, Math.max(0, timestamp - track.lastSeenAt));
      const trackCenterX = track.box.x + track.box.width / 2;
      const trackCenterY = track.box.y + track.box.height / 2;
      const predictedCenterX = trackCenterX + track.velocityX * elapsed;
      const predictedCenterY = trackCenterY + track.velocityY * elapsed;
      const detectionCenterX = detection.x + detection.width / 2;
      const detectionCenterY = detection.y + detection.height / 2;
      const distance = Math.hypot(
        detectionCenterX - predictedCenterX,
        detectionCenterY - predictedCenterY
      );
      const maxDistance = Math.max(
        55,
        Math.max(detection.width, detection.height, track.box.width, track.box.height) * 1.25
      );
      const sameStudent = Boolean(studentId && track.studentId === studentId);
      if (distance > maxDistance && !sameStudent) return impossibleCost;

      const predictedBox = {
        x: predictedCenterX - track.box.width / 2,
        y: predictedCenterY - track.box.height / 2,
        width: track.box.width,
        height: track.box.height,
      };
      const conflictingStudents = Boolean(studentId && track.studentId && track.studentId !== studentId);
      return (
        distance / maxDistance -
        intersectionOverUnion(detection, predictedBox) * 0.35 +
        (sameStudent ? -2 : 0) +
        (conflictingStudents ? 1 : 0)
      );
    })
  );

  const rowPotentials = Array(size + 1).fill(0);
  const columnPotentials = Array(size + 1).fill(0);
  const matchedRow = Array(size + 1).fill(0);
  const previousColumn = Array(size + 1).fill(0);
  for (let row = 1; row <= size; row++) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minimumCosts = Array(size + 1).fill(Number.POSITIVE_INFINITY);
    const usedColumns = Array(size + 1).fill(false);
    do {
      usedColumns[currentColumn] = true;
      const currentRow = matchedRow[currentColumn]!;
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let column = 1; column <= size; column++) {
        if (usedColumns[column]) continue;
        const reducedCost =
          costs[currentRow - 1]![column - 1]! -
          rowPotentials[currentRow]! -
          columnPotentials[column]!;
        if (reducedCost < minimumCosts[column]!) {
          minimumCosts[column] = reducedCost;
          previousColumn[column] = currentColumn;
        }
        if (minimumCosts[column]! < delta) {
          delta = minimumCosts[column]!;
          nextColumn = column;
        }
      }
      for (let column = 0; column <= size; column++) {
        if (usedColumns[column]) {
          rowPotentials[matchedRow[column]!] += delta;
          columnPotentials[column] -= delta;
        } else {
          minimumCosts[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);
    do {
      const nextColumn = previousColumn[currentColumn]!;
      matchedRow[currentColumn] = matchedRow[nextColumn]!;
      currentColumn = nextColumn;
    } while (currentColumn !== 0);
  }

  const assignments: Array<number | null> = Array(detectionCount).fill(null);
  for (let column = 1; column <= size; column++) {
    const row = matchedRow[column]! - 1;
    const track = column - 1;
    if (
      row >= 0 &&
      row < detectionCount &&
      track < trackCount &&
      costs[row]![track]! < unmatchedCost * 2
    ) {
      assignments[row] = track;
    }
  }

  return assignments;
}
