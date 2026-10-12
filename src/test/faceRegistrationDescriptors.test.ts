import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabase = vi.hoisted(() => ({
  configured: true,
  selectedColumns: [] as string[],
  responses: [] as Array<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
}));

vi.mock('@/lib/supabase', () => {
  const client = {
    from: () => ({
      select: (columns: string) => {
        mockSupabase.selectedColumns.push(columns);
        return {
          order: async () => mockSupabase.responses.shift(),
        };
      },
    }),
  };

  return {
    get isSupabaseConfigured() {
      return mockSupabase.configured;
    },
    get supabase() {
      return mockSupabase.configured ? client : null;
    },
  };
});

import { fetchRegisteredStudents } from '@/features/faceRegistration/api';

const registeredStudentRow = {
  id: '00000000-0000-4000-8000-000000000001',
  lrn: '123456789012',
  first_name: 'Test',
  last_name: 'Student',
  section_id: '00000000-0000-4000-8000-000000000002',
  photo_urls: ['data:image/jpeg;base64,photo'],
  face_descriptors: [[0.1, 0.2, 0.3]],
  face_descriptor_version: 2,
  student_guardians: [],
};

describe('registered face descriptor loading', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSupabase.configured = true;
    mockSupabase.selectedColumns = [];
    mockSupabase.responses = [];
  });

  it('loads the descriptors persisted for face recognition', async () => {
    mockSupabase.responses = [{ data: [registeredStudentRow], error: null }];

    const students = await fetchRegisteredStudents();

    expect(mockSupabase.selectedColumns[0]).toContain('face_descriptors');
    expect(mockSupabase.selectedColumns[0]).toContain('face_descriptor_version');
    expect(students[0]).toMatchObject({
      faceDescriptors: [[0.1, 0.2, 0.3]],
      faceDescriptorVersion: 2,
    });
  });

  it('falls back to the base roster when descriptor columns are unavailable', async () => {
    mockSupabase.responses = [
      { data: null, error: { message: 'column face_descriptors does not exist' } },
      { data: [{ ...registeredStudentRow, face_descriptors: undefined, face_descriptor_version: undefined }], error: null },
    ];

    const students = await fetchRegisteredStudents();

    expect(mockSupabase.selectedColumns).toHaveLength(2);
    expect(mockSupabase.selectedColumns[1]).not.toContain('face_descriptors');
    expect(students[0]?.faceRegistrationStatus).toBe('registered');
  });
});
