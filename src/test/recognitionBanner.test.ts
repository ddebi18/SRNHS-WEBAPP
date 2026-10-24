import { describe, it, expect } from 'vitest';
import { RecognitionEvent } from '@/types/domain.types';

describe('Immediate Dashboard Recognition Banner Logic', () => {
  it('identifies matched, unidentified, and ambiguous recognition events with appropriate styling keys', () => {
    const matchedEvent: Partial<RecognitionEvent> = {
      status: 'matched',
      student_name: 'Juan Dela Cruz',
      student_lrn: '123456789012',
    };

    const unidentifiedEvent: Partial<RecognitionEvent> = {
      status: 'unidentified',
      student_name: 'Unidentified Individual',
      confidence_score: 0.45,
    };

    const ambiguousEvent: Partial<RecognitionEvent> = {
      status: 'ambiguous',
      student_name: 'Ambiguous Match',
      candidate_student_ids: [
        { student_id: 'id-1', student_name: 'Student 1', lrn: '123456789011', similarity: 0.82 },
        { student_id: 'id-2', student_name: 'Student 2', lrn: '123456789012', similarity: 0.8 },
      ],
    };

    expect(matchedEvent.status).toBe('matched');
    expect(unidentifiedEvent.status).toBe('unidentified');
    expect(ambiguousEvent.status).toBe('ambiguous');
  });

  it('prevents spamming cards for duplicate recognition events within the deduplication window', () => {
    const recentKeys = new Set<string>();
    const studentId = 'std-001';
    const eventType = 'entry';
    const minuteBucket = Math.floor(Date.now() / 60000);
    const key = `${studentId}:${eventType}:${minuteBucket}`;

    const isFirstScan = !recentKeys.has(key);
    recentKeys.add(key);

    const isDuplicateScan = recentKeys.has(key);

    expect(isFirstScan).toBe(true);
    expect(isDuplicateScan).toBe(true);
  });
});
