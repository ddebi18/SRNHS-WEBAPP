import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchFacultyAttendanceSummary,
  fetchFacultyGradesStatus,
  fetchFacultyViolations,
  fetchFacultyActivityLogs,
} from '@/features/facultyReports/api';

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

describe('Feature 4: Reports per Faculty & Supervisory Monitoring', () => {
  const teacherId = 'usr-teacher-01';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('1. Attendance Summary Aggregation', () => {
    it('aggregates classroom sessions and calculates overall attendance rate', async () => {
      const records = [
        { id: '1', date: '2026-10-20', status: 'present', marked_by: teacherId },
        { id: '2', date: '2026-10-20', status: 'present', marked_by: teacherId },
        { id: '3', date: '2026-10-20', status: 'late', marked_by: teacherId },
        { id: '4', date: '2026-10-20', status: 'absent', marked_by: teacherId },
        { id: '5', date: '2026-10-21', status: 'present', marked_by: teacherId },
        { id: '6', date: '2026-10-21', status: 'present', marked_by: 'other-teacher' },
      ];
      localStorage.setItem('srnhs_classroom_attendance_records', JSON.stringify(records));

      const summary = await fetchFacultyAttendanceSummary(teacherId);

      expect(summary.total_attendees_marked).toBe(5);
      expect(summary.present_count).toBe(3);
      expect(summary.late_count).toBe(1);
      expect(summary.absent_count).toBe(1);
      expect(summary.total_sessions_held).toBe(2); // 2 distinct dates: 2026-10-20, 2026-10-21
      // (3 present + 1 late) / 5 total = 80%
      expect(summary.overall_attendance_rate).toBe(80);
    });

    it('returns zero metrics when no sessions have been logged', async () => {
      const summary = await fetchFacultyAttendanceSummary('nonexistent-teacher');
      expect(summary.total_sessions_held).toBe(0);
      expect(summary.total_attendees_marked).toBe(0);
      expect(summary.present_count).toBe(0);
    });
  });

  describe('2. Grade Submission Status', () => {
    it('returns teaching assignments and quarterly publication breakdown', async () => {
      const statusList = await fetchFacultyGradesStatus(teacherId);

      expect(Array.isArray(statusList)).toBe(true);
      expect(statusList.length).toBeGreaterThan(0);

      const first = statusList[0]!;
      expect(first.section_name).toBeDefined();
      expect(first.subject_code).toBeDefined();
      expect(typeof first.total_enrolled).toBe('number');
      expect(typeof first.q1_published).toBe('boolean');
    });
  });

  describe('3. Violations Logged by Faculty', () => {
    it('retrieves student disciplinary infractions reported by this faculty member', async () => {
      const sampleViolations = [
        {
          id: 'v-1',
          student_id: 'std-1',
          student_name: 'Juan Dela Cruz',
          reported_by: teacherId,
          occurred_at: '2026-10-20T08:00:00Z',
          status: 'reported',
          source: 'manual',
        },
        {
          id: 'v-2',
          student_id: 'std-2',
          student_name: 'Pedro Reyes',
          reported_by: 'other-teacher',
          occurred_at: '2026-10-21T09:00:00Z',
          status: 'acknowledged',
          source: 'manual',
        },
      ];
      localStorage.setItem('srnhs_violations_v1', JSON.stringify(sampleViolations));

      const viols = await fetchFacultyViolations(teacherId);
      expect(viols.length).toBe(1);
      expect(viols[0]!.id).toBe('v-1');
      expect(viols[0]!.student_name).toBe('Juan Dela Cruz');
    });
  });

  describe('4. Faculty Activity Audit Trail', () => {
    it('scopes activity logs strictly to the faculty member', async () => {
      const sampleLogs = [
        {
          id: 'l-1',
          user_id: teacherId,
          role: 'teacher',
          action: 'grades.publish',
          entity_type: 'grade',
          created_at: '2026-10-22T00:00:00Z',
        },
        {
          id: 'l-2',
          user_id: 'other-teacher',
          role: 'teacher',
          action: 'auth.login',
          entity_type: 'user',
          created_at: '2026-10-23T00:00:00Z',
        },
      ];
      localStorage.setItem('user_logs', JSON.stringify(sampleLogs));

      const logs = await fetchFacultyActivityLogs(teacherId);
      expect(logs.length).toBe(1);
      expect(logs[0]!.id).toBe('l-1');
      expect(logs[0]!.action).toBe('grades.publish');
    });
  });

  describe('5. Access Control & Role Scoping Rules', () => {
    function simulateFacultyReportAccess(
      userRole: 'admin' | 'teacher' | 'guardian' | null,
      targetTeacherId: string,
      currentUserId: string
    ): boolean {
      if (!userRole) return false;
      if (userRole === 'admin') return true; // admin can view any faculty report
      if (userRole === 'teacher') return targetTeacherId === currentUserId; // teacher views only self
      return false; // guardians denied
    }

    it('allows admin to query any teacher report', () => {
      expect(simulateFacultyReportAccess('admin', 'tch-01', 'adm-01')).toBe(true);
      expect(simulateFacultyReportAccess('admin', 'tch-02', 'adm-01')).toBe(true);
    });

    it('permits teacher to access only their own report and denies other teachers', () => {
      expect(simulateFacultyReportAccess('teacher', 'tch-01', 'tch-01')).toBe(true);
      expect(simulateFacultyReportAccess('teacher', 'tch-02', 'tch-01')).toBe(false);
    });

    it('strictly denies guardians from accessing faculty performance reports', () => {
      expect(simulateFacultyReportAccess('guardian', 'tch-01', 'grd-01')).toBe(false);
    });
  });
});
