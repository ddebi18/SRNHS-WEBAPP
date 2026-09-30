import { TeacherAssignment, TeachingAssignmentInput } from '@/types/domain.types';

/**
 * Converts "HH:MM" or "HH:MM:SS" string to total minutes from midnight.
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  return hours * 60 + minutes;
}

/**
 * Formats 24h time ("08:00", "13:30:00") into friendly 12h time ("08:00 AM", "01:30 PM").
 */
export function formatTime12Hour(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.trim().split(':');
  let h = parseInt(parts[0] || '0', 10);
  const m = parts[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hStr = h < 10 ? `0${h}` : `${h}`;
  return `${hStr}:${m} ${ampm}`;
}

/**
 * Checks if two day arrays share any common day.
 */
export function doDaysOverlap(daysA: string[] = [], daysB: string[] = []): boolean {
  const normA = new Set(daysA.map(d => d.trim().toLowerCase()));
  return daysB.some(d => normA.has(d.trim().toLowerCase()));
}

/**
 * Checks if two time intervals strictly overlap.
 * Back-to-back slots (e.g. 08:00-09:00 and 09:00-10:00) do NOT overlap.
 */
export function doTimeIntervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);

  return sA < eB && eA > sB;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  type?: 'teacher' | 'room' | 'section';
  reason?: string;
  conflictingAssignment?: TeacherAssignment;
}

/**
 * Validates a pending schedule assignment against existing assignments.
 * Checks for:
 * 1. The same teacher is already teaching on overlapping day & time.
 * 2. The same room is already booked on overlapping day & time.
 * 3. The same section already has a class on overlapping day & time.
 */
export function checkScheduleConflicts(
  pending: TeachingAssignmentInput,
  existingAssignments: TeacherAssignment[],
  excludeAssignmentId?: string
): ConflictCheckResult {
  // Validate time order first
  const sPending = timeToMinutes(pending.start_time);
  const ePending = timeToMinutes(pending.end_time);
  if (ePending <= sPending) {
    return {
      hasConflict: true,
      reason: 'End time must be strictly after start time.',
    };
  }

  if (!pending.days || pending.days.length === 0) {
    return {
      hasConflict: true,
      reason: 'At least one teaching day must be selected.',
    };
  }

  for (const asg of existingAssignments) {
    if (excludeAssignmentId && asg.id === excludeAssignmentId) {
      continue;
    }

    const asgDays = asg.days && asg.days.length > 0
      ? asg.days
      : asg.schedule_day
      ? asg.schedule_day.split(',').map(s => s.trim())
      : [];

    if (!doDaysOverlap(pending.days, asgDays)) {
      continue;
    }

    if (!doTimeIntervalsOverlap(pending.start_time, pending.end_time, asg.start_time, asg.end_time)) {
      continue;
    }

    const timeRangeStr = `${formatTime12Hour(asg.start_time)} – ${formatTime12Hour(asg.end_time)}`;
    const commonDays = pending.days.filter(d =>
      asgDays.map(x => x.toLowerCase()).includes(d.toLowerCase())
    ).join(', ');

    // 1. Teacher collision
    if (asg.teacher_id === pending.teacher_id) {
      const teacherName = asg.teacher_name || 'This teacher';
      const subj = asg.subject_title || asg.subject_code || 'another class';
      return {
        hasConflict: true,
        type: 'teacher',
        reason: `${teacherName} is already scheduled to teach ${subj} on ${commonDays} (${timeRangeStr}).`,
        conflictingAssignment: asg,
      };
    }

    // 2. Room collision
    if (asg.room_id === pending.room_id) {
      const roomName = asg.room_name || 'This room';
      const subj = asg.subject_title || asg.subject_code || 'another class';
      return {
        hasConflict: true,
        type: 'room',
        reason: `${roomName} is already occupied by ${subj} on ${commonDays} (${timeRangeStr}).`,
        conflictingAssignment: asg,
      };
    }

    // 3. Section collision
    if (asg.section_id === pending.section_id) {
      const secName = asg.section_name || 'This section';
      const subj = asg.subject_title || asg.subject_code || 'another subject';
      return {
        hasConflict: true,
        type: 'section',
        reason: `${secName} already has a scheduled class (${subj}) on ${commonDays} (${timeRangeStr}).`,
        conflictingAssignment: asg,
      };
    }
  }

  return { hasConflict: false };
}
