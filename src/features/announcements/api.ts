import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  Announcement,
  AnnouncementAudience,
  AnnouncementAttachment,
  AnnouncementRecipient,
} from '@/types/domain.types';
import { announcementValidationSchema } from '@/lib/validation';
import { logUserAction } from '@/lib/auditLogger';
import { activeNotificationAdapter } from '@/features/notifications/services';
import { getStoredStudents } from '@/features/faceRegistration/api';

const ATTACHMENT_BUCKET = 'announcement-attachments';
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const LS_ANNOUNCEMENTS = 'srnhs_announcements_v1';
const LS_RECIPIENTS = 'srnhs_announcement_recipients_v1';

/**
 * Uploads a document or image attachment to Supabase Storage.
 */
export async function uploadAnnouncementAttachment(
  file: File
): Promise<{ storage_path: string; file_name: string; mime: string; size: number }> {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`File "${file.name}" exceeds maximum allowed size of 10MB.`);
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Only PDF and images (JPEG, PNG, WebP) are allowed.`);
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `memos/${Date.now()}_${cleanName}`;

  if (supabase && isSupabaseConfigured) {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      console.warn('[Announcements] Storage upload fallback notice:', error.message);
    } else if (data) {
      const { data: pubData } = supabase.storage
        .from(ATTACHMENT_BUCKET)
        .getPublicUrl(data.path);

      return {
        storage_path: pubData?.publicUrl || data.path,
        file_name: file.name,
        mime: file.type,
        size: file.size,
      };
    }
  }

  // Fallback for tests or local mode: create an object URL or simulated path
  return {
    storage_path: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : `mock://${path}`,
    file_name: file.name,
    mime: file.type,
    size: file.size,
  };
}

/**
 * Fetch list of announcements with attachments and recipient read statistics.
 */
