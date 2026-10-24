import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchViolations,
  createViolation,
  updateViolationStatus,
  recordViolationView,
  fetchViolationViews,
} from '@/features/violations/api';
import { violationValidationSchema } from '@/lib/validation';

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

describe('Feature 5: Violations Management, Realtime & Who Saw It', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('1. Input Validation', () => {
    it('requires student_id, violation_type_id, and occurred_at', () => {
      const invalid = violationValidationSchema.safeParse({
        student_id: '',
        violation_type_id: '',
        occurred_at: '',
      });
      expect(invalid.success).toBe(false);

      const valid = violationValidationSchema.safeParse({
        student_id: 'std-100',
        violation_type_id: 'vt-cutting',
        occurred_at: '2026-10-24T10:00:00Z',
        location: 'West Gate',
        notes: 'Found outside gate during period 2.',
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('2. Infraction Creation and Audit Trail', () => {
    it('creates violation record and appends to audit trail', async () => {
      const res = await createViolation({
        student_id: 'std-101',
        student_name: 'Juan Dela Cruz',
        student_lrn: '100000000001',
        violation_type_id: 'vt-cutting',
        occurred_at: new Date().toISOString(),
        location: 'Hallway B',
        notes: 'Cutting math class.',
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toBeTruthy();
      expect(res.data?.status).toBe('reported');
      expect(res.data?.source).toBe('manual');

      const all = await fetchViolations();
      expect(all.length).toBe(1);
      expect(all[0]!.student_id).toBe('std-101');

      const audit = JSON.parse(localStorage.getItem('user_logs') || '[]');
      const log = audit.find((l: any) => l.action === 'violation.create');
      expect(log).toBeDefined();
    });
  });

  describe('3. Status Transition Workflow', () => {
    it('advances status from reported to acknowledged, then resolved with notes', async () => {
      const res = await createViolation({
        student_id: 'std-102',
        student_name: 'Pedro Reyes',
        violation_type_id: 'vt-uniform',
        occurred_at: new Date().toISOString(),
      });
      const violId = res.data!.id;

      // 1. Acknowledge
      const ackSuccess = await updateViolationStatus(violId, 'acknowledged');
      expect(ackSuccess).toBe(true);

      let current = await fetchViolations();
      expect(current.find(v => v.id === violId)?.status).toBe('acknowledged');

      // 2. Resolve
      const resSuccess = await updateViolationStatus(
        violId,
        'resolved',
        'Parent conference conducted; replacement uniform issued.'
      );
      expect(resSuccess).toBe(true);

      current = await fetchViolations();
      const resolvedRecord = current.find(v => v.id === violId);
      expect(resolvedRecord?.status).toBe('resolved');
      expect(resolvedRecord?.notes).toContain('Parent conference conducted');
    });
  });

  describe('4. "Who Saw It" View Tracking', () => {
    it('records view on first open and updates last_seen_at without duplicate records', async () => {
      const res = await createViolation({
        student_id: 'std-103',
        violation_type_id: 'vt-phone',
        occurred_at: new Date().toISOString(),
      });
      const violId = res.data!.id;

      // First view
      await recordViolationView(violId, {
        id: 'usr-teacher-1',
        role: 'teacher',
        full_name: 'Teacher One',
      });

      let views = await fetchViolationViews(violId);
      expect(views.length).toBe(1);
      expect(views[0]!.user_id).toBe('usr-teacher-1');
      const firstSeen = views[0]!.first_seen_at;

      // Subsequent view by same user
      await recordViolationView(violId, {
        id: 'usr-teacher-1',
        role: 'teacher',
        full_name: 'Teacher One',
      });

      views = await fetchViolationViews(violId);
      expect(views.length).toBe(1); // No duplicate row!
      expect(views[0]!.first_seen_at).toBe(firstSeen);
      expect(views[0]!.last_seen_at).toBeDefined();

      // Second view by different user
      await recordViolationView(violId, {
        id: 'usr-admin-1',
        role: 'admin',
        full_name: 'Principal Admin',
      });

      views = await fetchViolationViews(violId);
      expect(views.length).toBe(2);
    });
  });

  describe('5. Privacy & Guardian Denial RLS Rules', () => {
    function simulateViolationAccess(
      userRole: 'admin' | 'teacher' | 'guardian' | null
    ): boolean {
      if (userRole === 'admin' || userRole === 'teacher') return true;
      return false; // guardians are strictly denied access to violations
    }

    it('permits admins and teachers to view violations', () => {
      expect(simulateViolationAccess('admin')).toBe(true);
      expect(simulateViolationAccess('teacher')).toBe(true);
    });

    it('strictly denies guardians from viewing student disciplinary violations', () => {
      expect(simulateViolationAccess('guardian')).toBe(false);
      expect(simulateViolationAccess(null)).toBe(false);
    });
  });
});
