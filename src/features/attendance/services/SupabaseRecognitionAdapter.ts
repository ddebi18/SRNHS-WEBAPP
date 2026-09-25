import { RecognitionAdapter } from './RecognitionAdapter';
import { RecognitionEvent, EventType } from '@/types/domain.types';
import { supabase } from '@/lib/supabase';
import { mockRecognitionAdapter } from './MockRecognitionAdapter';
import { isValidUUID } from '@/features/faceRegistration/api';

class SupabaseRecognitionAdapterImpl implements RecognitionAdapter {
  subscribeToEvents(callback: (event: RecognitionEvent) => void): () => void {
    // Always subscribe to local/mock adapter events so webcam and turnstile scans notify UI immediately
    const unsubMock = mockRecognitionAdapter.subscribeToEvents(callback);

    if (!supabase) return unsubMock;

    const channelId = `recognition_events_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let channel: any = null;
    try {
      channel = supabase
        .channel(channelId)
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
    } catch (e) {
      console.warn('Supabase Realtime subscription note:', e);
    }

    return () => {
      unsubMock();
      if (supabase && channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }

  async getEvents(filters?: { studentId?: string; type?: EventType; limit?: number; cloudOnly?: boolean }): Promise<RecognitionEvent[]> {
    // cloudOnly=true: skip localStorage entirely and return all Supabase rows unfiltered.
    // Used by the admin gate log so scans from every device are visible.
    const localEvents = filters?.cloudOnly ? [] : await mockRecognitionAdapter.getEvents(filters);
    if (!supabase) return localEvents;

    try {
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
        console.warn('Supabase fetch error, falling back to local events:', error.message);
        return localEvents;
      }

      const dbEvents: RecognitionEvent[] = (data || []).map((row: any) => ({
        id: row.id,
        student_id: row.student_id,
        student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : 'Student',
        student_lrn: row.students?.lrn || '',
        student_photo: row.students?.photo_urls?.[0],
        event_type: row.event_type,
        camera_id: 'cam-01',
        gate_id: 'gate-01',
        room_name: row.rooms?.name || 'Main Gate Turnstile',
        subject_title: row.subjects?.title,
        confidence_score: row.confidence_score ?? 0.95,
        source: row.source || 'camera',
        captured_at: row.captured_at,
      }));

      // cloudOnly: return raw Supabase rows sorted by time, no local merge or dedup.
      if (filters?.cloudOnly) {
        return dbEvents;
      }

      // Default: merge cloud events with local events, deduplicated by student + type + date
      const mergedMap = new Map<string, RecognitionEvent>();
      localEvents.forEach(e => {
        const dateStr = new Date(e.captured_at).toDateString();
        const key = `${e.student_id}_${e.event_type}_${dateStr}`;
        mergedMap.set(key, e);
      });
      dbEvents.forEach(e => {
        const dateStr = new Date(e.captured_at).toDateString();
        const key = `${e.student_id}_${e.event_type}_${dateStr}`;
        // If local already exists, prefer local (which has high-res photos and rich section names)
        if (!mergedMap.has(key)) {
          mergedMap.set(key, e);
        }
      });

      const mergedList = Array.from(mergedMap.values());
      mergedList.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
      return filters?.limit ? mergedList.slice(0, filters.limit) : mergedList;
    } catch (err) {
      console.warn('Supabase network error, fallback to local events:', err);
      return localEvents;
    }
  }

  async logManualEvent(eventData: Parameters<RecognitionAdapter['logManualEvent']>[0]): Promise<RecognitionEvent> {
    const localEvent = await mockRecognitionAdapter.logManualEvent(eventData);

    if (!supabase) return localEvent;

    try {
      if (isValidUUID(eventData.student_id)) {
        await supabase
          .from('recognition_events')
          .insert({
            student_id: eventData.student_id,
            event_type: eventData.event_type,
            room_id: (eventData.room_id && isValidUUID(eventData.room_id)) ? eventData.room_id : null,
            subject_id: (eventData.subject_id && isValidUUID(eventData.subject_id)) ? eventData.subject_id : null,
            confidence_score: 1.0,
            source: 'manual_override',
          });
      }
    } catch (err) {
      console.warn('Supabase manual event note:', err);
    }

    return localEvent;
  }

  async simulateScan(eventData: Partial<RecognitionEvent>): Promise<RecognitionEvent> {
    return mockRecognitionAdapter.simulateScan(eventData);
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
    // 1. ALWAYS log to local adapter first (updates UI, logs to localStorage, sends SMS)
    const localEvent = await mockRecognitionAdapter.simulateScan(eventData);

    if (!supabase) return localEvent;

    try {
      // 2. If student_id is a valid UUID, persist to Supabase recognition_events
      if (isValidUUID(eventData.student_id)) {
        const { error: insertErr } = await supabase
          .from('recognition_events')
          .insert({
            student_id: eventData.student_id,
            event_type: eventData.event_type,
            room_id: (eventData.room_id && isValidUUID(eventData.room_id)) ? eventData.room_id : null,
            confidence_score: eventData.confidence_score,
            source: 'camera',
          });

        if (insertErr) {
          console.warn('[Supabase] recognition_events insert note (using local event):', insertErr.message);
        } else {
          console.log('[Supabase] ✓ Recognition event recorded in cloud');
        }
      }
    } catch (err) {
      console.warn('[Supabase] recognition_events network note:', err);
    }

    return localEvent;
  }
}

export const supabaseRecognitionAdapter = new SupabaseRecognitionAdapterImpl();

