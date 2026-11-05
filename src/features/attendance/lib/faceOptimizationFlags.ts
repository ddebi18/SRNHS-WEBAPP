export const FACE_STARTUP_OPTIMIZATIONS_ENABLED =
  import.meta.env.VITE_FACE_STARTUP_OPTIMIZATIONS === 'true';
export const FACE_MOBILE_OPTIMIZATIONS_ENABLED =
  import.meta.env.VITE_FACE_MOBILE_OPTIMIZATIONS === 'true';
export const FACE_SELF_HOSTED_MODELS_ENABLED =
  import.meta.env.VITE_FACE_SELF_HOSTED_MODELS === 'true';
export const FACE_DIAGNOSTICS_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_FACE_DIAGNOSTICS === 'true';

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

export function getScrfdInputSize(isMobileOptimized: boolean, configuredSize?: string): 640 | 480 | 320 {
  if (!isMobileOptimized) return 640;
  if (configuredSize === '480') return 480;
  if (configuredSize === '320') return 320;
  return 640;
}
