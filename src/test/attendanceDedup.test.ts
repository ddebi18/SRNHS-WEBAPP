import { describe, expect, it } from 'vitest';
import {
  attendanceDayKey,
  attendanceEventKey,
  reserveAttendanceEvent,
} from '@/features/attendance/lib/attendanceDedup';

describe('attendance event de-duplication', () => {
  it('uses the school calendar day rather than the browser timezone', () => {
    expect(attendanceDayKey('2026-10-14T16:30:00.000Z')).toBe('2026-10-15');
    expect(attendanceEventKey('student-1', 'entry', '2026-10-14T16:30:00.000Z'))
      .toBe('student-1_entry_2026-10-15');
  });

  it('reserves a student event once until its write fails and releases the reservation', () => {
    const reservations = new Map<string, number>();
    const key = attendanceEventKey('student-1', 'entry', '2026-10-15T01:00:00.000Z');

    expect(reserveAttendanceEvent(reservations, key, 1000)).toBe(true);
    expect(reserveAttendanceEvent(reservations, key, 2000)).toBe(false);
    reservations.delete(key);
    expect(reserveAttendanceEvent(reservations, key, 3000)).toBe(true);
  });
});
