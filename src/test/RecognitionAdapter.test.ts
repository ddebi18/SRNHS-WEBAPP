import { describe, it, expect } from 'vitest';
import { mockRecognitionAdapter } from '@/features/attendance/services/MockRecognitionAdapter';
import { getRecognitionStatusText } from '@/features/attendance/lib/recognitionStatus';

describe('MockRecognitionAdapter', () => {
  it('fetches recognition events array', async () => {
    const events = await mockRecognitionAdapter.getEvents();
    expect(Array.isArray(events)).toBe(true);
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
    ).toBe('Face detected · Unregistered person');
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
    ).toBe('Face detected · Analyzing identity…');
  });

  it('keeps waiting state until a face is detected', () => {
    expect(
      getRecognitionStatusText({
        matchedStudent: null,
        isLoading: false,
        isReady: true,
        isFaceDetected: false,
      })
    ).toBe('Ready · Waiting for face');
  });

  it('formats verified status text with student name and match percentage', () => {
    expect(
      getRecognitionStatusText({
        matchedStudent: { name: 'Sophia Nicole Reyes', confidence: 0.62 },
        isLoading: false,
        isReady: true,
        isFaceDetected: true,
      })
    ).toBe('Verified: Sophia Nicole Reyes (62% match)');
  });

  it('enforces 1 Time-In and 1 Time-Out per student per day without duplicate records', async () => {
    const testStudentId = 'std-daily-test-999';

    // 1st Time-In (Entry) scan
    const entry1 = await mockRecognitionAdapter.logRecognitionEvent({
      student_id: testStudentId,
      student_name: 'Daily Test Student',
      student_lrn: '109899999999',
      event_type: 'entry',
      camera_id: 'cam-01',
      gate_id: 'cam-01',
      confidence_score: 0.88,
    });

    // 2nd Time-In (Entry) scan on the same day (should NOT create a duplicate record)
    const entry2 = await mockRecognitionAdapter.logRecognitionEvent({
      student_id: testStudentId,
      student_name: 'Daily Test Student',
      student_lrn: '109899999999',
      event_type: 'entry',
      camera_id: 'cam-01',
      gate_id: 'cam-01',
      confidence_score: 0.89,
    });

    expect(entry2.id).toBe(entry1.id);

    // 1st Time-Out (Exit) scan on the same day (allowed: 1 time-out)
    const exit1 = await mockRecognitionAdapter.logRecognitionEvent({
      student_id: testStudentId,
      student_name: 'Daily Test Student',
      student_lrn: '109899999999',
      event_type: 'exit',
      camera_id: 'cam-01',
      gate_id: 'cam-01',
      confidence_score: 0.85,
    });

    expect(exit1.event_type).toBe('exit');
    expect(exit1.id).not.toBe(entry1.id);

    // 2nd Time-Out (Exit) scan on the same day (should NOT create duplicate exit record)
    const exit2 = await mockRecognitionAdapter.logRecognitionEvent({
      student_id: testStudentId,
      student_name: 'Daily Test Student',
      student_lrn: '109899999999',
      event_type: 'exit',
      camera_id: 'cam-01',
      gate_id: 'cam-01',
      confidence_score: 0.86,
    });

    expect(exit2.id).toBe(exit1.id);

    // Check all events for this student: exactly 1 entry and 1 exit for today
    const studentEvents = await mockRecognitionAdapter.getEvents({ studentId: testStudentId });
    const studentEntries = studentEvents.filter(e => e.event_type === 'entry');
    const studentExits = studentEvents.filter(e => e.event_type === 'exit');

    expect(studentEntries.length).toBe(1);
    expect(studentExits.length).toBe(1);
  });
});
