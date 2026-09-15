import { describe, it, expect } from 'vitest';
import { mockRecognitionAdapter } from '@/features/attendance/services/MockRecognitionAdapter';
import { getRecognitionStatusText } from '@/features/attendance/lib/recognitionStatus';

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
      student_name: 'Mark Student',
      student_lrn: '109823456789',
      event_type: 'exit',
      camera_id: 'cam-02',
      gate_id: 'gate-02',
      confidence_score: 0.82,
    });

    expect(event.event_type).toBe('exit');
    expect(event.student_name).toBe('Mark Student');
    expect(event.student_lrn).toBe('109823456789');
    expect(event.camera_id).toBe('cam-02');
    expect(event.gate_id).toBe('gate-02');
    expect(event.confidence_score).toBe(0.82);
    expect(event.source).toBe('camera');

    // Verify it appears in getEvents()
    const allEvents = await mockRecognitionAdapter.getEvents();
    const found = allEvents.find(e => e.id === event.id);
    expect(found).toBeDefined();
    expect(found?.student_name).toBe('Mark Student');
    expect(found?.event_type).toBe('exit');
  });

  it('shows unknown when a detected face is not registered and analysis completed', () => {
    expect(
      getRecognitionStatusText({
        matchedStudent: null,
        isLoading: false,
        isReady: true,
        isFaceDetected: true,
        isAnalyzing: false,
      })
    ).toBe('Face detected: Unknown');
  });

  it('shows detecting while a detected face is still being analyzed', () => {
    expect(
      getRecognitionStatusText({
        matchedStudent: null,
        isLoading: false,
        isReady: true,
        isFaceDetected: true,
        isAnalyzing: true,
      })
    ).toBe('Face detected: Detecting...');
  });

  it('keeps waiting state until a face is detected', () => {
    expect(
      getRecognitionStatusText({
        matchedStudent: null,
        isLoading: false,
        isReady: true,
        isFaceDetected: false,
      })
    ).toBe('Face Detection: Waiting');
  });
});
