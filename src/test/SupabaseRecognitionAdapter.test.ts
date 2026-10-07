import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabaseState = vi.hoisted(() => ({
  insertPayload: null as Record<string, unknown> | null,
  insertError: null as { message: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      insert: async (payload: Record<string, unknown>) => {
        mockSupabaseState.insertPayload = payload;
        return { error: mockSupabaseState.insertError };
      },
    }),
  },
}));

import { mockRecognitionAdapter } from '@/features/attendance/services/MockRecognitionAdapter';
import { supabaseRecognitionAdapter } from '@/features/attendance/services/SupabaseRecognitionAdapter';

const localEvent = {
  id: 'local-event-1',
  student_id: '00000000-0000-4000-8000-000000000001',
  student_name: 'Test Student',
  student_lrn: '123456789012',
  event_type: 'entry' as const,
  camera_id: 'camera-01',
  gate_id: 'gate-01',
  confidence_score: 0.91,
  source: 'camera' as const,
  captured_at: '2026-10-07T00:00:00.000Z',
};

const eventData = {
  student_id: localEvent.student_id,
  student_name: localEvent.student_name,
  event_type: 'entry' as const,
  camera_id: localEvent.camera_id,
  gate_id: localEvent.gate_id,
  confidence_score: localEvent.confidence_score,
};

describe('SupabaseRecognitionAdapter gate logging', () => {
  beforeEach(() => {
    mockSupabaseState.insertPayload = null;
    mockSupabaseState.insertError = null;
    vi.spyOn(mockRecognitionAdapter, 'simulateScan').mockResolvedValue(localEvent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the schema-supported gate fields to recognition_events', async () => {
    await expect(supabaseRecognitionAdapter.logRecognitionEvent(eventData)).resolves.toEqual(localEvent);

    expect(mockSupabaseState.insertPayload).toEqual({
      student_id: eventData.student_id,
      event_type: eventData.event_type,
      camera_id: eventData.camera_id,
      gate_id: eventData.gate_id,
      room_id: null,
      confidence_score: eventData.confidence_score,
      source: 'camera',
    });
  });

  it('reports cloud authorization or persistence failures instead of returning success', async () => {
    mockSupabaseState.insertError = { message: 'new row violates row-level security policy' };

    await expect(supabaseRecognitionAdapter.logRecognitionEvent(eventData))
      .rejects.toThrow('Cloud gate log failed; the scan remains local only');
    expect(mockRecognitionAdapter.simulateScan).toHaveBeenCalledOnce();
  });

  it('does not silently treat a local-only student ID as a cloud gate log', async () => {
    await expect(supabaseRecognitionAdapter.logRecognitionEvent({
      ...eventData,
      student_id: 'local-student-id',
    })).rejects.toThrow('student has no valid cloud record ID');

    expect(mockSupabaseState.insertPayload).toBeNull();
  });
});
