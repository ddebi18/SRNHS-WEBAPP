import { NotificationAdapter } from './NotificationAdapter';
import { SmsNotification } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * AndroidSmsGatewayAdapter
 *
 * Sends real SMS via an Android phone running the open-source
 * "Android SMS Gateway" app (https://github.com/capcom6/android-sms-gateway).
 *
 * The phone acts as an HTTP → cellular SMS relay:
 *   Vercel app  →  POST /3rdparty/v1/message  →  Android phone  →  Guardian SIM
 *
 * Setup:
 *   1. Install "SMS Gateway for Android" from Play Store (free, open-source)
 *      https://play.google.com/store/apps/details?id=me.capcom6.smsgateway
 *   2. Open the app → tap "Local server" → note the URL (e.g. http://192.168.1.5:8080)
 *   3. Set a username + password in the app settings
 *   4. (For Vercel) Install ngrok on the phone or use the app's cloud relay:
 *      - App has a built-in cloud relay: enable "Use cloud server" in the app
 *      - Cloud relay URL format: https://sms.capcom.me
 *      - Or install ngrok: ngrok http 8080  → get a public https URL
 *   5. Set env vars in Vercel:
 *      VITE_ANDROID_GATEWAY_URL   = https://your-ngrok-url.ngrok-free.app
 *                                   (or https://sms.capcom.me for built-in cloud)
 *      VITE_ANDROID_GATEWAY_USER  = your chosen username
 *      VITE_ANDROID_GATEWAY_PASS  = your chosen password
 */
export class AndroidSmsGatewayAdapter implements NotificationAdapter {
  private baseUrl: string;
  private username: string;
  private password: string;
  private listeners: Set<(sms: SmsNotification) => void> = new Set();
  private localLogs: SmsNotification[] = [];

  constructor() {
    // Trim trailing slash so endpoint paths always work
    this.baseUrl = (import.meta.env.VITE_ANDROID_GATEWAY_URL as string || '').replace(/\/$/, '');
    this.username = import.meta.env.VITE_ANDROID_GATEWAY_USER as string || 'admin';
    this.password = import.meta.env.VITE_ANDROID_GATEWAY_PASS as string || '';
  }

  subscribeToSms(callback: (sms: SmsNotification) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async getSmsLogs(limit = 50): Promise<SmsNotification[]> {
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
      } catch {}
    }
    return [...this.localLogs].slice(0, limit);
  }

  async sendAlert(data: {
    student_id: string;
    student_name: string;
    guardian_phone: string;
    message: string;
    event_type: 'gate_entry' | 'gate_exit' | 'unexcused_absence';
  }): Promise<SmsNotification> {
    const notificationId = `android-gw-${Date.now()}`;
    let deliveryStatus: 'sent' | 'failed' = 'sent';

    if (!this.baseUrl && !import.meta.env.VITE_TEXTBEE_API_KEY && !import.meta.env.VITE_INFINIREACH_API_KEY && !import.meta.env.VITE_ANDROID_GATEWAY_API_KEY) {
      // No gateway URL configured — simulate for dev
      console.log(`[AndroidGateway] No gateway URL/Key set. Simulating SMS to ${data.guardian_phone}: "${data.message}"`);
    } else {
      try {
        const isTextBee = !!import.meta.env.VITE_TEXTBEE_API_KEY;
        const isInfinireach = this.baseUrl.includes('infinireach') || !!import.meta.env.VITE_INFINIREACH_API_KEY || !!import.meta.env.VITE_ANDROID_GATEWAY_API_KEY;

        if (isTextBee) {
          const apiKey = import.meta.env.VITE_TEXTBEE_API_KEY as string;
          const deviceId = import.meta.env.VITE_TEXTBEE_DEVICE_ID as string | undefined;

          const payload: Record<string, any> = {
            recipients: [this.formatPhilippineNumber(data.guardian_phone)],
            message: data.message,
          };
          if (deviceId) {
            payload.deviceId = deviceId;
          }

          const response = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errBody = await response.text();
            console.error(`[TextBee] HTTP ${response.status}:`, errBody);
            deliveryStatus = 'failed';
          } else {
            const resJson = await response.json().catch(() => ({}));
            console.log('[TextBee] SMS dispatched successfully:', resJson);
          }
        } else if (isInfinireach) {
          const apiKey = import.meta.env.VITE_INFINIREACH_API_KEY || import.meta.env.VITE_ANDROID_GATEWAY_API_KEY || this.password || this.username;
          const endpoint = this.baseUrl.startsWith('http') ? `${this.baseUrl}/api/v1/messages` : 'https://api.infinireach.io/api/v1/messages';
          const senderPhone = import.meta.env.VITE_INFINIREACH_SENDER || import.meta.env.VITE_ANDROID_GATEWAY_SENDER || undefined;

          const payload: Record<string, any> = {
            to: this.formatPhilippineNumber(data.guardian_phone),
            message: data.message,
            channel: 'sms',
          };
          if (senderPhone) {
            payload.from = this.formatPhilippineNumber(senderPhone);
          }

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errBody = await response.text();
            console.error(`[InfiniReach] HTTP ${response.status}:`, errBody);
            deliveryStatus = 'failed';
          } else {
            const resJson = await response.json().catch(() => ({}));
            console.log('[InfiniReach] SMS dispatched successfully:', resJson);
          }
        } else {
          // Standard Capcom6 Android SMS Gateway
          const credentials = btoa(`${this.username}:${this.password}`);
          const response = await fetch(`${this.baseUrl}/3rdparty/v1/message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${credentials}`,
            },
            body: JSON.stringify({
              message: data.message,
              phoneNumbers: [this.formatPhilippineNumber(data.guardian_phone)],
            }),
          });

          if (!response.ok) {
            const errBody = await response.text();
            console.error(`[AndroidGateway] HTTP ${response.status}:`, errBody);
            deliveryStatus = 'failed';
          } else {
            const resJson = await response.json().catch(() => ({}));
            console.log('[AndroidGateway] SMS dispatched successfully:', resJson);
          }
        }
      } catch (networkErr) {
        console.error('[AndroidGateway] Network error — is the gateway reachable?', networkErr);
        deliveryStatus = 'failed';
      }
    }

    const logEntry: SmsNotification = {
      id: notificationId,
      student_id: data.student_id,
      student_name: data.student_name,
      guardian_phone: data.guardian_phone,
      message: data.message,
      event_type: data.event_type,
      status: deliveryStatus,
      sent_at: new Date().toISOString(),
    };

    this.localLogs.unshift(logEntry);
    this.listeners.forEach(cb => { try { cb(logEntry); } catch {} });

    // Persist to Supabase audit log
    if (isSupabaseConfigured && supabase) {
      supabase.from('sms_notifications').insert({
        id: notificationId,
        student_id: data.student_id,
        phone_number: data.guardian_phone,
        message: data.message,
        status: deliveryStatus,
        sent_at: logEntry.sent_at,
      }).then(({ error }) => {
        if (error) console.warn('[AndroidGateway] DB log notice:', error.message);
      });
    }

    return logEntry;
  }

  /** Normalize PH numbers to +639XXXXXXXXX */
  private formatPhilippineNumber(phone: string): string {
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('63') && cleaned.length === 12) return `+${cleaned}`;
    if (cleaned.startsWith('09') && cleaned.length === 11) return `+63${cleaned.slice(1)}`;
    if (cleaned.startsWith('9') && cleaned.length === 10) return `+63${cleaned}`;
    return phone;
  }
}

export const androidSmsGatewayAdapter = new AndroidSmsGatewayAdapter();
