import { RecognitionAdapter } from './RecognitionAdapter';
import { RecognitionEvent, EventType } from '@/types/domain.types';
import { supabase } from '@/lib/supabase';
import { mockRecognitionAdapter } from './MockRecognitionAdapter';

class SupabaseRecognitionAdapterImpl implements RecognitionAdapter {
  subscribeToEvents(callback: (event: RecognitionEvent) => void): () => void {
    if (!supabase) return mockRecognitionAdapter.subscribeToEvents(callback);

    const channel = supabase
      .channel('public:recognition_events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'recognition_events' },
        payload => {
          this.getEvents({ limit: 50 }).then(events => {
            const hydratedEvent = events.find(event => event.id === payload.new.id);
            callback(hydratedEvent || payload.new as RecognitionEvent);
          });
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }

  async getEvents(filters?: { studentId?: string; type?: EventType; limit?: number }): Promise<RecognitionEvent[]> {
    if (!supabase) return mockRecognitionAdapter.getEvents(filters);

    let query = supabase.from('recognition_events').select(`
      *,
      students ( first_name, last_name, lrn, photo_urls, section_id ),
      rooms ( name ),
      subjects ( title )
    `);

    if (filters?.studentId) query = query.eq('student_id', filters.studentId);
    if (filters?.type) query = query.eq('event_type', filters.type);

    query = query.order('captured_at', { ascending: false });
    if (filters?.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    if (error) {
      console.warn('Supabase fetch error, falling back to mock:', error);
      return mockRecognitionAdapter.getEvents(filters);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      student_id: row.student_id,
      student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : 'Unknown Student',
      student_lrn: row.students?.lrn,
      student_photo: row.students?.photo_urls?.[0],
      event_type: row.event_type,
      camera_id: row.camera_id,
      gate_id: row.gate_id,
      room_name: row.rooms?.name,
      subject_title: row.subjects?.title,
      confidence_score: row.confidence_score,
      source: row.source,
      captured_at: row.captured_at,
    }));
  }

  async logManualEvent(eventData: Parameters<RecognitionAdapter['logManualEvent']>[0]): Promise<RecognitionEvent> {
    if (!supabase) return mockRecognitionAdapter.logManualEvent(eventData);

    const { data, error } = await supabase
      .from('recognition_events')
      .insert({
        student_id: eventData.student_id,
        event_type: eventData.event_type,
        room_id: eventData.room_id || null,
        subject_id: eventData.subject_id || null,
        confidence_score: 1.0,
        source: 'manual_override',
      })
      .select()
      .single();

    if (error) {
      console.warn('Supabase manual event log error, using mock:', error);
      return mockRecognitionAdapter.logManualEvent(eventData);
    }

    return data as RecognitionEvent;
  }

  async simulateScan(eventData: Partial<RecognitionEvent>): Promise<RecognitionEvent> {
    return mockRecognitionAdapter.simulateScan(eventData);
  }

  async logRecognitionEvent(eventData: {
    student_id: string;
    event_type: EventType;
    camera_id: string;
    gate_id: string;
    room_id?: string;
    room_name?: string;
    confidence_score: number;
  }): Promise<RecognitionEvent> {
    if (!supabase) return mockRecognitionAdapter.logRecognitionEvent(eventData);

    const { data, error } = await supabase
      .from('recognition_events')
      .insert({
        student_id: eventData.student_id,
        event_type: eventData.event_type,
        camera_id: eventData.camera_id,
        gate_id: eventData.gate_id,
        room_id: eventData.room_id || null,
        confidence_score: eventData.confidence_score,
        source: 'camera',
      })
      .select()
      .single();

    if (error) {
      console.warn('Supabase recognition event error, using mock:', error);
      return mockRecognitionAdapter.logRecognitionEvent(eventData);
    }

    return data as RecognitionEvent;
  }
}

export const supabaseRecognitionAdapter = new SupabaseRecognitionAdapterImpl();
