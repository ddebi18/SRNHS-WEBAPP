import { describe, expect, it } from 'vitest';
import { getDashboardGreeting, getRoleLabel } from './dashboardLabels';

describe('dashboard labels', () => {
  it('uses a role-based greeting for admin users', () => {
    expect(getDashboardGreeting(8, 'admin')).toBe('Good morning, Admin.');
  });

  it('uses the teacher label for faculty accounts', () => {
    expect(getDashboardGreeting(16, 'teacher')).toBe('Good afternoon, Faculty.');
  });

  it('returns default fallback for undefined role', () => {
    expect(getDashboardGreeting(19, null)).toBe('Good evening, Staff.');
  });

  it('returns admin-friendly labels', () => {
    expect(getRoleLabel('admin')).toBe('Admin');
    expect(getRoleLabel('teacher')).toBe('Faculty');
    expect(getRoleLabel(null)).toBe('Staff');
  });
});
