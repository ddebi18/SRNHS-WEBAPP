import { NotificationAdapter } from './NotificationAdapter';
import { SmsNotification } from '@/types/domain.types';
import { supabase } from '@/lib/supabase';
import { mockNotificationAdapter } from './MockNotificationAdapter';

class SupabaseNotificationAdapterImpl implements NotificationAdapter {
  subscribeToSms(callback: (sms: SmsNotification) => void): () => void {
    const unsubMock = mockNotificationAdapter.subscribeToSms(callback);
    if (!supabase) return unsubMock;

    const channelId = `sms_notifications_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let channel: any = null;
    try {
      channel = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sms_notifications' },
          payload => {
            this.getSmsLogs(50).then(logs => {
              const hydrated = logs.find(log => log.id === payload.new.id);
              callback(hydrated || (payload.new as unknown as SmsNotification));
            });
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Supabase Realtime SMS subscription note:', e);
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

  async getSmsLogs(limit: number = 50): Promise<SmsNotification[]> {
    if (!supabase) return mockNotificationAdapter.getSmsLogs(limit);

    try {
      const { data, error } = await supabase
        .from('sms_notifications')
        .select(`
          id,
          student_id,
          guardian_phone,
          message,
          event_type,
          status,
          sent_at,
          students ( first_name, last_name, lrn )
        `)
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Supabase SMS fetch note, falling back to local:', error.message);
        return mockNotificationAdapter.getSmsLogs(limit);
      }

      return (data || []).map((row: any) => {
        const student = row.students;
        const student_name = student
          ? `${student.first_name || ''} ${student.last_name || ''}`.trim() || undefined
          : undefined;

        return {
          id: row.id,
          student_id: row.student_id,
          student_name,
          guardian_phone: row.guardian_phone || '—',
          message: row.message || '',
          event_type: row.event_type || 'gate_entry',
          status: (row.status as any) || 'sent',
          sent_at: row.sent_at || new Date().toISOString(),
        };
      });
    } catch (err) {
      console.warn('Supabase SMS exception, falling back to local:', err);
      return mockNotificationAdapter.getSmsLogs(limit);
    }
  }

  async sendAlert(data: {
    student_id: string;
    student_name: string;
    guardian_phone: string;
    message: string;
    event_type: 'gate_entry' | 'gate_exit' | 'unexcused_absence';
  }): Promise<SmsNotification> {
    if (!supabase) return mockNotificationAdapter.sendAlert(data);

    try {
      const { data: inserted, error } = await supabase
        .from('sms_notifications')
        .insert({
          student_id: data.student_id,
          guardian_phone: data.guardian_phone,
          message: data.message,
          event_type: data.event_type,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error || !inserted) {
        return mockNotificationAdapter.sendAlert(data);
      }

      return {
        id: inserted.id,
        student_id: inserted.student_id,
        student_name: data.student_name,
        guardian_phone: inserted.guardian_phone,
        message: inserted.message,
        event_type: inserted.event_type,
        status: inserted.status,
        sent_at: inserted.sent_at,
      };
    } catch {
      return mockNotificationAdapter.sendAlert(data);
    }
  }
}

export const supabaseNotificationAdapter = new SupabaseNotificationAdapterImpl();
