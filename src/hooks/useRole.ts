import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/domain.types';

export const useRole = () => {
  const { role, user } = useAuth();

  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  // Only the assigned teacher for a section may change attendance status.
  // Admins are read-only on classroom attendance.
  const canMarkAttendance = isTeacher;

  const hasPermission = (allowedRoles: UserRole[]) => {
    if (!role) return false;
    return allowedRoles.includes(role);
  };

  return {
    role,
    user,
    isAdmin,
    isTeacher,
    canMarkAttendance,
    hasPermission,
  };
};
