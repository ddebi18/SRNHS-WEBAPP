import React from 'react';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';

export const AdminLoginPage: React.FC = () => {
  return (
    <PortalLoginForm
      portal="admin"
      portalTitle="Administrator Sign-In"
      portalSubtitle="Sign in to manage students, staff schedules, entry logs, and school-wide reports."
      identifierLabel="Username or Email"
      identifierPlaceholder="admin"
      switchUrl="/teacher/login"
      switchLabel="Faculty or Teacher? Go to Faculty Sign-In"
      defaultRedirect="/"
    />
  );
};
