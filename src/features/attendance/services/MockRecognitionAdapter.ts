import { RecognitionAdapter } from './RecognitionAdapter';
import { RecognitionEvent, EventType } from '@/types/domain.types';
import { getStoredStudents } from '@/features/faceRegistration/api';
import { activeNotificationAdapter } from '@/features/notifications/services';

export const INITIAL_MOCK_EVENTS: RecognitionEvent[] = [];

const STORAGE_KEY_EVENTS = 'srnhs_recognition_events_v2';

function deduplicateEvents(events: RecognitionEvent[]): RecognitionEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    // Unidentified and ambiguous events are security logs and should not be collapsed by student ID
    if (e.status === 'unidentified' || e.status === 'ambiguous') {
      return true;
    }
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        const realEvents = parsed.filter((e: RecognitionEvent) =>
          !e.id.startsWith('evt-00') &&
          !e.student_id?.startsWith('std-10') &&
          !e.student_photo?.includes('unsplash.com')
        );
        if (realEvents.length !== parsed.length) {
          saveStoredEvents(realEvents);
        }
        return deduplicateEvents(realEvents);
      }
    }
  } catch (e) {}
  return [];
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

  private async recordEvent(eventData: Partial<RecognitionEvent>): Promise<RecognitionEvent> {
    const status = eventData.status || 'matched';
    const isUnidentifiedOrAmbiguous = status === 'unidentified' || status === 'ambiguous';

    // Look up student from unified student database if not unidentified/ambiguous
    const allStudents = isUnidentifiedOrAmbiguous ? [] : getStoredStudents();
    const student = allStudents.find(
      s => s.id === eventData.student_id || s.studentNumber === eventData.student_id || s.name.toLowerCase() === (eventData.student_name || '').toLowerCase()
    );

    const studentId = isUnidentifiedOrAmbiguous ? null : (eventData.student_id || student?.id || `std-${Date.now()}`);
    let studentName = eventData.student_name || student?.name || 'Student';
    let studentLrn = eventData.student_lrn || student?.studentNumber || '109823456701';
    let studentPhoto = isUnidentifiedOrAmbiguous ? undefined : (eventData.student_photo || student?.registeredPhotos?.front || student?.photoUrl);
    let sectionName = isUnidentifiedOrAmbiguous ? '—' : (eventData.section_name || student?.sectionName || 'Grade 10 – Sampaguita');

    if (status === 'unidentified') {
      studentName = 'Unidentified Individual';
      studentLrn = 'Threshold Unmet';
    } else if (status === 'ambiguous') {
      studentName = 'Ambiguous Match';
      studentLrn = `${eventData.candidate_student_ids?.length || 2} Candidates`;
    }

    const guardianPhone = student?.guardianPhone || '+639171234567';
    const locationName = eventData.room_name || 'Main Gate Turnstile 01';
    const eventType = eventData.event_type || 'entry';
    const todayDateStr = new Date().toDateString();

    // ── Enforce 1 Time-In and 1 Time-Out per student per day (only for matched events) ───────────
    if (!isUnidentifiedOrAmbiguous && (eventType === 'entry' || eventType === 'exit')) {
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
      id: `evt-sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      confidence_score: eventData.confidence_score ?? (isUnidentifiedOrAmbiguous ? 0.42 : Number((0.95 + Math.random() * 0.048).toFixed(4))),
      top_similarity_score: eventData.top_similarity_score ?? (isUnidentifiedOrAmbiguous ? 0.42 : 0.95),
      status,
      candidate_student_ids: eventData.candidate_student_ids,
      captured_image_path: eventData.captured_image_path,
      captured_image_url: eventData.captured_image_url,
      source: eventData.source || 'camera',
      captured_at: new Date().toISOString(),
    };

    this.events.unshift(newEvt);
    this.events = deduplicateEvents(this.events);
    saveStoredEvents(this.events);
    this.notifyListeners(newEvt);

    // Automatically send real-time SMS notification ONLY for matched students (Never for unidentified/ambiguous)
    if (!isUnidentifiedOrAmbiguous) {
      try {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const actionText = eventType === 'exit' ? 'exited campus via' : 'entered campus via';
        const smsType = eventType === 'exit' ? 'gate_exit' : 'gate_entry';

        activeNotificationAdapter.sendAlert({
          student_id: newEvt.student_id || '',
          student_name: studentName,
          guardian_phone: guardianPhone,
          message: `[SRNHS] ${studentName} (LRN: ${studentLrn}) ${actionText} ${locationName} at ${timeStr}. - San Roque National High School`,
          event_type: smsType,
        }).catch(err => console.warn('SMS dispatch notice:', err));
      } catch (smsErr) {
        console.warn('SMS dispatch error:', smsErr);
      }
    }

    return newEvt;
  }

  async logRecognitionEvent(eventData: {
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
  }): Promise<RecognitionEvent> {
    return this.recordEvent(eventData);
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
