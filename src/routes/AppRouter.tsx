import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { NavigationLayout } from '@/components/ui/NavigationLayout';
import { LoadingSpinner, ForbiddenState } from '@/components/ui/StateViews';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';
import { UserRole } from '@/types/domain.types';

const LoginPage = lazy(() => import('./LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardOverviewPage = lazy(() => import('./DashboardOverviewPage').then(m => ({ default: m.DashboardOverviewPage })));
const GateLogPage = lazy(() => import('./GateLogPage').then(m => ({ default: m.GateLogPage })));
const ClassroomAttendancePage = lazy(() => import('./ClassroomAttendancePage').then(m => ({ default: m.ClassroomAttendancePage })));
const StudentsPage = lazy(() => import('./StudentsPage').then(m => ({ default: m.StudentsPage })));
const FacultyPage = lazy(() => import('./FacultyPage').then(m => ({ default: m.FacultyPage })));
const AcademicsPage = lazy(() => import('./AcademicsPage').then(m => ({ default: m.AcademicsPage })));
const SmsLogPage = lazy(() => import('./SmsLogPage').then(m => ({ default: m.SmsLogPage })));
const FaceRegistrationPage = lazy(() => import('./FaceRegistrationPage').then(m => ({ default: m.FaceRegistrationPage })));
const ForbiddenPage = lazy(() => import('./ForbiddenPage').then(m => ({ default: m.ForbiddenPage })));
const NotFoundPage = lazy(() => import('./NotFoundPage').then(m => ({ default: m.NotFoundPage })));

// Protected Route Guard Wrapper
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();
  const { role } = useRole();

  if (isLoading) {
    return <LoadingSpinner label="Authenticating session..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <NavigationLayout>
        <ForbiddenState message={`This route requires one of the following roles: ${allowedRoles.join(', ')}`} />
      </NavigationLayout>
    );
  }

  return <NavigationLayout>{children}</NavigationLayout>;
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <LoginPage />
      </Suspense>
    ),
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
