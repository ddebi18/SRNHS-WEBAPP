export const SITE_CONFIG = {
  schoolName: 'San Roque National High School',
  schoolAcronym: 'SRNHS',
  systemTitle: 'Facial Recognition Attendance Monitoring System',
  department: 'Division of City Schools — Department of Education',
  gateCameraLocation: 'Main Gate turnstile Camera 01',
  defaultGradeLevels: [7, 8, 9, 10, 11, 12],
  demoModeDefaultRole: 'admin' as const,
};

export const MOCK_USERS = {
  admin: {
    id: 'usr-admin-001',
    email: 'principal.santos@srnhs.edu.ph',
    full_name: 'Dr. Maria Santos',
    role: 'admin' as const,
    department: 'Office of the Principal',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  teacher: {
    id: 'usr-teacher-101',
    email: 'j.delacruz@srnhs.edu.ph',
    full_name: 'Mr. Juan Dela Cruz',
    role: 'teacher' as const,
    department: 'Science & Mathematics Faculty',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};
