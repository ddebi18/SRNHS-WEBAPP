import { describe, it, expect } from 'vitest';
import { Section } from '@/types/domain.types';

// Adviser business rules helper
export function validateAdviserAssignment({
  targetSection,
  newAdviserId,
  allSections,
  confirmReplace,
}: {
  targetSection: Section;
  newAdviserId: string | null;
  allSections: Section[];
  confirmReplace: boolean;
}): { valid: boolean; requiresConfirmation?: boolean; error?: string } {
  // If unassigning
  if (!newAdviserId) {
    return { valid: true };
  }

  // Rule 1: A teacher cannot advise two sections simultaneously
  const otherSectionWithThisAdviser = allSections.find(
    s => s.id !== targetSection.id && s.adviser_id === newAdviserId
  );
  if (otherSectionWithThisAdviser) {
    return {
      valid: false,
      error: `Teacher is already class adviser of Grade ${otherSectionWithThisAdviser.grade_level} - ${otherSectionWithThisAdviser.name}. A teacher cannot advise two sections.`,
    };
  }

  // Rule 2: If the section already has a different adviser, requires confirmation to replace
  if (targetSection.adviser_id && targetSection.adviser_id !== newAdviserId) {
    if (!confirmReplace) {
      return {
        valid: false,
        requiresConfirmation: true,
        error: 'Please confirm replacement of current section adviser.',
      };
    }
  }

  return { valid: true };
}

const SAMPLE_SECTIONS: Section[] = [
  {
    id: 'sec-1',
    grade_level: 10,
    name: 'Dianthus',
    adviser_id: 't-1',
    adviser_name: 'Ms. Elena Torres',
    created_at: '',
  },
  {
    id: 'sec-2',
    grade_level: 10,
    name: 'Rizal',
    adviser_id: null,
    created_at: '',
  },
  {
    id: 'sec-3',
    grade_level: 10,
    name: 'Jordan',
    adviser_id: null,
    created_at: '',
  },
];

describe('Adviser Assignment Rules', () => {
  it('allows assigning an unassigned teacher to an unassigned section', () => {
    const section = SAMPLE_SECTIONS.find(s => s.id === 'sec-2')!;
    const result = validateAdviserAssignment({
      targetSection: section,
      newAdviserId: 't-2', // Mr. Juan Dela Cruz
      allSections: SAMPLE_SECTIONS,
      confirmReplace: false,
    });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('prevents assigning a teacher who is already advising another section (one section per teacher)', () => {
    const section = SAMPLE_SECTIONS.find(s => s.id === 'sec-2')!;
    const result = validateAdviserAssignment({
      targetSection: section,
      newAdviserId: 't-1', // Already advising Dianthus (sec-1)
      allSections: SAMPLE_SECTIONS,
      confirmReplace: false,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('already class adviser of Grade 10 - Dianthus');
  });

  it('requires explicit confirmation when replacing an existing section adviser', () => {
    const section = SAMPLE_SECTIONS.find(s => s.id === 'sec-1')!; // currently advised by t-1
    const result = validateAdviserAssignment({
      targetSection: section,
      newAdviserId: 't-3', // Mrs. Anna Reyes
      allSections: SAMPLE_SECTIONS,
      confirmReplace: false, // Not confirmed yet
    });

    expect(result.valid).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.error).toContain('confirm replacement');
  });

  it('allows replacement when explicit confirmation is given', () => {
    const section = SAMPLE_SECTIONS.find(s => s.id === 'sec-1')!;
    const result = validateAdviserAssignment({
      targetSection: section,
      newAdviserId: 't-3',
      allSections: SAMPLE_SECTIONS,
      confirmReplace: true, // Confirmed!
    });

    expect(result.valid).toBe(true);
  });

  it('allows unassigning a section adviser without error', () => {
    const section = SAMPLE_SECTIONS.find(s => s.id === 'sec-1')!;
    const result = validateAdviserAssignment({
      targetSection: section,
      newAdviserId: null,
      allSections: SAMPLE_SECTIONS,
      confirmReplace: false,
    });

    expect(result.valid).toBe(true);
  });
});
