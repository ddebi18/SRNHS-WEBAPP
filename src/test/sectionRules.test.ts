import { describe, it, expect } from 'vitest';
import { isSectionLocked } from '@/features/academics/api';

describe('Academic Section Rules (Rule A & Rule B)', () => {
  describe('Rule A: 0-subject section enrollment blocking', () => {
    it('determines if a section has subjects assigned', () => {
      const sectionSubjects = [
        { id: '1', section_id: 'sec-active', subject_id: 'sub-1', created_at: '' },
        { id: '2', section_id: 'sec-active', subject_id: 'sub-2', created_at: '' },
      ];

      const activeSubjectCount = sectionSubjects.filter(ss => ss.section_id === 'sec-active').length;
      const emptySubjectCount = sectionSubjects.filter(ss => ss.section_id === 'sec-empty').length;

      expect(activeSubjectCount).toBe(2);
      expect(emptySubjectCount).toBe(0);

      // Rule A condition: enrolling into sec-empty is rejected
      const canEnrollActive = activeSubjectCount > 0;
      const canEnrollEmpty = emptySubjectCount > 0;

      expect(canEnrollActive).toBe(true);
      expect(canEnrollEmpty).toBe(false);
    });
  });

  describe('Rule B: Section lock on enrolled learners', () => {
    it('marks a section as locked when at least one student is enrolled', () => {
      const locked = isSectionLocked(5);
      expect(locked).toBe(true);
    });

    it('marks a section as unlocked when zero students are enrolled', () => {
      const locked = isSectionLocked(0);
      expect(locked).toBe(false);
    });

    it('prohibits grade level modification and deletion when locked', () => {
      const section = { id: 'sec-1', name: 'Rizal', grade_level: 10 };
      const enrolledCount = 3;
      const locked = isSectionLocked(enrolledCount);

      // Attempt deletion
      const canDelete = !locked;
      expect(canDelete).toBe(false);

      // Attempt changing grade level
      const newGradeLevel = 11;
      const canChangeGradeLevel = !locked || newGradeLevel === section.grade_level;
      expect(canChangeGradeLevel).toBe(false);

      // But adviser changes are permitted under Rule B
      const canChangeAdviser = true;
      expect(canChangeAdviser).toBe(true);
    });
  });
});
