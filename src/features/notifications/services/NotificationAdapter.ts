import { SmsNotification } from '@/types/domain.types';

export interface NotificationAdapter {
  subscribeToSms(callback: (sms: SmsNotification) => void): () => void;
  getSmsLogs(limit?: number): Promise<SmsNotification[]>;
  sendAlert(data: {
    student_id: string;
    student_name: string;
    guardian_phone: string;
    message: string;
    event_type: 'gate_entry' | 'gate_exit' | 'unexcused_absence' | 'tardiness';
  }): Promise<SmsNotification>;
}

