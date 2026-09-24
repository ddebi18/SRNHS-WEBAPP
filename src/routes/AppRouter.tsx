import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { NavigationLayout } from '@/components/ui/NavigationLayout';
import { StudentNavigationLayout } from '@/components/ui/StudentNavigationLayout';
import { LoadingSpinner, ForbiddenState } from '@/components/ui/StateViews';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';
import { UserRole } from '@/types/domain.types';

const AdminLoginPage = lazy(() => import('./AdminLoginPage').then(m => ({ default: m.AdminLoginPage })));
const TeacherLoginPage = lazy(() => import('./TeacherLoginPage').then(m => ({ default: m.TeacherLoginPage })));
const StudentLoginPage = lazy(() => import('./StudentLoginPage').then(m => ({ default: m.StudentLoginPage })));
const DashboardOverviewPage = lazy(() => import('./DashboardOverviewPage').then(m => ({ default: m.DashboardOverviewPage })));
const GateLogPage = lazy(() => import('./GateLogPage').then(m => ({ default: m.GateLogPage })));
const ClassroomAttendancePage = lazy(() => import('./ClassroomAttendancePage').then(m => ({ default: m.ClassroomAttendancePage })));
const StudentsPage = lazy(() => import('./StudentsPage').then(m => ({ default: m.StudentsPage })));
const FacultyPage = lazy(() => import('./FacultyPage').then(m => ({ default: m.FacultyPage })));
const AcademicsPage = lazy(() => import('./AcademicsPage').then(m => ({ default: m.AcademicsPage })));
const SmsLogPage = lazy(() => import('./SmsLogPage').then(m => ({ default: m.SmsLogPage })));
const FaceRegistrationPage = lazy(() => import('./FaceRegistrationPage').then(m => ({ default: m.FaceRegistrationPage })));
const StudentDashboardPage = lazy(() => import('./StudentDashboardPage').then(m => ({ default: m.StudentDashboardPage })));
const ForbiddenPage = lazy(() => import('./ForbiddenPage').then(m => ({ default: m.ForbiddenPage })));
const NotFoundPage = lazy(() => import('./NotFoundPage').then(m => ({ default: m.NotFoundPage })));

// Protected Route Guard Wrapper (Requirement 4: Role-based guards and targeted redirects)
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();
  const { role } = useRole();

  if (isLoading) {
    return <LoadingSpinner label="Authenticating session..." />;
  }

  // Unauthenticated users go to the login portal for the area they tried to reach
  if (!user) {
    const isAdminOnlyRoute = allowedRoles && allowedRoles.length === 1 && allowedRoles[0] === 'admin';
    return <Navigate to={isAdminOnlyRoute ? '/admin/login' : '/teacher/login'} replace />;
  }

  // Students trying to access admin/teacher routes get redirected to student dashboard
  if (role === 'student' && allowedRoles && !allowedRoles.includes('student')) {
    return <Navigate to="/student/dashboard" replace />;
  }

  // Wrong-role users get a 403 Forbidden state
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <NavigationLayout>
        <ForbiddenState message="Access restricted. Your account scope does not have authorization for this area." />
      </NavigationLayout>
    );
  }

  return <NavigationLayout>{children}</NavigationLayout>;
};

// Student-specific protected route with student navigation layout
const StudentProtectedRoute: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const { role } = useRole();

  if (isLoading) {
    return <LoadingSpinner label="Authenticating session..." />;
  }

  if (!user) {
    return <Navigate to="/student/login" replace />;
  }

  if (role !== 'student') {
    return <Navigate to="/" replace />;
  }

  return <StudentNavigationLayout>{children}</StudentNavigationLayout>;
};

const router = createBrowserRouter([
  {
    path: '/admin/login',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <AdminLoginPage />
      </Suspense>
    ),
  },
  {
    path: '/teacher/login',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <TeacherLoginPage />
      </Suspense>
    ),
  },
  {
    path: '/student/login',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <StudentLoginPage />
      </Suspense>
    ),
  },
  {
    path: '/login',
    element: <Navigate to="/teacher/login" replace />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <DashboardOverviewPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/gate-log',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <Suspense fallback={<LoadingSpinner />}>
          <GateLogPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/classroom',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <ClassroomAttendancePage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/students',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <StudentsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/faculty',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <FacultyPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/academics',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <Suspense fallback={<LoadingSpinner />}>
          <AcademicsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/sms-log',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <Suspense fallback={<LoadingSpinner />}>
          <SmsLogPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/face-registration',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <FaceRegistrationPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/sections/:sectionId/face-registration',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <FaceRegistrationPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // ── Student Portal Routes ─────────────────────────────
  {
    path: '/student/dashboard',
    element: (
      <StudentProtectedRoute>
        <Suspense fallback={<LoadingSpinner />}>
          <StudentDashboardPage />
        </Suspense>
      </StudentProtectedRoute>
    ),
  },
  {
    path: '/student/face-scan',
    element: (
      <StudentProtectedRoute>
        <Suspense fallback={<LoadingSpinner />}>
          <StudentDashboardPage />
        </Suspense>
      </StudentProtectedRoute>
    ),
  },
  {
    path: '/student/subjects',
    element: (
      <StudentProtectedRoute>
        <Suspense fallback={<LoadingSpinner />}>
          <StudentDashboardPage />
        </Suspense>
      </StudentProtectedRoute>
    ),
  },
  {
    path: '/student/history',
    element: (
      <StudentProtectedRoute>
        <Suspense fallback={<LoadingSpinner />}>
          <StudentDashboardPage />
        </Suspense>
      </StudentProtectedRoute>
    ),
  },
  {
    path: '/student/mobile-attendance',
    element: (
      <StudentProtectedRoute>
        <Suspense fallback={<LoadingSpinner />}>
          <StudentDashboardPage />
        </Suspense>
      </StudentProtectedRoute>
    ),
  },
  {
    path: '/forbidden',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <ForbiddenPage />
      </Suspense>
    ),
  },
  {
    path: '*',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <NotFoundPage />
      </Suspense>
    ),
  },
]);

export const AppRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};
