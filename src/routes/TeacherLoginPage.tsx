import React from 'react';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';

export const TeacherLoginPage: React.FC = () => {
  return (
    <PortalLoginForm
      portal="teacher"
      portalTitle="Faculty Sign-In"
      portalSubtitle="Enter your institutional email to access your classroom roster."
      identifierLabel="Institutional Email"
      identifierPlaceholder="user@srnhs.edu.ph"
      switchUrl="/admin/login"
      switchLabel="School Administrator? Go to Administrator Sign-In"
      defaultRedirect="/classroom"
    />
  );
};
