import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Legacy Login route (/login)
 * Automatically redirects to /teacher/login per project requirements.
 */
export const LoginPage: React.FC = () => {
  return <Navigate to="/teacher/login" replace />;
};

export default LoginPage;
