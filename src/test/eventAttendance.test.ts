import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase so API calls fall through to localStorage
vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

// Mock faceRegistration/api to control student roster
vi.mock('@/features/faceRegistration/api', () => ({
  isValidUUID: (id: string) => /^[0-9a-f-]{36}$/i.test(id),
  getStoredStudents: () => [
    {
      id: 'a1b2c3d4-0000-0000-0000-000000000001',
      studentNumber: '100000000001',
      lrn: '100000000001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      name: 'Juan Dela Cruz',
      sectionId: 'sec-001',
      sectionName: 'Grade 7 - Rizal',
    },
    {
      id: 'a1b2c3d4-0000-0000-0000-000000000002',
      studentNumber: '100000000002',
      lrn: '100000000002',
      firstName: 'Maria',
      lastName: 'Santos',
      name: 'Maria Santos',
      sectionId: 'sec-001',
      sectionName: 'Grade 7 - Rizal',
    },
  ],
}));

import {
  createEvent,
  getLocalEvents,
  getLocalEventAttendance,
  recordEventAttendance,
  updateEventStatus,
  deleteEvent,
  resolveStudentByLrn,
} from '@/features/events/api';

describe('Events API', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── createEvent ─────────────────────────────────────────────────────────────

  describe('createEvent', () => {
    it('persists a new event to localStorage', async () => {
      const evt = await createEvent({
        title: 'Foundation Day 2026',
        event_date: '2026-06-12',
        venue: 'School Grounds',
      });

      expect(evt.id).toBeTruthy();
      expect(evt.title).toBe('Foundation Day 2026');
      expect(evt.status).toBe('upcoming');
      expect(evt.event_date).toBe('2026-06-12');

      const stored = getLocalEvents();
      expect(stored.some(e => e.id === evt.id)).toBe(true);
    });

    it('defaults status to upcoming when not provided', async () => {
      const evt = await createEvent({ title: 'Test Event', event_date: '2026-07-04' });
      expect(evt.status).toBe('upcoming');
    });

    it('accepts custom status', async () => {
      const evt = await createEvent({ title: 'Past Event', event_date: '2026-01-01', status: 'completed' });
      expect(evt.status).toBe('completed');
    });
  });

  // ── updateEventStatus ────────────────────────────────────────────────────────

  describe('updateEventStatus', () => {
    it('changes status in localStorage', async () => {
      const evt = await createEvent({ title: 'Sportsfest', event_date: '2026-08-01' });
      await updateEventStatus(evt.id, 'ongoing');
      const stored = getLocalEvents().find(e => e.id === evt.id);
      expect(stored?.status).toBe('ongoing');
    });
  });

  // ── deleteEvent ─────────────────────────────────────────────────────────────

  describe('deleteEvent', () => {
    it('removes event and its attendance from localStorage', async () => {
      const evt = await createEvent({ title: 'Delete Me', event_date: '2026-09-01' });
      await deleteEvent(evt.id);

      const stored = getLocalEvents().find(e => e.id === evt.id);
      expect(stored).toBeUndefined();
    });

    it('also removes attendance records for the event', async () => {
      const evt = await createEvent({ title: 'With Attendance', event_date: '2026-09-02' });
      await recordEventAttendance({
        eventId: evt.id,
        studentId: 'a1b2c3d4-0000-0000-0000-000000000001',
        method: 'manual',
      });

      await deleteEvent(evt.id);
      const att = getLocalEventAttendance(evt.id);
      expect(att).toHaveLength(0);
    });
  });

  // ── recordEventAttendance ───────────────────────────────────────────────────

  describe('recordEventAttendance', () => {
    it('records attendance for a student at an event', async () => {
      const evt = await createEvent({ title: 'Year-End', event_date: '2026-11-30' });
      const result = await recordEventAttendance({
        eventId: evt.id,
        studentId: 'a1b2c3d4-0000-0000-0000-000000000001',
        studentName: 'Juan Dela Cruz',
        studentLrn: '100000000001',
        method: 'qr',
      });

      expect(result.success).toBe(true);
      expect(result.record?.method).toBe('qr');
      expect(result.record?.student_id).toBe('a1b2c3d4-0000-0000-0000-000000000001');

      const att = getLocalEventAttendance(evt.id);
      expect(att).toHaveLength(1);
    });

    it('rejects duplicate check-in for same student + event', async () => {
      const evt = await createEvent({ title: 'Unique', event_date: '2026-10-10' });
      await recordEventAttendance({
        eventId: evt.id,
        studentId: 'a1b2c3d4-0000-0000-0000-000000000001',
        method: 'qr',
      });

      const dup = await recordEventAttendance({
        eventId: evt.id,
        studentId: 'a1b2c3d4-0000-0000-0000-000000000001',
        method: 'manual',
      });

      expect(dup.success).toBe(false);
      expect(dup.message).toMatch(/already checked in/i);
    });

    it('allows different students to check in to the same event', async () => {
      const evt = await createEvent({ title: 'Shared Event', event_date: '2026-10-11' });

      await recordEventAttendance({ eventId: evt.id, studentId: 'a1b2c3d4-0000-0000-0000-000000000001', method: 'qr' });
      const r2 = await recordEventAttendance({ eventId: evt.id, studentId: 'a1b2c3d4-0000-0000-0000-000000000002', method: 'qr' });

      expect(r2.success).toBe(true);
      expect(getLocalEventAttendance(evt.id)).toHaveLength(2);
    });

    it('stores method and notes', async () => {
      const evt = await createEvent({ title: 'Manual Event', event_date: '2026-10-12' });
      const result = await recordEventAttendance({
        eventId: evt.id,
        studentId: 'a1b2c3d4-0000-0000-0000-000000000001',
        method: 'manual',
        notes: 'Arrived late',
      });

      expect(result.record?.method).toBe('manual');
      expect(result.record?.notes).toBe('Arrived late');
    });
  });

  // ── resolveStudentByLrn ─────────────────────────────────────────────────────

  describe('resolveStudentByLrn', () => {
    it('returns student data when LRN matches', () => {
      const student = resolveStudentByLrn('100000000001');
      expect(student).not.toBeNull();
      expect(student?.name).toBe('Juan Dela Cruz');
      expect(student?.lrn).toBe('100000000001');
      expect(student?.sectionName).toBe('Grade 7 - Rizal');
    });

    it('returns null for unknown LRN', () => {
      expect(resolveStudentByLrn('999999999999')).toBeNull();
    });

    it('trims whitespace before matching', () => {
      const student = resolveStudentByLrn('  100000000002  ');
      expect(student?.name).toBe('Maria Santos');
    });
  });
});
