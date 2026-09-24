import type { UserRole } from '@/types/domain.types';

export const getRoleLabel = (role?: UserRole | null): string => {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'teacher':
      return 'Faculty';
    case 'student':
      return 'Student';
    default:
      return 'Staff';
  }
};

export const getDashboardGreeting = (hour: number, role?: UserRole | null): string => {
  const period = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${period}, ${getRoleLabel(role)}.`;
};
