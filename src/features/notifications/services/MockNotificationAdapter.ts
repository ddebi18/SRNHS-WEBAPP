import { NotificationAdapter } from './NotificationAdapter';
import { SmsNotification } from '@/types/domain.types';

export const INITIAL_MOCK_SMS: SmsNotification[] = [
  {
    id: 'sms-001',
    student_id: 'std-101',
    student_name: 'Juan Carlos Garcia',
    guardian_phone: '+639171234567',
    message: '[SRNHS Alert] Juan Carlos Garcia entered campus via Main Gate 01 at 07:15 AM.',
    event_type: 'gate_entry',
    status: 'sent',
    sent_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: 'sms-002',
    student_id: 'std-102',
    student_name: 'Sophia Nicole Reyes',
    guardian_phone: '+639189876543',
    message: '[SRNHS Alert] Sophia Nicole Reyes entered campus via Main Gate 01 at 07:00 AM.',
    event_type: 'gate_entry',
    status: 'sent',
    sent_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'sms-003',
    student_id: 'std-105',
    student_name: 'Mark Anthony Ramos',
    guardian_phone: '+639195551212',
    message: '[SRNHS Alert] Mark Anthony Ramos was marked Unexcused Absent for Grade 10 Sampaguita Math.',
    event_type: 'unexcused_absence',
    status: 'sent',
    sent_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
];

class MockNotificationAdapterImpl implements NotificationAdapter {
  private logs: SmsNotification[] = [...INITIAL_MOCK_SMS];
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
