import { describe, it, expect } from 'vitest';
import {
  checkScheduleConflicts,
  doTimeIntervalsOverlap,
  doDaysOverlap,
  timeToMinutes,
  formatTime12Hour,
} from '@/features/faculty/conflictUtils';
import { TeacherAssignment, TeachingAssignmentInput } from '@/types/domain.types';

const EXISTING_ASSIGNMENTS: TeacherAssignment[] = [
  {
    id: 'asg-1',
    teacher_id: 'teacher-101',
    teacher_name: 'Ms. Elena Torres',
    section_id: 'sec-dianthus',
    section_name: 'Grade 10 - Dianthus',
    subject_id: 'sub-math',
    subject_title: 'General Mathematics',
    subject_code: 'GEN-MATH',
    room_id: 'rm-101',
    room_name: 'Room 101 (Building A)',
    days: ['Mon', 'Wed', 'Fri'],
    schedule_day: 'Mon, Wed, Fri',
    start_time: '08:00',
    end_time: '09:30',
    created_at: new Date().toISOString(),
  },
  {
    id: 'asg-2',
    teacher_id: 'teacher-102',
    teacher_name: 'Mr. Juan Dela Cruz',
    section_id: 'sec-rizal',
    section_name: 'Grade 10 - Rizal',
    subject_id: 'sub-science',
    subject_title: 'Science & Technology',
    subject_code: 'SCI-TECH',
    room_id: 'rm-lab',
    room_name: 'Science Laboratory',
    days: ['Tue', 'Thu'],
    schedule_day: 'Tue, Thu',
    start_time: '10:00',
    end_time: '11:30',
    created_at: new Date().toISOString(),
  },
];

describe('Schedule Conflict Utils — time and day calculations', () => {
  it('converts time strings to minutes from midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('13:45')).toBe(825);
  });

  it('formats 24-hour time to friendly 12-hour AM/PM string', () => {
    expect(formatTime12Hour('08:00')).toBe('08:00 AM');
    expect(formatTime12Hour('12:00')).toBe('12:00 PM');
    expect(formatTime12Hour('13:30')).toBe('01:30 PM');
    expect(formatTime12Hour('00:15')).toBe('12:15 AM');
  });

  it('detects day overlap between two arrays', () => {
    expect(doDaysOverlap(['Mon', 'Wed'], ['Wed', 'Fri'])).toBe(true);
    expect(doDaysOverlap(['Mon', 'Wed'], ['Tue', 'Thu'])).toBe(false);
    expect(doDaysOverlap(['mon'], ['MON'])).toBe(true); // case-insensitive
  });

  it('detects time interval overlaps correctly', () => {
    // Strict overlap
    expect(doTimeIntervalsOverlap('08:00', '09:30', '08:30', '10:00')).toBe(true);
    expect(doTimeIntervalsOverlap('08:00', '10:00', '08:30', '09:30')).toBe(true); // subset
    expect(doTimeIntervalsOverlap('08:30', '09:30', '08:00', '10:00')).toBe(true); // superset

    // Back-to-back: strictly allowed without collision!
    expect(doTimeIntervalsOverlap('08:00', '09:00', '09:00', '10:00')).toBe(false);
    expect(doTimeIntervalsOverlap('09:00', '10:00', '08:00', '09:00')).toBe(false);

    // Completely disjoint
    expect(doTimeIntervalsOverlap('08:00', '09:00', '10:00', '11:00')).toBe(false);
  });
});

