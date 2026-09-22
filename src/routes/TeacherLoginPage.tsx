import React from 'react';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';

export const TeacherLoginPage: React.FC = () => {
  return (
    <PortalLoginForm
      portal="teacher"
      portalTitle="Faculty Sign-In"
      portalSubtitle="Sign in to take attendance, update student records, and send SMS alerts to guardians."
      identifierLabel="Institutional Email"
      identifierPlaceholder="user@srnhs.edu.ph"
      switchUrl="/admin/login"
      switchLabel="School Administrator? Go to Administrator Sign-In"
      defaultRedirect="/classroom"
    />
  );
};
