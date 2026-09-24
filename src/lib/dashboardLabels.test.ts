import { describe, expect, it } from 'vitest';
import { getDashboardGreeting, getRoleLabel } from './dashboardLabels';

describe('dashboard labels', () => {
  it('uses a role-based greeting for admin users', () => {
    expect(getDashboardGreeting(8, 'admin')).toBe('Good morning, Admin.');
  });

  it('uses the teacher label for faculty accounts', () => {
    expect(getDashboardGreeting(16, 'teacher')).toBe('Good afternoon, Faculty.');
  });

  it('uses the student label for student accounts', () => {
    expect(getDashboardGreeting(19, 'student')).toBe('Good evening, Student.');
  });

  it('returns admin-friendly labels', () => {
    expect(getRoleLabel('admin')).toBe('Admin');
    expect(getRoleLabel('teacher')).toBe('Faculty');
    expect(getRoleLabel('student')).toBe('Student');
  });
});
