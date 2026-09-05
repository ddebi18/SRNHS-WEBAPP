import React from 'react';
import { useParams } from 'react-router-dom';
import { SectionRosterEnrollment } from '@/features/faceRegistration/components/SectionRosterEnrollment';

export const FaceRegistrationPage: React.FC = () => {
  const { sectionId } = useParams<{ sectionId?: string }>();

  return <SectionRosterEnrollment initialSectionId={sectionId || 'sec-101'} />;
};

export default FaceRegistrationPage;
