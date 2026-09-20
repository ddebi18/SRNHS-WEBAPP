import { NotificationAdapter } from './NotificationAdapter';
import { SmsNotification } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface PhilSmsConfig {
  apiToken: string;
  senderId?: string;
  endpoint?: string;
}

/**
 * PhilSmsAdapter
 * Integrates directly with the PhilSMS REST API (v3) to dispatch cellular SMS
 * attendance notifications to Philippine parent/guardian mobile numbers.
 * Conforms to R.A. 10173 and thesis specifications.
 */
export class PhilSmsAdapter implements NotificationAdapter {
  private apiToken: string;
  private senderId: string;
  private endpoint: string;
  private listeners: Set<(sms: SmsNotification) => void> = new Set();
  private localLogs: SmsNotification[] = [];

  constructor(config?: Partial<PhilSmsConfig>) {
    this.apiToken = config?.apiToken || (import.meta.env.VITE_PHILSMS_API_TOKEN as string) || '';
    this.senderId = config?.senderId || (import.meta.env.VITE_PHILSMS_SENDER_ID as string) || 'PhilSMS';
    this.endpoint = config?.endpoint || (import.meta.env.VITE_PHILSMS_ENDPOINT as string) || 'https://app.philsms.com/api/v3/sms/send';
  }

  subscribeToSms(callback: (sms: SmsNotification) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async getSmsLogs(limit: number = 50): Promise<SmsNotification[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('sms_notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data) {
          return data.map((row: any) => ({
            id: row.id,
            student_id: row.student_id,
            student_name: row.student_name || 'Student',
            guardian_phone: row.phone_number || row.guardian_phone || '',
            message: row.message,
            event_type: row.event_type || 'gate_entry',
            status: row.status || 'sent',
            sent_at: row.sent_at || row.created_at,
          }));
        }
      } catch (err) {
        console.warn('[PhilSMS] Supabase fetch fallback to memory:', err);
      }
    }
    return [...this.localLogs].slice(0, limit);
  }

  /**
   * Dispatches an SMS alert via the PhilSMS REST API.
   * If no API token is configured in local development, simulates success and logs.
   */
  async sendAlert(data: {
    student_id: string;
    student_name: string;
    guardian_phone: string;
    message: string;
    event_type: 'gate_entry' | 'gate_exit' | 'unexcused_absence';
  }): Promise<SmsNotification> {
    const formattedPhone = this.formatPhilippineNumber(data.guardian_phone);
    const notificationId = `philsms-${Date.now()}`;
    let deliveryStatus: 'sent' | 'failed' = 'sent';

    if (this.apiToken && this.apiToken.trim() !== '') {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiToken}`,
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            recipient: formattedPhone,
            sender_id: this.senderId,
            type: 'plain',
            message: data.message,
          }),
        });

        if (!response.ok) {
          console.error(`[PhilSMS] HTTP ${response.status} from gateway:`, await response.text());
          deliveryStatus = 'failed';
        } else {
          const resJson = await response.json();
          console.log('[PhilSMS] Gateway dispatch success:', resJson);
        }
      } catch (networkErr) {
        console.error('[PhilSMS] Network error reaching gateway:', networkErr);
        deliveryStatus = 'failed';
      }
    } else {
      console.log(`[PhilSMS Simulation] Token not provided. Simulating dispatch to ${formattedPhone}: "${data.message}"`);
    }

    const logEntry: SmsNotification = {
      id: notificationId,
      student_id: data.student_id,
      student_name: data.student_name,
      guardian_phone: formattedPhone,
      message: data.message,
      event_type: data.event_type,
      status: deliveryStatus,
      sent_at: new Date().toISOString(),
    };

    this.localLogs.unshift(logEntry);
    this.notifyListeners(logEntry);

    // Persist to Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('sms_notifications').insert({
          id: notificationId,
          student_id: data.student_id,
          phone_number: formattedPhone,
          message: data.message,
          status: deliveryStatus,
          sent_at: new Date().toISOString(),
        });
      } catch (dbErr) {
        console.warn('[PhilSMS] DB logging notice:', dbErr);
      }
    }

    return logEntry;
  }

  private notifyListeners(sms: SmsNotification) {
    this.listeners.forEach(cb => {
      try {
        cb(sms);
      } catch (err) {
        console.error('[PhilSMS] Listener error:', err);
      }
    });
  }

  /**
   * Normalizes Philippine numbers (e.g., 09171234567, 9171234567, +639171234567)
   * into standard international format (+639171234567) or 639171234567.
   */
  private formatPhilippineNumber(phone: string): string {
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('63') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    if (cleaned.startsWith('09') && cleaned.length === 11) {
      return `+63${cleaned.slice(1)}`;
    }
    if (cleaned.startsWith('9') && cleaned.length === 10) {
      return `+63${cleaned}`;
    }
    return phone;
  }
}

export const philSmsAdapter = new PhilSmsAdapter();
