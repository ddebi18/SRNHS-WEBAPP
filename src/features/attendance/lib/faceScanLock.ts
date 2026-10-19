export function tryAcquireFaceScan(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseFaceScan(lock: { current: boolean }): void {
  lock.current = false;
}
