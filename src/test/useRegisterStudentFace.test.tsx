import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRegistrationState = vi.hoisted(() => ({
  students: [] as Array<{ id: string; name: string; faceDescriptors?: number[][] }>,
  saveCalls: 0,
}));

vi.mock('@/features/faceRegistration/api', () => ({
  getStoredStudents: () => mockRegistrationState.students,
  submitFaceRegistration: async () => {
    mockRegistrationState.saveCalls++;
    return { success: true, studentId: 'new-student', message: 'saved' };
  },
}));

vi.mock('@/features/attendance/lib/faceNetEngine', () => ({
  FACE_DESCRIPTOR_EXTRACTION_FAILURE_MESSAGES: {},
  extractDescriptorsFromBlobsWithDiagnostics: vi.fn(),
}));

import { useRegisterStudentFace } from '@/features/faceRegistration/hooks/useRegisterStudentFace';

describe('registration descriptor validation', () => {
  beforeEach(() => {
    mockRegistrationState.students = [{
      id: 'existing-student',
      name: 'Existing Student',
      faceDescriptors: [[10, 10], [1.1, 0], [30, 30]],
    }];
    mockRegistrationState.saveCalls = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('checks each new pose against every pose of every other student', async () => {
    const { result } = renderHook(() => useRegisterStudentFace());
    await act(async () => {
      await expect(result.current.submit({
        studentId: 'new-student',
        sectionId: 'section',
        frames: [
          { angle: 'front', blob: new Blob(['front']) },
          { angle: 'left', blob: new Blob(['left']) },
          { angle: 'right', blob: new Blob(['right']) },
        ],
        consentConfirmed: true,
        faceDescriptors: [[0, 0], [1, 0], [2, 0]],
      })).rejects.toThrow('already belongs to Existing Student');
    });

    expect(mockRegistrationState.saveCalls).toBe(0);
  });
});
