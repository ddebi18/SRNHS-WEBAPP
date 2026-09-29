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

      // Batch resolve signed URLs for private unidentified captures
      const signedUrlMap = new Map<string, string>();
      const capturePaths = (data || [])
        .map((r: any) => r.captured_image_path)
        .filter((p: any): p is string => Boolean(p));

      if (capturePaths.length > 0) {
        try {
          const { data: signedResults } = await supabase.storage
            .from('unidentified-captures')
            .createSignedUrls(capturePaths, 3600);
          signedResults?.forEach((item: any) => {
            if (item.path && item.signedUrl) {
              signedUrlMap.set(item.path, item.signedUrl);
            }
          });
        } catch (storageErr) {
          console.warn('[Supabase] Storage signed URL note:', storageErr);
        }
      }

      const dbEvents: RecognitionEvent[] = (data || []).map((row: any) => {
        const status = (row.status as RecognitionEvent['status']) || 'matched';
        let defaultName = 'Student';
        let defaultLrn = '';
        if (status === 'unidentified') {
          defaultName = 'Unidentified Individual';
          defaultLrn = 'Threshold Unmet';
        } else if (status === 'ambiguous') {
          defaultName = 'Ambiguous Match';
          defaultLrn = `${row.candidate_student_ids?.length || 2} Candidates`;
        }

        return {
          id: row.id,
          student_id: row.student_id,
          student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : defaultName,
          student_lrn: row.students?.lrn || defaultLrn,
          student_photo: row.students?.photo_urls?.[0],
          event_type: row.event_type,
          camera_id: 'cam-01',
          gate_id: row.gate || 'gate-01',
          room_name: row.rooms?.name || row.gate || 'Main Gate Turnstile',
          subject_title: row.subjects?.title,
          confidence_score: row.confidence_score ?? 0.95,
          top_similarity_score: row.top_similarity_score ?? row.confidence_score ?? 0.95,
          status,
          candidate_student_ids: row.candidate_student_ids || [],
          captured_image_path: row.captured_image_path,
          captured_image_url: row.captured_image_path ? (signedUrlMap.get(row.captured_image_path) || null) : null,
          detection_count: row.detection_count || 1,
          source: row.source || 'camera',
          captured_at: row.captured_at,
        };
      });

      // cloudOnly: return raw Supabase rows sorted by time, no local merge or dedup.
      if (filters?.cloudOnly) {
        return dbEvents;
      }

      // Default: merge cloud events with local events
      const mergedMap = new Map<string, RecognitionEvent>();
      localEvents.forEach(e => {
        const key = (e.status && e.status !== 'matched')
          ? `security_${e.id}`
          : `${e.student_id}_${e.event_type}_${new Date(e.captured_at).toDateString()}`;
        mergedMap.set(key, e);
      });
      dbEvents.forEach(e => {
        const key = (e.status && e.status !== 'matched')
          ? `security_${e.id}`
          : `${e.student_id}_${e.event_type}_${new Date(e.captured_at).toDateString()}`;
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
            status: 'matched',
            source: 'manual_override',
          });
      }
    } catch (err) {
      console.warn('Supabase manual event note:', err);
    }

    return localEvent;
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
    // 1. ALWAYS log to local adapter first (updates UI, logs to localStorage, sends SMS)
    const localEvent = await mockRecognitionAdapter.logRecognitionEvent(eventData);

    if (!supabase) return localEvent;

    try {
      const isSecurityEvent = eventData.status === 'unidentified' || eventData.status === 'ambiguous';
      const hasValidStudent = eventData.student_id && isValidUUID(eventData.student_id);

      if (hasValidStudent || isSecurityEvent) {
        const { error: insertErr } = await supabase
          .from('recognition_events')
          .insert({
            student_id: hasValidStudent ? eventData.student_id : null,
            event_type: eventData.event_type,
            room_id: (eventData.room_id && isValidUUID(eventData.room_id)) ? eventData.room_id : null,
            confidence_score: eventData.confidence_score,
            top_similarity_score: eventData.top_similarity_score ?? eventData.confidence_score,
            status: eventData.status || 'matched',
            candidate_student_ids: eventData.candidate_student_ids || [],
            captured_image_path: eventData.captured_image_path || null,
            gate: eventData.gate_id,
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

