import { NotificationAdapter } from './NotificationAdapter';
import { SmsNotification } from '@/types/domain.types';

export const INITIAL_MOCK_SMS: SmsNotification[] = [];

class MockNotificationAdapterImpl implements NotificationAdapter {
  private logs: SmsNotification[] = [];
  private listeners: Set<(sms: SmsNotification) => void> = new Set();

  subscribeToSms(callback: (sms: SmsNotification) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async getSmsLogs(limit: number = 50): Promise<SmsNotification[]> {
    return [...this.logs].slice(0, limit);
  }

  async sendAlert(data: {
    student_id: string;
    student_name: string;
    guardian_phone: string;
    message: string;
    event_type: 'gate_entry' | 'gate_exit' | 'unexcused_absence';
  }): Promise<SmsNotification> {
    const newLog: SmsNotification = {
      id: `sms-${Date.now()}`,
      student_id: data.student_id,
      student_name: data.student_name,
      guardian_phone: data.guardian_phone,
      message: data.message,
      event_type: data.event_type,
      status: 'sent',
      sent_at: new Date().toISOString(),
    };
    this.logs.unshift(newLog);
    this.notifyListeners(newLog);
    return newLog;
  }

  private notifyListeners(sms: SmsNotification) {
    this.listeners.forEach(cb => cb(sms));
  }
}

export const mockNotificationAdapter = new MockNotificationAdapterImpl();
