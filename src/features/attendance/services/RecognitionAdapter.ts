import { RecognitionEvent, EventType } from '@/types/domain.types';

export interface RecognitionAdapter {
  subscribeToEvents(callback: (event: RecognitionEvent) => void): () => void;
  getEvents(filters?: { studentId?: string; type?: EventType; limit?: number }): Promise<RecognitionEvent[]>;
  logManualEvent(eventData: {
    student_id: string;
    student_name: string;
    student_lrn: string;
    student_photo?: string;
    section_name?: string;
    event_type: EventType;
    room_id?: string;
    room_name?: string;
    subject_id?: string;
    subject_title?: string;
  }): Promise<RecognitionEvent>;
  logRecognitionEvent(eventData: {
    student_id: string;
    event_type: EventType;
    camera_id: string;
    gate_id: string;
    room_id?: string;
    room_name?: string;
    confidence_score: number;
  }): Promise<RecognitionEvent>;
  simulateScan(eventData: Partial<RecognitionEvent>): Promise<RecognitionEvent>;
}
