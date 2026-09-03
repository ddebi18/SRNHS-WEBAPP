import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/domain.types';

export const useRole = () => {
  const { role, user } = useAuth();

  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';

  const hasPermission = (allowedRoles: UserRole[]) => {
    if (!role) return false;
    return allowedRoles.includes(role);
  };

  return {
    role,
    user,
    isAdmin,
    isTeacher,
    hasPermission,
  };
};
