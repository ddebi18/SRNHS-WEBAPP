import * as faceapi from '@vladmandic/face-api';

/**
 * TESDA BSRS (Biometric-enabled Scholarship Registration System)
 * MegaMatcher Face Engine Specifications & Recommendations
 *
 * Core Standards Implemented:
 * 1. Native Interpupillary Distance (IOD):
 *    - 32px: Minimal distance between eyes for template extraction
 *    - 64px+: Recommended distance for high accuracy matching
 *    - 80px+: Minimal distance for reliable liveness check (100px+ optimal)
 * 2. Head Posture Tolerances:
 *    - Head Roll (tilt):  ±15° default (sufficient for near-frontal)
 *    - Head Pitch (nod):  ±15° from frontal position (up to ±25° if multi-view enrolled)
 *    - Head Yaw (bobble): ±15° for near-frontal scanning (up to ±90° if multi-view enrolled)
 * 3. Pre-Extraction Liveness Gate:
 *    - Performed BEFORE feature extraction. If liveness fails, features are not extracted.
 *    - Single face constraint: exactly one face in stream.
 * 4. Mask / Respirator Mode:
 *    - Lower-face checks disabled; periocular IOD and eye-level features enforced.
 */

export const TESDA_MIN_IOD_PX = 32;
export const TESDA_RECOMMENDED_IOD_PX = 64;
export const TESDA_LIVENESS_MIN_IOD_PX = 80;
export const TESDA_LIVENESS_OPTIMAL_IOD_PX = 100;

export const TESDA_MAX_ROLL_DEG = 15;
export const TESDA_MAX_PITCH_DEG = 15;
export const TESDA_MAX_YAW_DEG = 15;
export const TESDA_MULTI_ENROLL_PITCH_DEG = 25;

export interface EyeCenterPoints {
  leftEyeCenter: { x: number; y: number };
  rightEyeCenter: { x: number; y: number };
}

export interface HeadPoseResult {
  rollDeg: number;   // Tilt left/right
  pitchDeg: number;  // Nod up/down
  yawDeg: number;    // Turn left/right
}

export interface TesdaQualityResult {
  passed: boolean;
  nativeIOD: number;
  pose: HeadPoseResult;
  livenessEligible: boolean;
  isHighAccuracy: boolean;
  rejectionReason:
    | null
    | 'MULTIPLE_FACES'
    | 'IOD_CRITICAL_TOO_LOW'
    | 'IOD_BELOW_RECOMMENDED'
    | 'IOD_LIVENESS_TOO_LOW'
    | 'ROLL_TOLERANCE_EXCEEDED'
    | 'PITCH_TOLERANCE_EXCEEDED'
    | 'YAW_TOLERANCE_EXCEEDED';
  userGuidance: string;
}

export interface TesdaQualityOptions {
  isMaskWorn?: boolean;
  multiViewEnrolled?: boolean;
  strictLivenessRequired?: boolean;
}

/**
 * Computes native eye centers from standard 68-point facial landmarks.
 * Left eye: points 36 to 41
 * Right eye: points 42 to 47
 */
export function computeNativeEyeCenters(
  pts: Array<{ x: number; y: number }> | faceapi.Point[]
): EyeCenterPoints {
  let leftX = 0;
  let leftY = 0;
  for (let i = 36; i <= 41; i++) {
    leftX += pts[i]?.x || 0;
    leftY += pts[i]?.y || 0;
  }

  let rightX = 0;
  let rightY = 0;
  for (let i = 42; i <= 47; i++) {
    rightX += pts[i]?.x || 0;
    rightY += pts[i]?.y || 0;
  }

  return {
    leftEyeCenter: { x: leftX / 6, y: leftY / 6 },
    rightEyeCenter: { x: rightX / 6, y: rightY / 6 },
  };
}

/**
 * Native Interpupillary Distance (IOD) in pixels.
 * Must be computed from native camera frame pixels, not scaled down.
 */
