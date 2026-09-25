import React from 'react';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';

export const StudentLoginPage: React.FC = () => {
  return (
    <PortalLoginForm
      portal="student"
      portalTitle="Student Sign-In"
      portalSubtitle="Enter your student credentials to access your attendance portal."
      identifierLabel="Username or Student Email"
      identifierPlaceholder="student"
      switchUrl="/teacher/login"
      switchLabel="Faculty or Teacher? Go to Faculty Sign-In"
      defaultRedirect="/student/dashboard"
    />
  );
};

export default StudentLoginPage;
