import { describe, it, expect } from 'vitest';
import { mockRecognitionAdapter } from '@/features/attendance/services/MockRecognitionAdapter';

describe('MockRecognitionAdapter', () => {
  it('fetches initial mock recognition events', async () => {
    const events = await mockRecognitionAdapter.getEvents();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty('student_name');
    expect(events[0]).toHaveProperty('confidence_score');
  });

  it('triggers and subscribes to live recognition scan events', async () => {
    let capturedEvent: any = null;
    const unsubscribe = mockRecognitionAdapter.subscribeToEvents(evt => {
      capturedEvent = evt;
    });

    await mockRecognitionAdapter.simulateScan({
      student_name: 'Test Student',
      student_lrn: '100000000001',
      event_type: 'entry',
    });

    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent.student_name).toBe('Test Student');
    expect(capturedEvent.source).toBe('camera');

    unsubscribe();
  });

  it('preserves camera direction, identity, and confidence for recognition events', async () => {
    const event = await mockRecognitionAdapter.logRecognitionEvent({
      student_id: 'std-test',
      event_type: 'exit',
      camera_id: 'cam-02',
      gate_id: 'gate-02',
      confidence_score: 0.82,
    });

    expect(event.event_type).toBe('exit');
    expect(event.camera_id).toBe('cam-02');
    expect(event.gate_id).toBe('gate-02');
    expect(event.confidence_score).toBe(0.82);
    expect(event.source).toBe('camera');
  });
});