export function computeNativeIOD(
  pts: Array<{ x: number; y: number }> | faceapi.Point[]
): number {
  if (!pts || pts.length < 48) return 0;
  const { leftEyeCenter, rightEyeCenter } = computeNativeEyeCenters(pts);
  return Math.hypot(rightEyeCenter.x - leftEyeCenter.x, rightEyeCenter.y - leftEyeCenter.y);
}

/**
 * Computes Head Roll, Pitch, and Yaw based on 68 landmarks.
 * - Roll: Eye-line tilt angle relative to horizontal axis
 * - Pitch: Vertical ratio comparing eye-to-nose vs. nose-to-mouth distances
 * - Yaw: Horizontal ratio of nose tip to outer eye corners
 */
export function computeHeadPose(
  pts: Array<{ x: number; y: number }> | faceapi.Point[]
): HeadPoseResult {
  if (!pts || pts.length < 68) {
    return { rollDeg: 0, pitchDeg: 0, yawDeg: 0 };
  }

  const { leftEyeCenter, rightEyeCenter } = computeNativeEyeCenters(pts);

  // 1. Head Roll (tilt) in degrees
  const deltaX = rightEyeCenter.x - leftEyeCenter.x;
  const deltaY = rightEyeCenter.y - leftEyeCenter.y;
  let rollRad = Math.atan2(deltaY, deltaX);
  let rollDeg = rollRad * (180 / Math.PI);
  // Normalize to [-180, 180]
  if (rollDeg > 180) rollDeg -= 360;
  if (rollDeg < -180) rollDeg += 360;

  // 2. Head Yaw (turn left/right)
  // Nose tip is point 30. Left eye outer corner is 36, Right eye outer corner is 45.
  const noseTip = pts[30]!;
  const leftOuter = pts[36]!;
  const rightOuter = pts[45]!;

  const distToLeftEye = Math.hypot(noseTip.x - leftOuter.x, noseTip.y - leftOuter.y);
  const distToRightEye = Math.hypot(noseTip.x - rightOuter.x, noseTip.y - rightOuter.y);
  const totalEyeSpan = distToLeftEye + distToRightEye;

  // Yaw estimation: centered face has ratio ~ 0.5; deviation indicates turn
  const yawRatio = totalEyeSpan > 1e-4 ? (distToLeftEye - distToRightEye) / totalEyeSpan : 0;
  // Scaled approximately to degrees: 0.33 yaw ratio corresponds to ~30 degrees
  const yawDeg = Math.max(-90, Math.min(90, yawRatio * 90));

  // 3. Head Pitch (nod up/down)
  // Midpoint between eyes:
  const eyeMidY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
  // Mouth center: midpoint between mouth corners 48 and 54
  const mouthMidY = ((pts[48]?.y || 0) + (pts[54]?.y || 0)) / 2;
  const eyeToNose = noseTip.y - eyeMidY;
  const noseToMouth = mouthMidY - noseTip.y;
  const totalVerticalSpan = eyeToNose + noseToMouth;

  // Ideal frontal ratio: eye-to-nose is ~40-45% of eye-to-mouth
  const pitchRatio = totalVerticalSpan > 1e-4 ? (eyeToNose - noseToMouth * 0.8) / totalVerticalSpan : 0;
  const pitchDeg = Math.max(-45, Math.min(45, pitchRatio * 65));

  return {
    rollDeg: Math.round(rollDeg * 10) / 10,
    pitchDeg: Math.round(pitchDeg * 10) / 10,
    yawDeg: Math.round(yawDeg * 10) / 10,
  };
}

/**
 * Validates face quality against TESDA BSRS MegaMatcher specifications.
 * Evaluates IOD tiers and posture angles (roll, pitch, yaw).
 */
