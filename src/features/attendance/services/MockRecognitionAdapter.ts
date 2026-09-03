import { RecognitionAdapter } from './RecognitionAdapter';
import { RecognitionEvent, EventType } from '@/types/domain.types';

export const INITIAL_MOCK_EVENTS: RecognitionEvent[] = [
  {
    id: 'evt-001',
    student_id: 'std-101',
    student_name: 'Juan Carlos Garcia',
    student_lrn: '109823456701',
    student_photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    section_name: 'Grade 10 – Sampaguita',
    event_type: 'entry',
    room_name: 'Main Gate Turnstile 01',
    confidence_score: 0.9882,
    source: 'camera',
    captured_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: 'evt-002',
    student_id: 'std-102',
    student_name: 'Sophia Nicole Reyes',
    student_lrn: '109823456702',
    student_photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    section_name: 'Grade 10 – Sampaguita',
    event_type: 'entry',
    room_name: 'Main Gate Turnstile 01',
    confidence_score: 0.9654,
    source: 'camera',
    captured_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'evt-003',
    student_id: 'std-103',
    student_name: 'Angelo Gabriel Mendoza',
    student_lrn: '109823456703',
    student_photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    section_name: 'Grade 11 – STEM A',
    event_type: 'classroom_checkin',
    room_name: 'Building B – Room 201',
    subject_title: 'General Mathematics',
    confidence_score: 0.9912,
    source: 'camera',
    captured_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'evt-004',
    student_id: 'std-104',
    student_name: 'Samantha Claire Santos',
    student_lrn: '109823456704',
    student_photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    section_name: 'Grade 11 – STEM A',
    event_type: 'entry',
    room_name: 'Main Gate Turnstile 02',
    confidence_score: 0.9740,
    source: 'manual_override',
    captured_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

class MockRecognitionAdapterImpl implements RecognitionAdapter {
  private events: RecognitionEvent[] = [...INITIAL_MOCK_EVENTS];
  private listeners: Set<(event: RecognitionEvent) => void> = new Set();

  subscribeToEvents(callback: (event: RecognitionEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async getEvents(filters?: { studentId?: string; type?: EventType; limit?: number }): Promise<RecognitionEvent[]> {
    let result = [...this.events];
    if (filters?.studentId) {
      result = result.filter(e => e.student_id === filters.studentId);
    }
    if (filters?.type) {
      result = result.filter(e => e.event_type === filters.type);
    }
    result.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
    if (filters?.limit) {
      result = result.slice(0, filters.limit);
    }
    return result;
  }

  async logManualEvent(eventData: {
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
  }): Promise<RecognitionEvent> {
    const newEvt: RecognitionEvent = {
      id: `evt-${Date.now()}`,
      ...eventData,
      confidence_score: 1.0,
      source: 'manual_override',
      captured_at: new Date().toISOString(),
    };
    this.events.unshift(newEvt);
    this.notifyListeners(newEvt);
    return newEvt;
  }

  async simulateScan(eventData: Partial<RecognitionEvent>): Promise<RecognitionEvent> {
    const newEvt: RecognitionEvent = {
      id: `evt-sim-${Date.now()}`,
      student_id: eventData.student_id || 'std-101',
      student_name: eventData.student_name || 'Juan Carlos Garcia',
      student_lrn: eventData.student_lrn || '109823456701',
      student_photo: eventData.student_photo || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
      section_name: eventData.section_name || 'Grade 10 – Sampaguita',
      event_type: eventData.event_type || 'entry',
      room_name: eventData.room_name || 'Main Gate Turnstile 01',
      subject_title: eventData.subject_title,
      confidence_score: Number((0.95 + Math.random() * 0.048).toFixed(4)),
      source: 'camera',
      captured_at: new Date().toISOString(),
    };
    this.events.unshift(newEvt);
    this.notifyListeners(newEvt);
    return newEvt;
  }

  private notifyListeners(event: RecognitionEvent) {
    this.listeners.forEach(cb => cb(event));
  }
}

export const mockRecognitionAdapter = new MockRecognitionAdapterImpl();
