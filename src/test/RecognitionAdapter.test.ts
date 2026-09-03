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
});