export function evaluateTesdaQuality(
  pts: Array<{ x: number; y: number }> | faceapi.Point[] | null | undefined,
  _box?: { width: number; height: number } | null,
  options?: TesdaQualityOptions
): TesdaQualityResult {
  if (!pts || pts.length < 68) {
    return {
      passed: false,
      nativeIOD: 0,
      pose: { rollDeg: 0, pitchDeg: 0, yawDeg: 0 },
      livenessEligible: false,
      isHighAccuracy: false,
      rejectionReason: 'IOD_CRITICAL_TOO_LOW',
      userGuidance: 'Please position your face within the camera frame.',
    };
  }

  const nativeIOD = Math.round(computeNativeIOD(pts));
  const pose = computeHeadPose(pts);
  const isMask = Boolean(options?.isMaskWorn);
  const multiView = Boolean(options?.multiViewEnrolled);

  const maxPitch = multiView ? TESDA_MULTI_ENROLL_PITCH_DEG : TESDA_MAX_PITCH_DEG;
  const maxYaw = TESDA_MAX_YAW_DEG; // Near-frontal for reliable real-time recognition

  // 1. Critical IOD Check (< 32px: TESDA states template extraction is unreliable)
  if (nativeIOD < TESDA_MIN_IOD_PX) {
    return {
      passed: false,
      nativeIOD,
      pose,
      livenessEligible: false,
      isHighAccuracy: false,
      rejectionReason: 'IOD_CRITICAL_TOO_LOW',
      userGuidance: `Move closer to camera (Eye resolution too low: ${nativeIOD}px / min ${TESDA_MIN_IOD_PX}px).`,
    };
  }

  // 2. Head Roll Check (Tilt > ±15°)
  if (Math.abs(pose.rollDeg) > TESDA_MAX_ROLL_DEG) {
    return {
      passed: false,
      nativeIOD,
      pose,
      livenessEligible: false,
      isHighAccuracy: false,
      rejectionReason: 'ROLL_TOLERANCE_EXCEEDED',
      userGuidance: `Keep your head upright (Tilt: ${Math.abs(pose.rollDeg)}° > max ${TESDA_MAX_ROLL_DEG}°).`,
    };
  }

  // 3. Head Yaw Check (Turn > ±15° for near-frontal)
  if (Math.abs(pose.yawDeg) > maxYaw) {
    return {
      passed: false,
      nativeIOD,
      pose,
      livenessEligible: false,
      isHighAccuracy: false,
      rejectionReason: 'YAW_TOLERANCE_EXCEEDED',
      userGuidance: `Look directly at the camera (Turn angle: ${Math.abs(pose.yawDeg)}° > max ${maxYaw}°).`,
    };
  }

  // 4. Head Pitch Check (Nod up/down > ±15°, bypass if mask is worn)
  if (!isMask && Math.abs(pose.pitchDeg) > maxPitch) {
    return {
      passed: false,
      nativeIOD,
      pose,
      livenessEligible: false,
      isHighAccuracy: false,
      rejectionReason: 'PITCH_TOLERANCE_EXCEEDED',
      userGuidance: `Level your head with the camera (Pitch: ${Math.abs(pose.pitchDeg)}° > max ${maxPitch}°).`,
    };
  }

  // Liveness qualification tier: TESDA requires IOD >= 80px (100px+ optimal)
  const livenessEligible = nativeIOD >= TESDA_LIVENESS_MIN_IOD_PX;

  // Strict liveness check requested:
  if (options?.strictLivenessRequired && !livenessEligible) {
    return {
      passed: false,
      nativeIOD,
      pose,
      livenessEligible: false,
      isHighAccuracy: nativeIOD >= TESDA_RECOMMENDED_IOD_PX,
      rejectionReason: 'IOD_LIVENESS_TOO_LOW',
      userGuidance: `Step closer for liveness check (${nativeIOD}px / min ${TESDA_LIVENESS_MIN_IOD_PX}px).`,
    };
  }

  const isHighAccuracy = nativeIOD >= TESDA_RECOMMENDED_IOD_PX;
  const userGuidance = !isHighAccuracy
    ? `Step closer for optimal accuracy (${nativeIOD}px / recommended ${TESDA_RECOMMENDED_IOD_PX}px).`
    : 'Face aligned. Hold steady.';

  return {
    passed: true,
    nativeIOD,
    pose,
    livenessEligible,
    isHighAccuracy,
    rejectionReason: null,
    userGuidance,
  };
}
