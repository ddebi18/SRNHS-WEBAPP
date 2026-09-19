import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { SectionRosterEnrollment } from '@/features/faceRegistration/components/SectionRosterEnrollment';

export const FaceRegistrationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get('studentId') || undefined;
  const sectionId = searchParams.get('sectionId') || undefined;

  return (
    <SectionRosterEnrollment
      initialSectionId={sectionId}
      initialStudentId={studentId}
    />
  );
};

export default FaceRegistrationPage;
