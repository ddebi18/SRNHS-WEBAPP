import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeLogMetadata,
  logUserAction,
  fetchUserLogs,
} from '@/lib/auditLogger';

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

describe('Feature 2: User Logs (Immutable Audit Trail) & Security', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('1. Biometric & Credential Sanitization', () => {
    it('strips plain passwords, tokens, and secrets from audit metadata', () => {
      const dirty = {
        user_id: 'usr-123',
        username: 'teacher@srnhs.edu.ph',
        password: 'TopSecretPassword123!',
        access_token: 'jwt-abc-xyz',
        refresh_token: 'refresh-jwt-999',
        secret: 'super-api-secret',
        action_detail: 'User updated profile',
      };

      const clean = sanitizeLogMetadata(dirty);
      expect(clean.password).toBeUndefined();
      expect(clean.access_token).toBeUndefined();
      expect(clean.refresh_token).toBeUndefined();
      expect(clean.secret).toBeUndefined();
      expect(clean.user_id).toBe('usr-123');
      expect(clean.action_detail).toBe('User updated profile');
    });

    it('strips face descriptors and biometric photos from audit metadata (RA 10173)', () => {
      const dirty = {
        student_id: 'std-100',
        descriptors: [new Float32Array([0.1, 0.2, 0.3])],
        face_descriptor: [0.12, 0.34, 0.56],
        photos: ['data:image/jpeg;base64,samplephoto'],
        biometrics: { vendor: 'FaceNet' },
        reason: 'Face verification update',
      };

      const clean = sanitizeLogMetadata(dirty);
      expect(clean.descriptors).toBeUndefined();
      expect(clean.face_descriptor).toBeUndefined();
      expect(clean.photos).toBeUndefined();
      expect(clean.biometrics).toBeUndefined();
      expect(clean.student_id).toBe('std-100');
      expect(clean.reason).toBe('Face verification update');
    });

    it('recursively sanitizes nested metadata objects and arrays', () => {
      const nested = {
        outer: {
          token: 'sensitive-token',
          validField: 42,
          inner: {
            password: 'pass',
            safeNested: 'hello',
          },
        },
      };

      const clean = sanitizeLogMetadata(nested);
      expect(clean.outer.token).toBeUndefined();
      expect(clean.outer.validField).toBe(42);
      expect(clean.outer.inner.password).toBeUndefined();
      expect(clean.outer.inner.safeNested).toBe('hello');
    });
  });

  describe('2. Log Dispatch and Append-Only Storage', () => {
    it('successfully records log entries to storage', async () => {
      const success = await logUserAction({
        action: 'auth.login',
        entity_type: 'user',
        entity_id: 'usr-admin-1',
        role: 'admin',
        metadata: { portal: 'admin' },
      });

      expect(success).toBe(true);

      const logs = JSON.parse(localStorage.getItem('user_logs') || '[]');
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('auth.login');
      expect(logs[0].entity_type).toBe('user');
      expect(logs[0].role).toBe('admin');
      expect(logs[0].created_at).toBeTruthy();
    });

    it('caps local audit storage to prevent unbounded memory growth', async () => {
      // Simulate existing large log
      const initialLogs = Array.from({ length: 1005 }).map((_, i) => ({
        id: `log-${i}`,
        action: 'bulk.action',
        entity_type: 'bulk',
        created_at: new Date().toISOString(),
      }));
      localStorage.setItem('user_logs', JSON.stringify(initialLogs));

      await logUserAction({
        action: 'test.cap',
        entity_type: 'system',
      });

      const updated = JSON.parse(localStorage.getItem('user_logs') || '[]');
      expect(updated.length).toBe(1000);
      expect(updated[0].action).toBe('test.cap');
    });
  });

  describe('3. Filtering and Query Capabilities', () => {
    beforeEach(async () => {
      const sampleLogs = [
        {
          id: 'log-1',
          user_id: 'adm-01',
          role: 'admin',
          action: 'auth.login',
          entity_type: 'user',
          entity_id: 'adm-01',
          metadata: { portal: 'admin' },
          created_at: '2026-10-20T10:00:00.000Z',
        },
        {
          id: 'log-2',
          user_id: 'tch-01',
          role: 'teacher',
          action: 'grades.publish',
          entity_type: 'grade',
          entity_id: 'grd-01',
          metadata: { quarter: 1, subject_id: 'sub-math' },
          created_at: '2026-10-22T14:30:00.000Z',
        },
        {
          id: 'log-3',
          user_id: 'adm-01',
          role: 'admin',
          action: 'student.profile_saved',
          entity_type: 'student',
          entity_id: 'std-555',
          metadata: { lrn: '123456789012' },
          created_at: '2026-10-23T08:15:00.000Z',
        },
        {
          id: 'log-4',
          user_id: 'grd-user-01',
          role: 'guardian',
          action: 'announcement.read',
          entity_type: 'announcement',
          entity_id: 'ann-101',
          metadata: {},
          created_at: '2026-10-24T02:00:00.000Z',
        },
      ];
      localStorage.setItem('user_logs', JSON.stringify(sampleLogs));
    });

    it('filters logs by user role', async () => {
      const adminOnly = await fetchUserLogs({ role: 'admin' });
      expect(adminOnly.count).toBe(2);
      expect(adminOnly.data.every(l => l.role === 'admin')).toBe(true);
    });

    it('filters logs by entity type', async () => {
      const studentOnly = await fetchUserLogs({ entity_type: 'student' });
      expect(studentOnly.count).toBe(1);
      expect(studentOnly.data[0]!.entity_id).toBe('std-555');
    });

    it('filters logs by search keyword across action, entity, or ID', async () => {
      const searchRes = await fetchUserLogs({ search: 'grades.publish' });
      expect(searchRes.count).toBe(1);
      expect(searchRes.data[0]!.action).toBe('grades.publish');
    });

    it('paginates results accurately with limit and offset', async () => {
      const page1 = await fetchUserLogs({ limit: 2, offset: 0 });
      expect(page1.data.length).toBe(2);
      expect(page1.count).toBe(4);
      expect(page1.data[0]!.id).toBe('log-1');

      const page2 = await fetchUserLogs({ limit: 2, offset: 2 });
      expect(page2.data.length).toBe(2);
      expect(page2.data[0]!.id).toBe('log-3');
    });
  });

  describe('4. Append-Only Policy Rules Simulation', () => {
    // Simulator representing Postgres RLS constraints on user_logs
    function simulateUserLogsRls(
      operation: 'INSERT' | 'SELECT' | 'UPDATE' | 'DELETE',
      userRole: 'admin' | 'teacher' | 'guardian' | null,
      recordUserId?: string,
      currentUserId?: string
    ): boolean {
      if (operation === 'UPDATE' || operation === 'DELETE') {
        // Strict immutability: UPDATE and DELETE are USING (false)
        return false;
      }
      if (operation === 'INSERT') {
        // Authenticated users can insert log entries
        return Boolean(userRole);
      }
      if (operation === 'SELECT') {
        if (userRole === 'admin') return true; // admin reads all
        if (userRole === 'teacher') return recordUserId === currentUserId; // teacher reads own
        return false; // guardians denied audit access
      }
      return false;
    }

    it('strictly forbids UPDATE operations regardless of role', () => {
      expect(simulateUserLogsRls('UPDATE', 'admin')).toBe(false);
      expect(simulateUserLogsRls('UPDATE', 'teacher')).toBe(false);
      expect(simulateUserLogsRls('UPDATE', 'guardian')).toBe(false);
    });

    it('strictly forbids DELETE operations regardless of role', () => {
      expect(simulateUserLogsRls('DELETE', 'admin')).toBe(false);
      expect(simulateUserLogsRls('DELETE', 'teacher')).toBe(false);
      expect(simulateUserLogsRls('DELETE', 'guardian')).toBe(false);
    });

    it('allows admins to select all logs and teachers to select only own logs', () => {
      expect(simulateUserLogsRls('SELECT', 'admin', 'tch-1', 'adm-1')).toBe(true);
      expect(simulateUserLogsRls('SELECT', 'teacher', 'tch-1', 'tch-1')).toBe(true);
      expect(simulateUserLogsRls('SELECT', 'teacher', 'adm-1', 'tch-1')).toBe(false);
      expect(simulateUserLogsRls('SELECT', 'guardian', 'grd-1', 'grd-1')).toBe(false);
    });
  });
});
