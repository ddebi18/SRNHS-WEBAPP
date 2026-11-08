export const FACE_STARTUP_OPTIMIZATIONS_ENABLED =
  import.meta.env.VITE_FACE_STARTUP_OPTIMIZATIONS === 'true';
export const FACE_MOBILE_OPTIMIZATIONS_ENABLED =
  import.meta.env.VITE_FACE_MOBILE_OPTIMIZATIONS === 'true';
export const FACE_SELF_HOSTED_MODELS_ENABLED =
  import.meta.env.VITE_FACE_SELF_HOSTED_MODELS === 'true';
export const FACE_DIAGNOSTICS_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_FACE_DIAGNOSTICS === 'true';
export const FACE_REGISTRATION_SCRFD_500M_ENABLED =
  import.meta.env.VITE_FACE_REGISTRATION_SCRFD_500M === 'true';
export const FACE_CROP_RETRY_DIAGNOSTICS_ENABLED =
  FACE_DIAGNOSTICS_ENABLED && import.meta.env.VITE_FACE_CROP_RETRY_DIAGNOSTICS === 'true';
export const FACE_ATTEMPT_LOGS_ENABLED =
  FACE_DIAGNOSTICS_ENABLED && import.meta.env.VITE_FACE_ATTEMPT_LOGS === 'true';
export const FACE_CROP_PADDING_COMPARISON_ENABLED =
  FACE_DIAGNOSTICS_ENABLED && import.meta.env.VITE_FACE_CROP_PADDING_COMPARISON === 'true';
export const FACE_CROP_ADAPTIVE_RETRY_ENABLED =
  import.meta.env.VITE_FACE_CROP_ADAPTIVE_RETRY !== 'false';
export const FACE_MOTION_OPTIMIZATIONS_ENABLED =
  import.meta.env.VITE_FACE_MOTION_OPTIMIZATIONS === 'true';

export function getFaceCropDetectorInputSize(
  configuredValue = import.meta.env.VITE_FACE_CROP_DETECTOR_INPUT_SIZE
): number {
  const configured = Number(configuredValue);
  return configured >= 416 && configured <= 608 && configured % 32 === 0 ? configured : 416;
}

export function isMobileDevice(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  userAgentDataMobile?: boolean
): boolean {
  return userAgentDataMobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function isMobileFaceOptimizationActive(): boolean {
  if (!FACE_MOBILE_OPTIMIZATIONS_ENABLED || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return isMobileDevice(navigator.userAgent, nav.userAgentData?.mobile);
}

export function getFaceDescriptorBudget(isMobileOptimized: boolean): number {
  return isMobileOptimized ? 2 : 3;
}

export function getScanOverrunCooldownMs(
  lastScanDurationMs: number,
  minimumMs = 100,
  maximumMs = 200
): number {
  return Math.min(maximumMs, Math.max(minimumMs, lastScanDurationMs * 0.5));
}

export function getScrfdInputSize(isMobileOptimized: boolean, configuredSize?: string): 640 | 480 | 320 {
  if (!isMobileOptimized) return 640;
  if (configuredSize === '480') return 480;
  if (configuredSize === '320') return 320;
  return 640;
}

export function isRecentFaceDetection(
  lastDetectedAt: number | null,
  now: number,
  maxAgeMs = 1000
): boolean {
  if (lastDetectedAt === null) return false;
  const ageMs = now - lastDetectedAt;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}
