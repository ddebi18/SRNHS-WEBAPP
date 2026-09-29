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
    student_id?: string | null;
    student_name?: string;
    student_lrn?: string;
    student_photo?: string;
    section_name?: string;
    event_type: EventType;
    camera_id: string;
    gate_id: string;
    room_id?: string;
    room_name?: string;
    confidence_score: number;
    status?: RecognitionEvent['status'];
    top_similarity_score?: number;
    candidate_student_ids?: RecognitionEvent['candidate_student_ids'];
    captured_image_path?: string | null;
  }): Promise<RecognitionEvent>;
}
