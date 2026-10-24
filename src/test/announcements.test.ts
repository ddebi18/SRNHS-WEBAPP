import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAnnouncement,
  fetchAnnouncements,
  fetchAnnouncementRecipients,
  uploadAnnouncementAttachment,
} from '@/features/announcements/api';
import { announcementValidationSchema } from '@/lib/validation';

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

vi.mock('@/features/faceRegistration/api', () => ({
  getStoredStudents: () => [
    {
      id: 'std-1',
      name: 'Juan Dela Cruz',
      studentNumber: '100000000001',
      sectionId: 'sec-01',
      gradeLevel: 10,
    },
    {
      id: 'std-2',
      name: 'Maria Santos',
      studentNumber: '100000000002',
      sectionId: 'sec-02',
      gradeLevel: 9,
    },
  ],
  getStoredSections: () => [
    { id: 'sec-01', name: 'Rizal', gradeLevel: 10 },
    { id: 'sec-02', name: 'Bonifacio', gradeLevel: 9 },
  ],
}));

describe('Feature 3: Announcements & Memos to Parents', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('1. Announcement Input Validation', () => {
    it('validates required title and body length', () => {
      const invalid = announcementValidationSchema.safeParse({
        title: 'Hi',
        body: 'Short',
        audience_type: 'school',
        send_sms: false,
      });
      expect(invalid.success).toBe(false);

      const valid = announcementValidationSchema.safeParse({
        title: 'Schedule for Q2 PTC',
        body: 'Please attend the upcoming conference at 1PM.',
        audience_type: 'school',
        send_sms: false,
      });
      expect(valid.success).toBe(true);
    });

    it('requires audience_id when targeting a specific section', () => {
      const missingId = announcementValidationSchema.safeParse({
        title: 'Section Reminder',
        body: 'Reminder for tomorrow science lab activity.',
        audience_type: 'section',
        send_sms: false,
      });
      expect(missingId.success).toBe(false);

      const withId = announcementValidationSchema.safeParse({
        title: 'Section Reminder',
        body: 'Reminder for tomorrow science lab activity.',
        audience_type: 'section',
        audience_id: 'sec-01',
        send_sms: false,
      });
      expect(withId.success).toBe(true);
    });

    it('rejects oversized files > 10MB during upload', async () => {
      const largeFile = new File(['x'.repeat(1024)], 'giant.pdf', { type: 'application/pdf' });
      Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 });

      await expect(uploadAnnouncementAttachment(largeFile)).rejects.toThrow(
        /exceeds maximum allowed size of 10MB/
      );
    });

    it('rejects unsupported MIME types during upload', async () => {
      const exeFile = new File(['binary'], 'virus.exe', { type: 'application/x-msdownload' });
      await expect(uploadAnnouncementAttachment(exeFile)).rejects.toThrow(
        /Unsupported file type/
      );
    });
  });

  describe('2. Announcement Creation & Audience Targeting', () => {
    it('creates school-wide memo targeting all students', async () => {
      const res = await createAnnouncement({
        title: 'General PTA Meeting',
        body: 'The annual General PTA Meeting is scheduled for next Saturday at 8:00 AM.',
        audience_type: 'school',
        send_sms: true,
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toBeTruthy();
      expect(res.data?.recipients_count).toBe(2);

      const list = await fetchAnnouncements();
      expect(list.length).toBe(1);
      expect(list[0]?.title).toBe('General PTA Meeting');
      expect(list[0]?.send_sms).toBe(true);
    });

    it('targets a specific section and only creates recipients for that section', async () => {
      const res = await createAnnouncement({
        title: 'Rizal Section Clean-up Drive',
        body: 'Grade 10 Rizal students will conduct classroom maintenance this Friday.',
        audience_type: 'section',
        audience_id: 'sec-01',
        send_sms: false,
      });

      expect(res.success).toBe(true);
      expect(res.data?.recipients_count).toBe(1);

      const recipients = await fetchAnnouncementRecipients(res.data!.id);
      expect(recipients.length).toBe(1);
    });

    it('records announcement creation to the append-only audit trail', async () => {
      await createAnnouncement({
        title: 'Audit Logged Memo',
        body: 'This memo must generate a corresponding user_logs entry.',
        audience_type: 'school',
        send_sms: false,
      });

      const auditLogs = JSON.parse(localStorage.getItem('user_logs') || '[]');
      const entry = auditLogs.find((l: any) => l.action === 'announcement.create');
      expect(entry).toBeDefined();
      expect(entry.metadata.title).toBe('Audit Logged Memo');
    });
  });

  describe('3. RLS Policy Simulation for Announcements', () => {
    function simulateAnnouncementRls(
      table: 'announcements' | 'announcement_recipients',
      operation: 'INSERT' | 'SELECT' | 'UPDATE' | 'DELETE',
      role: 'admin' | 'teacher' | 'guardian' | null,
      recipientGuardianId?: string,
      currentGuardianId?: string
    ): boolean {
      if (table === 'announcements') {
        if (operation === 'SELECT') return Boolean(role); // staff and guardians can view
        if (operation === 'INSERT') return role === 'admin' || role === 'teacher';
        if (operation === 'UPDATE' || operation === 'DELETE') return role === 'admin';
        return false;
      }

      if (table === 'announcement_recipients') {
        if (operation === 'SELECT') {
          if (role === 'admin' || role === 'teacher') return true;
          if (role === 'guardian') return recipientGuardianId === currentGuardianId;
          return false;
        }
        if (operation === 'UPDATE') {
          // Guardians can ONLY update read_at on their own recipient row
          if (role === 'guardian') return recipientGuardianId === currentGuardianId;
          return role === 'admin';
        }
        if (operation === 'INSERT') return role === 'admin' || role === 'teacher';
        return false;
      }

      return false;
    }

    it('allows staff to publish announcements and denies guardians from inserting', () => {
      expect(simulateAnnouncementRls('announcements', 'INSERT', 'admin')).toBe(true);
      expect(simulateAnnouncementRls('announcements', 'INSERT', 'teacher')).toBe(true);
      expect(simulateAnnouncementRls('announcements', 'INSERT', 'guardian')).toBe(false);
    });

    it('allows guardians to update read_at only on their own recipient row', () => {
      expect(simulateAnnouncementRls('announcement_recipients', 'UPDATE', 'guardian', 'grd-01', 'grd-01')).toBe(true);
      expect(simulateAnnouncementRls('announcement_recipients', 'UPDATE', 'guardian', 'grd-02', 'grd-01')).toBe(false);
    });
  });
});
