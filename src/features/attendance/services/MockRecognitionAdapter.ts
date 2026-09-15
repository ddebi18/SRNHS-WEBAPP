import { RecognitionAdapter } from './RecognitionAdapter';
import { RecognitionEvent, EventType } from '@/types/domain.types';
import { getStoredStudents } from '@/features/faceRegistration/api';
import { mockNotificationAdapter } from '@/features/notifications/services/MockNotificationAdapter';

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

const STORAGE_KEY_EVENTS = 'srnhs_recognition_events_v2';

function deduplicateEvents(events: RecognitionEvent[]): RecognitionEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    // Enforce at most 1 entry and 1 exit per student per calendar date
    if (e.event_type === 'entry' || e.event_type === 'exit') {
      const dateStr = new Date(e.captured_at).toDateString();
      const id = e.student_id || e.student_lrn || e.student_name;
      const key = `${id}_${e.event_type}_${dateStr}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });
}

function loadStoredEvents(): RecognitionEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EVENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return deduplicateEvents(parsed);
    }
  } catch (e) {}
  return deduplicateEvents([...INITIAL_MOCK_EVENTS]);
}

function saveStoredEvents(events: RecognitionEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(deduplicateEvents(events).slice(0, 150)));
  } catch (e) {}
}

class MockRecognitionAdapterImpl implements RecognitionAdapter {
  private events: RecognitionEvent[] = loadStoredEvents();
  private listeners: Set<(event: RecognitionEvent) => void> = new Set();

  subscribeToEvents(callback: (event: RecognitionEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async getEvents(filters?: { studentId?: string; type?: EventType; limit?: number }): Promise<RecognitionEvent[]> {
    let result = deduplicateEvents([...this.events]);
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
    this.events = deduplicateEvents(this.events);
    saveStoredEvents(this.events);
    this.notifyListeners(newEvt);
    return newEvt;
  }

  async simulateScan(eventData: Partial<RecognitionEvent>): Promise<RecognitionEvent> {
    // Look up student from unified student database
    const allStudents = getStoredStudents();
    const student = allStudents.find(
      s => s.id === eventData.student_id || s.studentNumber === eventData.student_id || s.name.toLowerCase() === (eventData.student_name || '').toLowerCase()
    );

    const studentId = eventData.student_id || student?.id || `std-${Date.now()}`;
    const studentName = eventData.student_name || student?.name || 'Student';
    const studentLrn = eventData.student_lrn || student?.studentNumber || '109823456701';
    const studentPhoto = eventData.student_photo || student?.registeredPhotos?.front || student?.photoUrl;
    const sectionName = eventData.section_name || student?.sectionName || 'Grade 10 – Sampaguita';
    const guardianPhone = student?.guardianPhone || '+639171234567';
    const locationName = eventData.room_name || 'Main Gate Turnstile 01';
    const eventType = eventData.event_type || 'entry';
    const todayDateStr = new Date().toDateString();

    // ── Enforce 1 Time-In and 1 Time-Out per student per day ───────────
    // If student already has an entry or exit logged today, skip creating duplicate records and skip duplicate SMS
    if (eventType === 'entry' || eventType === 'exit') {
      const existingToday = this.events.find(e => {
        const isSameStudent = e.student_id === studentId ||
          (e.student_lrn && studentLrn && e.student_lrn === studentLrn) ||
          (e.student_name && studentName && e.student_name.toLowerCase() === studentName.toLowerCase());
        const isSameType = e.event_type === eventType;
        const isToday = new Date(e.captured_at).toDateString() === todayDateStr;
        return isSameStudent && isSameType && isToday;
      });

      if (existingToday) {
        return existingToday;
      }
    }

    const newEvt: RecognitionEvent = {
      id: `evt-sim-${Date.now()}`,
      student_id: studentId,
      student_name: studentName,
      student_lrn: studentLrn,
      student_photo: studentPhoto,
      section_name: sectionName,
      camera_id: eventData.camera_id,
      gate_id: eventData.gate_id,
      event_type: eventType,
      room_name: locationName,
      subject_title: eventData.subject_title,
      confidence_score: eventData.confidence_score ?? Number((0.95 + Math.random() * 0.048).toFixed(4)),
      source: eventData.source || 'camera',
      captured_at: new Date().toISOString(),
    };

    this.events.unshift(newEvt);
    this.events = deduplicateEvents(this.events);
    saveStoredEvents(this.events);
    this.notifyListeners(newEvt);

    // Automatically send real-time SMS notification to the student's guardian
    try {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const actionText = eventType === 'exit' ? 'exited campus via' : 'entered campus via';
      const smsType = eventType === 'exit' ? 'gate_exit' : 'gate_entry';

      mockNotificationAdapter.sendAlert({
        student_id: newEvt.student_id,
        student_name: studentName,
        guardian_phone: guardianPhone,
        message: `[SRNHS Alert] ${studentName} (LRN: ${studentLrn}) ${actionText} ${locationName} at ${timeStr}.`,
        event_type: smsType,
      }).catch(err => console.warn('SMS dispatch notice:', err));
    } catch (smsErr) {
      console.warn('SMS dispatch error:', smsErr);
    }

    return newEvt;
  }

  async logRecognitionEvent(eventData: {
    student_id: string;
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
  }): Promise<RecognitionEvent> {
    return this.simulateScan({
      student_id: eventData.student_id,
      student_name: eventData.student_name,
      student_lrn: eventData.student_lrn,
      student_photo: eventData.student_photo,
      section_name: eventData.section_name,
      event_type: eventData.event_type,
      camera_id: eventData.camera_id,
      gate_id: eventData.gate_id,
      room_name: eventData.room_name || 'Main Gate Turnstile 01',
      confidence_score: eventData.confidence_score,
    });
  }

  private notifyListeners(event: RecognitionEvent) {
    this.listeners.forEach(cb => {
      try {
        cb(event);
      } catch (err) {
        console.error('Error notifying event listener:', err);
      }
    });
  }
}

export const mockRecognitionAdapter = new MockRecognitionAdapterImpl();
