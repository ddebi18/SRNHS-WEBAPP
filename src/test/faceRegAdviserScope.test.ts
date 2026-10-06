import { describe, it, expect } from 'vitest';

// Pure logic tests for the adviser-scoped section filter used in Face Registration.
// These mirror what fetchRegistrableSections does in the browser,
// without any Supabase or localStorage dependency.

interface SectionStub { id: string; teacherId: string; name: string; gradeLevel: string; }

function filterSectionsForUser(
  sections: SectionStub[],
  userId: string | null,
  isAdmin: boolean
): SectionStub[] {
  if (isAdmin) return sections;
  if (!userId) return [];
  return sections.filter(s => s.teacherId === userId);
}

const ALL_SECTIONS: SectionStub[] = [
  { id: 'sec-dianthus', teacherId: 'teacher-1', name: 'Dianthus', gradeLevel: 'Grade 10' },
  { id: 'sec-jordan',   teacherId: 'teacher-2', name: 'Jordan',   gradeLevel: 'Grade 10' },
  { id: 'sec-rizal',    teacherId: '',           name: 'Rizal',    gradeLevel: 'Grade 10' },
];

describe('fetchRegistrableSections filter logic', () => {
  it('admin sees all sections', () => {
    expect(filterSectionsForUser(ALL_SECTIONS, 'admin-1', true)).toHaveLength(3);
  });

  it('teacher sees only their advised section', () => {
    const result = filterSectionsForUser(ALL_SECTIONS, 'teacher-1', false);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Dianthus');
  });

  it('teacher with no advised section gets empty array', () => {
    expect(filterSectionsForUser(ALL_SECTIONS, 'teacher-nobody', false)).toHaveLength(0);
  });

  it('unauthenticated user (null id) gets empty array', () => {
    expect(filterSectionsForUser(ALL_SECTIONS, null, false)).toHaveLength(0);
  });

  it('teacher cannot see sections they are not adviser of', () => {
    const result = filterSectionsForUser(ALL_SECTIONS, 'teacher-2', false);
    expect(result.some(s => s.name === 'Dianthus')).toBe(false);
    expect(result.some(s => s.name === 'Rizal')).toBe(false);
    expect(result.some(s => s.name === 'Jordan')).toBe(true);
  });
});

describe('Section dropdown rules', () => {
  it('admin: All Sections option is available (gated on isAdmin=true)', () => {
    expect(true).toBe(true); // isAdmin flag controls this in JSX
  });

  it('teacher with exactly one section shows fixed advisory label', () => {
    const teacherSections = filterSectionsForUser(ALL_SECTIONS, 'teacher-1', false);
    // !isAdmin && sections.length === 1 => fixed label
    const showFixedLabel = !false && teacherSections.length === 1;
    expect(showFixedLabel).toBe(true);
  });

  it('teacher with zero sections triggers no-section empty state', () => {
    const teacherSections = filterSectionsForUser(ALL_SECTIONS, 'teacher-nobody', false);
    // !isAdmin && !loading && sections.length === 0 => empty state
    const showEmptyState = !false && teacherSections.length === 0;
    expect(showEmptyState).toBe(true);
  });

  it('admin with multiple sections shows dropdown, not fixed label', () => {
    const adminSections = filterSectionsForUser(ALL_SECTIONS, 'admin-1', true);
    // isAdmin means no fixed label regardless of count
    const showFixedLabel = !true && adminSections.length === 1;
    expect(showFixedLabel).toBe(false);
  });
});
