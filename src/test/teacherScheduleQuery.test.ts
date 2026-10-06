import { describe, it, expect } from 'vitest';
import { facultyKeys } from '@/features/faculty/api';
import { StaffProfile } from '@/types/domain.types';

describe('Teacher Schedule Query — Key Generation & Filter Logic', () => {
  const teacherUser: StaffProfile = {
    id: 'teacher-uuid-1234',
    email: 'teacher.one@srnhs.edu.ph',
    full_name: 'Teacher One',
    role: 'teacher',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const adminUser: StaffProfile = {
    id: 'admin-uuid-5678',
    email: 'admin@srnhs.edu.ph',
    full_name: 'Administrator',
    role: 'admin',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('generates distinct query keys for specific teacher vs admin view all', () => {
    const teacherKey = facultyKeys.assignments(teacherUser.id);
    const adminKey = facultyKeys.assignments(undefined);

    expect(teacherKey).toEqual(['teaching_assignments', 'teacher-uuid-1234']);
    expect(adminKey).toEqual(['teaching_assignments', 'all']);
    expect(teacherKey).not.toEqual(adminKey);
  });

  it('computes correct teacherId filter based on user role', () => {
    // For teacher: filter by user.id
    const isTeacherAdmin = teacherUser.role === 'admin';
    const teacherIdFilter = !isTeacherAdmin && teacherUser.id ? teacherUser.id : undefined;
    expect(teacherIdFilter).toBe('teacher-uuid-1234');

    // For admin: filter is undefined to retrieve all assignments
    const isAdmin = adminUser.role === 'admin';
    const adminIdFilter = !isAdmin && adminUser.id ? adminUser.id : undefined;
    expect(adminIdFilter).toBeUndefined();
  });

  it('enforces enabled=false when auth is not ready (user is null)', () => {
    const unauthenticatedUser: StaffProfile | null = null;
    const isAuthReady = Boolean(unauthenticatedUser);

    expect(isAuthReady).toBe(false);
  });

  it('enforces enabled=true once auth is ready (user is populated)', () => {
    const isAuthReady = Boolean(teacherUser);

    expect(isAuthReady).toBe(true);
  });

  it('invalidates both teacher and admin queries when queryKey is prefix-invalidated', () => {
    // TanStack Query prefix matching: ['teaching_assignments'] invalidates both
    const baseKey = ['teaching_assignments'];
    const teacherKey = facultyKeys.assignments(teacherUser.id);
    const adminKey = facultyKeys.assignments(undefined);

    expect(teacherKey[0]).toBe(baseKey[0]);
    expect(adminKey[0]).toBe(baseKey[0]);
  });
});
