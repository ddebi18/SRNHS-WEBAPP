import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabaseState = vi.hoisted(() => ({
  configured: true,
  updatePayload: null as Record<string, unknown> | null,
  updateCalls: 0,
  updateResult: {
    data: { id: '00000000-0000-4000-8000-000000000001' } as { id: string } | null,
    error: null as { message: string } | null,
  },
}));

vi.mock('@/lib/supabase', () => {
  const client = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        mockSupabaseState.updatePayload = payload;
        mockSupabaseState.updateCalls += 1;
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => mockSupabaseState.updateResult,
            }),
          }),
        };
      },
    }),
  };
  return {
    get isSupabaseConfigured() {
      return mockSupabaseState.configured;
    },
    get supabase() {
      return mockSupabaseState.configured ? client : null;
    },
  };
});

import {
  deleteFaceRegistration,
  getStoredStudents,
  saveStoredStudents,
  submitFaceRegistration,
} from '@/features/faceRegistration/api';

const student = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Test Student',
  studentNumber: '123456789012',
  sectionId: '00000000-0000-4000-8000-000000000002',
  faceRegistrationStatus: 'registered' as const,
  lastRegisteredAt: '2026-10-01T00:00:00.000Z',
  photoUrl: 'front-photo',
  registeredPhotos: { front: 'front-photo', left: 'left-photo', right: 'right-photo' },
  faceDescriptors: [[0.1, 0.2, 0.3]],
  faceDescriptorVersion: 2,
};

const unregisteredStudent = {
  ...student,
  faceRegistrationStatus: 'unregistered' as const,
  faceDescriptors: undefined,
  faceDescriptorVersion: undefined,
  photoUrl: undefined,
  registeredPhotos: undefined,
};

describe('face registration persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSupabaseState.configured = true;
    mockSupabaseState.updatePayload = null;
    mockSupabaseState.updateCalls = 0;
    mockSupabaseState.updateResult = {
      data: { id: student.id },
      error: null,
    };
    saveStoredStudents([student]);
    vi.stubGlobal('Image', class {
      width = 640;
      height = 480;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    });
    const TestURL = class extends URL {};
    Object.assign(TestURL, {
      createObjectURL: () => 'blob:face-test',
      revokeObjectURL: () => undefined,
    });
    vi.stubGlobal('URL', TestURL);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ drawImage: vi.fn() }) as never
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clears cloud photos and descriptors before clearing local registration', async () => {
    await deleteFaceRegistration(student.id);

    expect(mockSupabaseState.updatePayload).toEqual({
      photo_urls: [],
      face_descriptors: null,
      face_descriptor_version: null,
    });
    const unregisteredStudent = getStoredStudents()[0];
    expect(unregisteredStudent?.faceRegistrationStatus).toBe('unregistered');
    expect(unregisteredStudent).not.toHaveProperty('faceDescriptors');
    expect(unregisteredStudent).not.toHaveProperty('faceDescriptorVersion');
    expect(unregisteredStudent).not.toHaveProperty('registeredPhotos');
  });

  it('keeps local registration intact when the cloud delete fails', async () => {
    mockSupabaseState.updateResult = {
      data: null,
      error: { message: 'permission denied' },
    };

    await expect(deleteFaceRegistration(student.id)).rejects.toThrow('Face registration was not deleted from Supabase');
    expect(getStoredStudents()[0]).toMatchObject({
      faceRegistrationStatus: 'registered',
      faceDescriptors: student.faceDescriptors,
      faceDescriptorVersion: student.faceDescriptorVersion,
    });
  });

  it('does not clear local registration when no cloud student row was updated', async () => {
    mockSupabaseState.updateResult = { data: null, error: null };

    await expect(deleteFaceRegistration(student.id)).rejects.toThrow('student record was not found or is not accessible');
    expect(getStoredStudents()[0]?.faceRegistrationStatus).toBe('registered');
  });

  it('keeps local-only registration available when Supabase is not configured', async () => {
    mockSupabaseState.configured = false;
    saveStoredStudents([unregisteredStudent]);

    await submitFaceRegistration({
      studentId: student.id,
      sectionId: student.sectionId,
      frames: [
        { angle: 'front', blob: new Blob(['front']) },
        { angle: 'left', blob: new Blob(['left']) },
        { angle: 'right', blob: new Blob(['right']) },
      ],
      consentConfirmed: true,
    });

    expect(mockSupabaseState.updateCalls).toBe(0);
    expect(getStoredStudents()[0]?.faceRegistrationStatus).toBe('registered');
  });

  it('saves photos and descriptors to the cloud before marking registration complete', async () => {
    saveStoredStudents([unregisteredStudent]);
    await submitFaceRegistration({
      studentId: student.id,
      sectionId: student.sectionId,
      frames: [
        { angle: 'front', blob: new Blob(['front']) },
        { angle: 'left', blob: new Blob(['left']) },
        { angle: 'right', blob: new Blob(['right']) },
      ],
      consentConfirmed: true,
      faceDescriptors: [[0.3, 0.4, 0.5]],
    });

    expect(mockSupabaseState.updateCalls).toBe(1);
    expect(mockSupabaseState.updatePayload).toMatchObject({
      photo_urls: [
        'data:image/jpeg;base64,test',
        'data:image/jpeg;base64,test',
        'data:image/jpeg;base64,test',
      ],
      face_descriptors: [[0.3, 0.4, 0.5]],
      face_descriptor_version: 2,
    });
    expect(getStoredStudents()[0]?.faceRegistrationStatus).toBe('registered');
  });

  it('does not mark registration complete or retry photos-only when cloud persistence fails', async () => {
    saveStoredStudents([unregisteredStudent]);
    mockSupabaseState.updateResult = {
      data: null,
      error: { message: 'permission denied' },
    };

    await expect(submitFaceRegistration({
      studentId: student.id,
      sectionId: student.sectionId,
      frames: [
        { angle: 'front', blob: new Blob(['front']) },
        { angle: 'left', blob: new Blob(['left']) },
        { angle: 'right', blob: new Blob(['right']) },
      ],
      consentConfirmed: true,
      faceDescriptors: [[0.3, 0.4, 0.5]],
    })).rejects.toThrow('Face registration could not be saved to Supabase');

    expect(mockSupabaseState.updateCalls).toBe(1);
    expect(getStoredStudents()[0]?.faceRegistrationStatus).toBe('unregistered');
  });

  it('requires descriptors for cloud registration', async () => {
    saveStoredStudents([unregisteredStudent]);
    await expect(submitFaceRegistration({
      studentId: student.id,
      sectionId: student.sectionId,
      frames: [
        { angle: 'front', blob: new Blob(['front']) },
        { angle: 'left', blob: new Blob(['left']) },
        { angle: 'right', blob: new Blob(['right']) },
      ],
      consentConfirmed: true,
    })).rejects.toThrow('Face descriptors are required');

    expect(mockSupabaseState.updateCalls).toBe(0);
    expect(getStoredStudents()[0]?.faceRegistrationStatus).toBe('unregistered');
  });
});
