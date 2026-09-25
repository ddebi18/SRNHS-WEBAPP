export const SITE_CONFIG = {
  schoolName: 'San Roque National High School',
  schoolAcronym: 'SRNHS',
  systemTitle: 'Facial Recognition Attendance Monitoring System',
  department: 'Division of City Schools — Department of Education',
  address: '#15 Marigman Street, Brgy. San Roque, Antipolo City, 1870 Rizal, Philippines',
  region: 'Region IV-A (CALABARZON)',
  division: 'DepEd Schools Division Office (SDO) of Antipolo City',
  schoolType: 'Public Secondary High School (Junior High & Senior High)',
  established: 2007,
  sealPath: '/srnhs-seal.jpg',
  gateCameraLocation: 'Main Gate turnstile Camera 01',
  defaultGradeLevels: [7, 8, 9, 10, 11, 12],
  demoModeDefaultRole: 'admin' as const,

  vision:
    'We dream of Filipinos who passionately love their country and whose values and competencies enable them to realize their full potential and contribute meaningfully to building the nation. As a learner-centered public institution, the Department of Education continuously improves itself to better serve its stakeholders.',

  mission:
    'To protect and promote the right of every Filipino to quality, equitable, culture-based, and complete basic education.',

  coreValues: [
    { filipino: 'Maka-Diyos', english: 'God-fearing' },
    { filipino: 'Maka-tao', english: 'Humane' },
    { filipino: 'Makakalikasan', english: 'Environmentally Conscious' },
    { filipino: 'Maka-bansa', english: 'Patriotic' },
  ],

  history:
    'San Roque National High School was formally established in September 2007 to cater to students initially attending the Reyes Annex and Rolluqui Annex of Antipolo National High School. Over the years, the institution has expanded significantly in both student population and campus infrastructure, evolving into an active center for academics, athletic competition, and community engagement.',

  programs: {
    juniorHigh: [
      'Regular Basic Education Curriculum (BEC)',
      'Special Science Class (SSC) / Science Technology & Engineering (STE) Program',
    ],
    seniorHigh: {
      academic: [
        'Accountancy, Business, and Management (ABM)',
        'General Academic Strand (GAS)',
        'Humanities and Social Sciences (HUMSS)',
      ],
      tvl: [
        'Information and Communications Technology (ICT)',
        'Home Economics (HE)',
      ],
    },
  },

  organizations: [
    'Supreme Secondary Learner Government (SSLG)',
    'Interact Club of SRNHS',
    'Athletic Teams (Volleyball, Basketball, Sepak Takraw)',
    'Campus Journalism (English & Filipino)',
  ],
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
