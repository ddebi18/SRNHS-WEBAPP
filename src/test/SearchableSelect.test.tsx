import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  SearchableSelect,
  filterSelectOptions,
  SearchableSelectOption,
} from '@/components/ui/SearchableSelect';

const SAMPLE_OPTIONS: SearchableSelectOption[] = [
  { value: '1', label: 'Ms. Elena Torres', description: 'e.torres@srnhs.edu.ph' },
  { value: '2', label: 'Mr. Juan Dela Cruz', sublabel: 'j.delacruz@srnhs.edu.ph' },
  { value: '3', label: 'Mrs. Anna Reyes', description: 'a.reyes@srnhs.edu.ph' },
  { value: '4', label: 'Mr. Carlos Mendoza', description: 'c.mendoza@srnhs.edu.ph' },
];

describe('SearchableSelect — filterSelectOptions logic', () => {
  it('returns all options for empty query', () => {
    expect(filterSelectOptions(SAMPLE_OPTIONS, '')).toHaveLength(4);
  });

  it('returns all options for whitespace-only query', () => {
    expect(filterSelectOptions(SAMPLE_OPTIONS, '   ')).toHaveLength(4);
  });

  it('filters by label (case-insensitive)', () => {
    const results = filterSelectOptions(SAMPLE_OPTIONS, 'elena');
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('Ms. Elena Torres');
  });

  it('filters by description or sublabel', () => {
    const resultsDesc = filterSelectOptions(SAMPLE_OPTIONS, 'a.reyes');
    expect(resultsDesc).toHaveLength(1);
    expect(resultsDesc[0]!.value).toBe('3');

    const resultsSub = filterSelectOptions(SAMPLE_OPTIONS, 'j.delacruz');
    expect(resultsSub).toHaveLength(1);
    expect(resultsSub[0]!.value).toBe('2');
  });

  it('is case-insensitive on uppercase query', () => {
    const results = filterSelectOptions(SAMPLE_OPTIONS, 'REYES');
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('Mrs. Anna Reyes');
  });

  it('returns multiple matches for common partial string', () => {
    const results = filterSelectOptions(SAMPLE_OPTIONS, 'mr');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array for non-matching query', () => {
    const results = filterSelectOptions(SAMPLE_OPTIONS, 'XYZNONEXISTENT');
    expect(results).toHaveLength(0);
  });

  it('handles options without description/sublabel gracefully', () => {
    const opts: SearchableSelectOption[] = [{ value: 'a', label: 'Sampaguita' }];
    expect(filterSelectOptions(opts, 'samp')).toHaveLength(1);
    expect(filterSelectOptions(opts, 'email')).toHaveLength(0);
  });
});

describe('SearchableSelect — React Component', () => {
  it('renders trigger button with placeholder when value is null', () => {
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value={null}
        onChange={vi.fn()}
        placeholder="Choose teacher…"
      />
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveTextContent('Choose teacher…');
  });

  it('renders selected option label and description', () => {
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value="1"
        onChange={vi.fn()}
      />
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveTextContent('Ms. Elena Torres');
    expect(combobox).toHaveTextContent('e.torres@srnhs.edu.ph');
  });

  it('opens options list on click and selects an option', () => {
    const handleChange = vi.fn();
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value={null}
        onChange={handleChange}
        placeholder="Select teacher"
      />
    );

    const combobox = screen.getByRole('combobox');
    fireEvent.click(combobox);

    // Listbox should now be visible
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Click on option 3 (Mrs. Anna Reyes)
    const option = screen.getByText('Mrs. Anna Reyes');
    fireEvent.click(option);

    expect(handleChange).toHaveBeenCalledWith('3');
  });

  it('clears selection when clear button is clicked', () => {
    const handleChange = vi.fn();
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value="2"
        onChange={handleChange}
      />
    );

    const clearBtn = screen.getByLabelText('Clear selection');
    fireEvent.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith(null);
  });

  it('filters options inside dropdown when typing in search input', () => {
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value={null}
        onChange={vi.fn()}
        searchPlaceholder="Type to filter teachers…"
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText('Type to filter teachers…');
    fireEvent.change(searchInput, { target: { value: 'carlos' } });

    expect(screen.getByText('Mr. Carlos Mendoza')).toBeInTheDocument();
    expect(screen.queryByText('Ms. Elena Torres')).not.toBeInTheDocument();
  });

  it('shows empty text when no options match filter', () => {
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value={null}
        onChange={vi.fn()}
        emptyText="No teachers found"
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText('Type to filter…');
    fireEvent.change(searchInput, { target: { value: 'unknown-query' } });

    expect(screen.getByText('No teachers found')).toBeInTheDocument();
  });

  it('navigates options via keyboard ArrowDown, ArrowUp, and Enter', () => {
    const handleChange = vi.fn();
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value={null}
        onChange={handleChange}
      />
    );

    const combobox = screen.getByRole('combobox');
    // Open via Enter
    fireEvent.keyDown(combobox, { key: 'Enter' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Arrow down to first item and enter
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.keyDown(combobox, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith('1');
  });

  it('closes dropdown on Escape and Tab keys', () => {
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value={null}
        onChange={vi.fn()}
      />
    );

    const combobox = screen.getByRole('combobox');
    fireEvent.click(combobox);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(combobox, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(combobox);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(combobox, { key: 'Tab' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('displays error message when error prop is provided', () => {
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value={null}
        onChange={vi.fn()}
        error="This field is required"
      />
    );

    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('does not open when disabled', () => {
    render(
      <SearchableSelect
        id="test-select"
        options={SAMPLE_OPTIONS}
        value={null}
        onChange={vi.fn()}
        disabled
      />
    );

    const combobox = screen.getByRole('combobox');
    fireEvent.click(combobox);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