describe('Schedule Conflict Detection — collision checks', () => {
  it('rejects invalid time order (end_time <= start_time)', () => {
    const invalidInput: TeachingAssignmentInput = {
      teacher_id: 'teacher-999',
      section_id: 'sec-999',
      subject_id: 'sub-999',
      room_id: 'rm-999',
      days: ['Mon'],
      start_time: '10:00',
      end_time: '09:00',
    };

    const res = checkScheduleConflicts(invalidInput, EXISTING_ASSIGNMENTS);
    expect(res.hasConflict).toBe(true);
    expect(res.reason).toMatch(/end time must be strictly after start time/i);
  });

  it('detects teacher collision on overlapping day and time', () => {
    const collisionInput: TeachingAssignmentInput = {
      teacher_id: 'teacher-101', // Ms. Elena Torres
      section_id: 'sec-jordan',
      subject_id: 'sub-eapp',
      room_id: 'rm-201',
      days: ['Mon', 'Fri'], // Overlaps with Mon, Wed, Fri
      start_time: '08:30', // Overlaps with 08:00 - 09:30
      end_time: '10:00',
    };

    const res = checkScheduleConflicts(collisionInput, EXISTING_ASSIGNMENTS);
    expect(res.hasConflict).toBe(true);
    expect(res.type).toBe('teacher');
    expect(res.reason).toContain('Ms. Elena Torres is already scheduled to teach');
  });

  it('detects room collision on overlapping day and time', () => {
    const collisionInput: TeachingAssignmentInput = {
      teacher_id: 'teacher-999', // Different teacher
      section_id: 'sec-jordan', // Different section
      subject_id: 'sub-eapp',
      room_id: 'rm-101', // Same Room 101!
      days: ['Wed'], // Overlaps with Mon, Wed, Fri
      start_time: '08:00', // Overlaps with 08:00 - 09:30
      end_time: '09:00',
    };

    const res = checkScheduleConflicts(collisionInput, EXISTING_ASSIGNMENTS);
    expect(res.hasConflict).toBe(true);
    expect(res.type).toBe('room');
    expect(res.reason).toContain('Room 101 (Building A) is already occupied');
  });

  it('detects section collision on overlapping day and time', () => {
    const collisionInput: TeachingAssignmentInput = {
      teacher_id: 'teacher-999', // Different teacher
      section_id: 'sec-dianthus', // Same section!
      subject_id: 'sub-filipino',
      room_id: 'rm-gym', // Different room
      days: ['Mon'], // Overlaps with Mon, Wed, Fri
      start_time: '09:00', // Overlaps with 08:00 - 09:30
      end_time: '10:00',
    };

    const res = checkScheduleConflicts(collisionInput, EXISTING_ASSIGNMENTS);
    expect(res.hasConflict).toBe(true);
    expect(res.type).toBe('section');
    expect(res.reason).toContain('Grade 10 - Dianthus already has a scheduled class');
  });

  it('allows same teacher, room, and section if days do not overlap', () => {
    const nonCollidingInput: TeachingAssignmentInput = {
      teacher_id: 'teacher-101', // Ms. Elena Torres
      section_id: 'sec-dianthus',
      subject_id: 'sub-math',
      room_id: 'rm-101',
      days: ['Tue', 'Thu'], // Mon/Wed/Fri vs Tue/Thu
      start_time: '08:00',
      end_time: '09:30',
    };

    const res = checkScheduleConflicts(nonCollidingInput, EXISTING_ASSIGNMENTS);
    expect(res.hasConflict).toBe(false);
  });

  it('allows back-to-back classes for same room or teacher', () => {
    const backToBackInput: TeachingAssignmentInput = {
      teacher_id: 'teacher-101', // Ms. Elena Torres
      section_id: 'sec-jordan',
      subject_id: 'sub-eapp',
      room_id: 'rm-201',
      days: ['Mon'],
      start_time: '09:30', // Starts exactly when asg-1 ends!
      end_time: '10:30',
    };

    const res = checkScheduleConflicts(backToBackInput, EXISTING_ASSIGNMENTS);
    expect(res.hasConflict).toBe(false);
  });

  it('ignores the assignment being updated when excludeAssignmentId is passed', () => {
    // When editing asg-1, updating the time slightly within its own window shouldn't conflict with itself
    const editSelfInput: TeachingAssignmentInput = {
      teacher_id: 'teacher-101',
      section_id: 'sec-dianthus',
      subject_id: 'sub-math',
      room_id: 'rm-101',
      days: ['Mon', 'Wed', 'Fri'],
      start_time: '08:15',
      end_time: '09:45',
    };

    const res = checkScheduleConflicts(editSelfInput, EXISTING_ASSIGNMENTS, 'asg-1');
    expect(res.hasConflict).toBe(false);
  });
});