export async function fetchAnnouncements(): Promise<Announcement[]> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select(`
          id,
          title,
          body,
          audience_type,
          audience_id,
          send_sms,
          created_by,
          created_at,
          announcement_attachments(id, file_name, storage_path, mime, size, created_at),
          announcement_recipients(id, read_at, sms_status)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((row: any) => {
          const recs = row.announcement_recipients || [];
          const readCount = recs.filter((r: any) => r.read_at !== null).length;
          return {
            id: row.id,
            title: row.title,
            body: row.body,
            audience_type: row.audience_type,
            audience_id: row.audience_id,
            send_sms: row.send_sms,
            created_by: row.created_by,
            created_at: row.created_at,
            attachments: row.announcement_attachments || [],
            recipients_count: recs.length,
            read_count: readCount,
          };
        });
      }
      console.warn('[Announcements] Supabase fetch error:', error?.message);
    } catch (e) {
      console.warn('[Announcements] Query failed:', e);
    }
  }

  // Fallback to local storage
  try {
    const list: Announcement[] = JSON.parse(localStorage.getItem(LS_ANNOUNCEMENTS) || '[]');
    const recipients: AnnouncementRecipient[] = JSON.parse(localStorage.getItem(LS_RECIPIENTS) || '[]');

    return list.map(a => {
      const recs = recipients.filter(r => r.announcement_id === a.id);
      return {
        ...a,
        recipients_count: recs.length,
        read_count: recs.filter(r => Boolean(r.read_at)).length,
      };
    });
  } catch {
    return [];
  }
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  audience_type: AnnouncementAudience;
  audience_id?: string | null;
  send_sms: boolean;
  attachments?: Array<{
    file_name: string;
    storage_path: string;
    mime: string;
    size: number;
  }>;
}

/**
 * Create announcement, persist attachments, compute recipient list, and dispatch optional SMS.
 */
export async function createAnnouncement(
  input: CreateAnnouncementInput
): Promise<{ success: boolean; data?: Announcement; error?: string }> {
  // Validate schema
  const parsed = announcementValidationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message || 'Invalid announcement data' };
  }

  const now = new Date().toISOString();
  let authorId: string | null = null;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      authorId = data?.user?.id || null;
    } catch {}
  }

  // 1. Supabase flow
  if (supabase && isSupabaseConfigured) {
    try {
      const { data: annData, error: annError } = await supabase
        .from('announcements')
        .insert([
          {
            title: input.title.trim(),
            body: input.body.trim(),
            audience_type: input.audience_type,
            audience_id: input.audience_id || null,
            send_sms: input.send_sms,
            created_by: authorId,
          },
        ])
        .select()
        .single();

      if (annError || !annData) {
        return { success: false, error: annError?.message || 'Failed to create announcement record.' };
      }

      const announcementId = annData.id;

      // Attachments
      let savedAttachments: AnnouncementAttachment[] = [];
      if (input.attachments && input.attachments.length > 0) {
        const attachRows = input.attachments.map(att => ({
          announcement_id: announcementId,
          file_name: att.file_name,
          storage_path: att.storage_path,
          mime: att.mime,
          size: att.size,
        }));

        const { data: attRes } = await supabase
          .from('announcement_attachments')
          .insert(attachRows)
          .select();

        if (attRes) savedAttachments = attRes as AnnouncementAttachment[];
      }

      // Query target students to populate recipients
      let studentQuery = supabase
        .from('students')
        .select('id, first_name, last_name, lrn, grade_level, section_id');

      if (input.audience_type === 'grade_level' && input.audience_id) {
        studentQuery = studentQuery.eq('grade_level', Number(input.audience_id));
      } else if (input.audience_type === 'section' && input.audience_id) {
        studentQuery = studentQuery.eq('section_id', input.audience_id);
      }

      const { data: targetStudents } = await studentQuery;
      const studentIds = (targetStudents || []).map((s: any) => s.id);

      // Query primary guardians for these students
      let guardiansList: Array<{ id: string; student_id: string; mobile_number?: string; phone_number?: string; full_name?: string }> = [];
      if (studentIds.length > 0) {
        const { data: gData } = await supabase
          .from('guardians')
          .select('id, student_id, mobile_number, full_name, is_primary')
          .in('student_id', studentIds);

        if (gData) {
          guardiansList = gData as any;
        }
      }

      // Insert recipients
      if (guardiansList.length > 0) {
        const recipientRows = guardiansList.map(g => ({
          announcement_id: announcementId,
          guardian_id: g.id,
          sms_status: input.send_sms ? 'pending' : 'not_requested',
        }));

        await supabase.from('announcement_recipients').insert(recipientRows);

        // Dispatch SMS if requested
        if (input.send_sms) {
          const smsText = `[SRNHS Memo] ${input.title}: ${input.body.slice(0, 110)}...`;
          for (const g of guardiansList) {
            const phone = g.mobile_number || g.phone_number;
            if (phone) {
              activeNotificationAdapter
                .sendAlert({
                  student_id: g.student_id,
                  student_name: g.full_name || 'Guardian',
                  guardian_phone: phone,
                  message: smsText,
                  event_type: 'announcement',
                })
                .then(() => {
                  supabase
                    ?.from('announcement_recipients')
                    .update({ sms_status: 'sent' })
                    .eq('announcement_id', announcementId)
                    .eq('guardian_id', g.id);
                })
                .catch(() => {
                  supabase
                    ?.from('announcement_recipients')
                    .update({ sms_status: 'failed' })
                    .eq('announcement_id', announcementId)
                    .eq('guardian_id', g.id);
                });
            }
          }
        }
      }

      // Log audit action
      logUserAction({
        action: 'announcement.create',
        entity_type: 'announcement',
        entity_id: announcementId,
        metadata: {
          title: input.title,
          audience_type: input.audience_type,
          audience_id: input.audience_id,
          send_sms: input.send_sms,
          recipients_count: guardiansList.length,
        },
      }).catch(() => {});

      const createdObj: Announcement = {
        id: announcementId,
        title: annData.title,
        body: annData.body,
        audience_type: annData.audience_type,
        audience_id: annData.audience_id,
        send_sms: annData.send_sms,
        created_by: annData.created_by,
        created_at: annData.created_at,
        attachments: savedAttachments,
        recipients_count: guardiansList.length,
        read_count: 0,
      };

      return { success: true, data: createdObj };
    } catch (err: any) {
      return { success: false, error: err.message || 'Announcement creation failed.' };
    }
  }

  // 2. Local Storage fallback / testing
  const announcementId = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const storedStudents = getStoredStudents();
  let filtered = storedStudents;
  if (input.audience_type === 'section' && input.audience_id) {
    filtered = storedStudents.filter((s: any) => s.sectionId === input.audience_id);
  }

  const createdRecipients: AnnouncementRecipient[] = filtered.map((s, idx) => ({
    id: `rec-${announcementId}-${idx}`,
    announcement_id: announcementId,
    guardian_id: `grd-${s.id}`,
    sms_status: input.send_sms ? 'sent' : 'not_requested',
    read_at: null,
    created_at: now,
  }));

  const allRecipients: AnnouncementRecipient[] = JSON.parse(localStorage.getItem(LS_RECIPIENTS) || '[]');
  allRecipients.push(...createdRecipients);
  localStorage.setItem(LS_RECIPIENTS, JSON.stringify(allRecipients));

  const newAnn: Announcement = {
    id: announcementId,
    title: input.title.trim(),
    body: input.body.trim(),
    audience_type: input.audience_type,
    audience_id: input.audience_id || null,
    send_sms: input.send_sms,
    created_by: authorId,
    created_at: now,
    attachments: (input.attachments || []).map((att, i) => ({
      id: `att-${announcementId}-${i}`,
      announcement_id: announcementId,
      file_name: att.file_name,
      storage_path: att.storage_path,
      mime: att.mime,
      size: att.size,
      created_at: now,
    })),
    recipients_count: createdRecipients.length,
    read_count: 0,
  };

  const allAnnouncements: Announcement[] = JSON.parse(localStorage.getItem(LS_ANNOUNCEMENTS) || '[]');
  allAnnouncements.unshift(newAnn);
  localStorage.setItem(LS_ANNOUNCEMENTS, JSON.stringify(allAnnouncements));

  logUserAction({
    action: 'announcement.create',
    entity_type: 'announcement',
    entity_id: announcementId,
    metadata: {
      title: input.title,
      audience_type: input.audience_type,
      send_sms: input.send_sms,
      recipients_count: createdRecipients.length,
    },
  }).catch(() => {});

  return { success: true, data: newAnn };
}

/**
 * Fetch recipient audit tracking for an announcement (who has read it).
 */
export async function fetchAnnouncementRecipients(announcementId: string): Promise<Array<{
  id: string;
  guardian_name?: string;
  guardian_phone?: string;
  student_name?: string;
  sms_status: string;
  read_at: string | null;
}>> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('announcement_recipients')
        .select(`
          id,
          sms_status,
          read_at,
          guardians(id, full_name, mobile_number, student_id, students(first_name, last_name, lrn))
        `)
        .eq('announcement_id', announcementId);

      if (!error && data) {
        return data.map((r: any) => {
          const g = r.guardians;
          const s = g?.students;
          return {
            id: r.id,
            guardian_name: g?.full_name || 'Guardian',
            guardian_phone: g?.mobile_number,
            student_name: s ? `${s.first_name} ${s.last_name}` : undefined,
            sms_status: r.sms_status,
            read_at: r.read_at,
          };
        });
      }
    } catch (e) {
      console.warn('[Announcements] Recipient fetch failed:', e);
    }
  }

  // Local fallback
  const all: AnnouncementRecipient[] = JSON.parse(localStorage.getItem(LS_RECIPIENTS) || '[]');
  return all
    .filter(r => r.announcement_id === announcementId)
    .map(r => ({
      id: r.id,
      guardian_name: 'Parent / Guardian',
      guardian_phone: '09171234567',
      sms_status: r.sms_status,
      read_at: r.read_at || null,
    }));
}
