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
  const assignments: Array<number | null> = Array(detections.length).fill(null);
  const candidates: Array<{ detectionIndex: number; trackIndex: number; cost: number }> = [];

  detections.forEach((detection, detectionIndex) => {
    const studentId = detectionStudentIds[detectionIndex] ?? null;

    tracks.forEach((track, trackIndex) => {
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
      if (distance > maxDistance && !sameStudent) return;

      const predictedBox = {
        x: predictedCenterX - track.box.width / 2,
        y: predictedCenterY - track.box.height / 2,
        width: track.box.width,
        height: track.box.height,
      };
      const conflictingStudents = Boolean(studentId && track.studentId && track.studentId !== studentId);
      const cost =
        distance / maxDistance -
        intersectionOverUnion(detection, predictedBox) * 0.35 +
        (sameStudent ? -2 : 0) +
        (conflictingStudents ? 1 : 0);
      candidates.push({ detectionIndex, trackIndex, cost });
    });
  });

  candidates.sort((a, b) => a.cost - b.cost);
  const assignedTracks = new Set<number>();
  for (const candidate of candidates) {
    if (assignments[candidate.detectionIndex] !== null || assignedTracks.has(candidate.trackIndex)) continue;
    assignments[candidate.detectionIndex] = candidate.trackIndex;
    assignedTracks.add(candidate.trackIndex);
  }

  return assignments;
}
