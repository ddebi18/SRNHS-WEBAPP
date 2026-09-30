import { describe, it, expect } from 'vitest';

// SearchableSelect filtering logic — extracted for unit testing

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

function filterOptions(options: Option[], query: string): Option[] {
  const q = query.trim();
  if (!q) return options;
  const lower = q.toLowerCase();
  return options.filter(
    o =>
      o.label.toLowerCase().includes(lower) ||
      (o.sublabel?.toLowerCase().includes(lower) ?? false)
  );
}

const TEACHERS: Option[] = [
  { value: '1', label: 'Ms. Elena Torres', sublabel: 'e.torres@srnhs.edu.ph' },
  { value: '2', label: 'Mr. Juan Dela Cruz', sublabel: 'j.delacruz@srnhs.edu.ph' },
  { value: '3', label: 'Mrs. Anna Reyes', sublabel: 'a.reyes@srnhs.edu.ph' },
  { value: '4', label: 'Mr. Carlos Mendoza', sublabel: 'c.mendoza@srnhs.edu.ph' },
];

describe('SearchableSelect — filtering', () => {
  it('returns all options for empty query', () => {
    expect(filterOptions(TEACHERS, '')).toHaveLength(4);
  });

  it('returns all options for whitespace-only query', () => {
    expect(filterOptions(TEACHERS, '   ')).toHaveLength(4);
  });

  it('filters by label (case-insensitive)', () => {
    const results = filterOptions(TEACHERS, 'elena');
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('Ms. Elena Torres');
  });

  it('filters by sublabel (email)', () => {
    const results = filterOptions(TEACHERS, 'j.delacruz');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('2');
  });

  it('is case-insensitive on uppercase query', () => {
    const results = filterOptions(TEACHERS, 'REYES');
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('Mrs. Anna Reyes');
  });

  it('returns multiple matches for partial query', () => {
    const results = filterOptions(TEACHERS, 'mr');
    // Matches "Mr. Juan Dela Cruz" and "Mr. Carlos Mendoza"
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array for no match', () => {
    const results = filterOptions(TEACHERS, 'XYZNONEXISTENT');
    expect(results).toHaveLength(0);
  });

  it('handles options without sublabel gracefully', () => {
    const opts: Option[] = [{ value: 'a', label: 'Sampaguita' }];
    expect(filterOptions(opts, 'samp')).toHaveLength(1);
    expect(filterOptions(opts, 'email')).toHaveLength(0);
  });

  it('matches partial email domain', () => {
    const results = filterOptions(TEACHERS, 'srnhs.edu.ph');
    expect(results).toHaveLength(4);
  });
});
