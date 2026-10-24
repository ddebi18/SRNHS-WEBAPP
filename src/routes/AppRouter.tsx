import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { NavigationLayout } from '@/components/ui/NavigationLayout';
import { LoadingSpinner, ForbiddenState } from '@/components/ui/StateViews';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';
import { UserRole } from '@/types/domain.types';
import { supabase } from '@/lib/supabase';

const AdminLoginPage = lazy(() => import('./AdminLoginPage').then(m => ({ default: m.AdminLoginPage })));
const TeacherLoginPage = lazy(() => import('./TeacherLoginPage').then(m => ({ default: m.TeacherLoginPage })));
const DashboardOverviewPage = lazy(() => import('./DashboardOverviewPage').then(m => ({ default: m.DashboardOverviewPage })));
const GateLogPage = lazy(() => import('./GateLogPage').then(m => ({ default: m.GateLogPage })));
const ClassroomAttendancePage = lazy(() => import('./ClassroomAttendancePage').then(m => ({ default: m.ClassroomAttendancePage })));
const StudentsPage = lazy(() => import('./StudentsPage').then(m => ({ default: m.StudentsPage })));
const FacultyPage = lazy(() => import('./FacultyPage').then(m => ({ default: m.FacultyPage })));
const SectionsPage = lazy(() => import('./SectionsPage').then(m => ({ default: m.SectionsPage })));
const SubjectsPage = lazy(() => import('./SubjectsPage').then(m => ({ default: m.SubjectsPage })));
const RoomsPage = lazy(() => import('./RoomsPage').then(m => ({ default: m.RoomsPage })));
const SmsLogPage = lazy(() => import('./SmsLogPage').then(m => ({ default: m.SmsLogPage })));
const FaceRegistrationPage = lazy(() => import('./FaceRegistrationPage').then(m => ({ default: m.FaceRegistrationPage })));
const TempAccessPage = lazy(() => import('./TempAccessPage').then(m => ({ default: m.TempAccessPage })));
const ForbiddenPage = lazy(() => import('./ForbiddenPage').then(m => ({ default: m.ForbiddenPage })));
const NotFoundPage = lazy(() => import('./NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const SetPasswordPage = lazy(() => import('./SetPasswordPage').then(m => ({ default: m.SetPasswordPage })));
const GradesPage = lazy(() => import('./GradesPage').then(m => ({ default: m.GradesPage })));
const StudentScanPage = lazy(() => import('./StudentScanPage').then(m => ({ default: m.StudentScanPage })));
const EventsPage = lazy(() => import('./EventsPage').then(m => ({ default: m.EventsPage })));
const GuardianLoginPage = lazy(() => import('./GuardianLoginPage').then(m => ({ default: m.GuardianLoginPage })));
const GuardianPortalPage = lazy(() => import('./GuardianPortalPage').then(m => ({ default: m.GuardianPortalPage })));
const UserLogsPage = lazy(() => import('./UserLogsPage').then(m => ({ default: m.UserLogsPage })));
const AnnouncementsPage = lazy(() => import('./AnnouncementsPage').then(m => ({ default: m.AnnouncementsPage })));
const FacultyReportsPage = lazy(() => import('./FacultyReportsPage').then(m => ({ default: m.FacultyReportsPage })));
const ViolationsPage = lazy(() => import('./ViolationsPage').then(m => ({ default: m.ViolationsPage })));

// Protected Route Guard Wrapper: Role-based guards and targeted redirects
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
    if (allowedRoles?.includes('guardian')) {
      return <Navigate to="/guardian/login" replace />;
    }
    const isAdminOnlyRoute = allowedRoles && allowedRoles.length === 1 && allowedRoles[0] === 'admin';
    return <Navigate to={isAdminOnlyRoute ? '/admin/login' : '/teacher/login'} replace />;
  }

  // If logged-in user is a guardian trying to access staff pages, redirect to guardian portal
  if (role === 'guardian' && !allowedRoles?.includes('guardian')) {
    return <Navigate to="/guardian" replace />;
  }

  // Invite guard: if the Supabase user exists but hasn't set a password yet
  // (invited_at present, password_set metadata not true), redirect to /set-password.
  if (supabase) {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (u?.invited_at && u.user_metadata?.password_set !== true) {
        window.location.replace('/set-password');
      }
    }).catch(() => { /* non-fatal */ });
  }

  // Wrong-role users get a 403 Forbidden state
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <NavigationLayout>
        <ForbiddenState message="Access restricted. Your account scope does not have authorization for this area." />
      </NavigationLayout>
    );
  }

  // Guardians have their own dedicated portal shell and do not render staff NavigationLayout
  if (role === 'guardian') {
    return <>{children}</>;
  }

  return <NavigationLayout>{children}</NavigationLayout>;
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
    path: '/guardian/login',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <GuardianLoginPage />
      </Suspense>
    ),
  },
  {
    path: '/guardian',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <Suspense fallback={<LoadingSpinner />}>
          <GuardianPortalPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/guardian/*',
    element: <Navigate to="/guardian" replace />,
  },
  {
    path: '/login',
    element: <Navigate to="/teacher/login" replace />,
  },
  // ── Public: Set Password (invited teachers & guardians) ──
  {
    path: '/set-password',
    element: (
      <Suspense fallback={<LoadingSpinner label="Loading..." />}>
        <SetPasswordPage />
      </Suspense>
    ),
  },
  // ── Public Temporary Single-Use Student Access Route ──
  {
    path: '/temp-access/:token',
    element: (
      <Suspense fallback={<LoadingSpinner label="Loading student access portal..." />}>
        <TempAccessPage />
      </Suspense>
    ),
  },
  // ── Public Student QR Scan Attendance Route ──
  {
    path: '/scan',
    element: (
      <Suspense fallback={<LoadingSpinner label="Loading attendance portal..." />}>
        <StudentScanPage />
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
      <ProtectedRoute allowedRoles={['teacher']}>
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
    path: '/grades',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <GradesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/events',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <EventsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/announcements',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <AnnouncementsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/faculty-reports',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <FacultyReportsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/violations',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <Suspense fallback={<LoadingSpinner />}>
          <ViolationsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/academics',
    element: <Navigate to="/sections" replace />,
  },
  {
    path: '/sections',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <Suspense fallback={<LoadingSpinner />}>
          <SectionsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/subjects',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <Suspense fallback={<LoadingSpinner />}>
          <SubjectsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/rooms',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <Suspense fallback={<LoadingSpinner />}>
          <RoomsPage />
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
    path: '/logs',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <Suspense fallback={<LoadingSpinner />}>
          <UserLogsPage />
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
