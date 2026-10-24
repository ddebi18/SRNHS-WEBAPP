import React from 'react';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';

export const GuardianLoginPage: React.FC = () => {
  return (
    <PortalLoginForm
      portal="guardian"
      portalTitle="Guardian Sign-In"
      portalSubtitle="Sign in to view your child's attendance and academic progress."
      identifierLabel="Guardian Email Address"
      identifierPlaceholder="parent.guardian@example.com"
      switchUrl="/teacher/login"
      switchLabel="Faculty or Teacher? Go to Faculty Sign-In"
      defaultRedirect="/guardian"
    />
  );
};
