import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatGateSmsMessage,
  dispatchGateSms,
  clearGateSmsCooldownCache,
} from '@/features/notifications/services/gateSmsDispatcher';
import { saveStoredStudents } from '@/features/faceRegistration/api';
import { activeNotificationAdapter } from '@/features/notifications/services';

describe('Feature 3: Gate Entry/Exit SMS Notifications to Guardians', () => {
  beforeEach(() => {
    localStorage.clear();
    clearGateSmsCooldownCache();

    // Mock student with primary guardian
    saveStoredStudents([
      {
        id: 'a1b2c3d4-0000-0000-0000-000000000011',
        name: 'Juan Dela Cruz',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        studentNumber: '109823456701',
        lrn: '109823456701',
        sectionId: 'sec-1',
        guardianPhone: '+639171234567',
        face_registered: true,
      },
      {
        id: 'a1b2c3d4-0000-0000-0000-000000000012',
        name: 'Ana Ramos',
        firstName: 'Ana',
        lastName: 'Ramos',
        studentNumber: '109823456702',
        lrn: '109823456702',
        sectionId: 'sec-1',
        guardianPhone: '',
        face_registered: true,
      },
    ] as any[]);
  });

  describe('formatGateSmsMessage', () => {
    it('formats a concise entry message with student name and school identity', () => {
      const fixedDate = new Date('2026-10-24T07:15:00');
      const msg = formatGateSmsMessage('Juan Dela Cruz', 'entry', fixedDate);

      expect(msg).toContain('Juan Dela Cruz');
      expect(msg).toContain('entered San Roque National High School');
      expect(msg.length).toBeLessThan(160); // Fits single SMS
    });

    it('formats a concise exit message with student name and school identity', () => {
      const fixedDate = new Date('2026-10-24T16:30:00');
      const msg = formatGateSmsMessage('Juan Dela Cruz', 'exit', fixedDate);

      expect(msg).toContain('Juan Dela Cruz');
      expect(msg).toContain('exited San Roque National High School');
      expect(msg.length).toBeLessThan(160);
    });
  });

  describe('dispatchGateSms & Cooldown', () => {
    it('successfully dispatches gate SMS when guardian phone is present', async () => {
      const result = await dispatchGateSms({
        studentId: 'a1b2c3d4-0000-0000-0000-000000000011',
        studentName: 'Juan Dela Cruz',
        eventType: 'entry',
      });

      expect(result.dispatched).toBe(true);
      expect(result.notification?.guardian_phone).toContain('639171234567');
      expect(result.notification?.event_type).toBe('gate_entry');
    });

    it('suppresses repeated entry SMS within the cooldown window', async () => {
      const first = await dispatchGateSms({
        studentId: 'a1b2c3d4-0000-0000-0000-000000000011',
        studentName: 'Juan Dela Cruz',
        eventType: 'entry',
        cooldownSeconds: 600,
      });
      expect(first.dispatched).toBe(true);

      const second = await dispatchGateSms({
        studentId: 'a1b2c3d4-0000-0000-0000-000000000011',
        studentName: 'Juan Dela Cruz',
        eventType: 'entry',
        cooldownSeconds: 600,
      });
      expect(second.dispatched).toBe(false);
      expect(second.reason).toContain('Cooldown active');
    });

    it('permits exit SMS even if entry SMS occurred recently (independent cooldowns)', async () => {
      const entry = await dispatchGateSms({
        studentId: 'a1b2c3d4-0000-0000-0000-000000000011',
        studentName: 'Juan Dela Cruz',
        eventType: 'entry',
      });
      expect(entry.dispatched).toBe(true);

      // Exit event should NOT be blocked by entry cooldown
      const exit = await dispatchGateSms({
        studentId: 'a1b2c3d4-0000-0000-0000-000000000011',
        studentName: 'Juan Dela Cruz',
        eventType: 'exit',
      });
      expect(exit.dispatched).toBe(true);
    });

    it('gracefully handles missing guardian phone without throwing', async () => {
      const res = await dispatchGateSms({
        studentId: 'a1b2c3d4-0000-0000-0000-000000000012',
        studentName: 'Ana Ramos',
        eventType: 'entry',
      });

      expect(res.dispatched).toBe(false);
      expect(res.reason).toContain('No primary guardian');
    });

    it('guarantees failure isolation when SMS provider fails', async () => {
      const spy = vi.spyOn(activeNotificationAdapter, 'sendAlert').mockRejectedValueOnce(new Error('Gateway timeout'));

      const res = await dispatchGateSms({
        studentId: 'a1b2c3d4-0000-0000-0000-000000000011',
        studentName: 'Juan Dela Cruz',
        eventType: 'entry',
      });

      expect(res.dispatched).toBe(false);
      expect(res.reason).toContain('Dispatch failed');

      spy.mockRestore();
    });
  });
});
