import type { EventType } from '@/types/domain.types';

export const ATTENDANCE_TIME_ZONE = 'Asia/Manila';

export function attendanceDayKey(value: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function attendanceEventKey(
  studentId: string,
  eventType: EventType,
  value: string | number | Date
): string {
  return `${studentId}_${eventType}_${attendanceDayKey(value)}`;
}

export function reserveAttendanceEvent(
  reservations: Map<string, number>,
  key: string,
  timestamp = Date.now()
): boolean {
  if (reservations.has(key)) return false;
  reservations.set(key, timestamp);
  return true;
}
