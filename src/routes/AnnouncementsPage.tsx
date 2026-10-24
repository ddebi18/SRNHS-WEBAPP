import React, { useState, useEffect } from 'react';
import {
  Bell,
  Plus,
  Send,
  FileText,
  CheckCircle2,
  Clock,
  Download,
  X,
  Upload,
  Eye,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { Announcement, AnnouncementAudience } from '@/types/domain.types';
import {
  fetchAnnouncements,
  createAnnouncement,
  uploadAnnouncementAttachment,
  fetchAnnouncementRecipients,
} from '@/features/announcements/api';
import { getStoredSections } from '@/features/faceRegistration/api';
import { LoadingSpinner } from '@/components/ui/StateViews';
import { cn } from '@/lib/utils';

export const AnnouncementsPage: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [recipientsModalOpen, setRecipientsModalOpen] = useState(false);
  const [recipientsList, setRecipientsList] = useState<any[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Compose state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState<AnnouncementAudience>('school');
  const [audienceId, setAudienceId] = useState('');
  const [sendSms, setSendSms] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ file_name: string; storage_path: string; mime: string; size: number }>>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sections = getStoredSections();

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchAnnouncements();
      setAnnouncements(data);
    } catch (e) {
      console.warn('Failed to load announcements:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploadingFile(true);
      setErrorMsg(null);
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const uploaded = await uploadAnnouncementAttachment(file);
        setAttachments(prev => [...prev, uploaded]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Attachment upload failed.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setErrorMsg('Please enter both an announcement title and body message.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const res = await createAnnouncement({
        title,
        body,
        audience_type: audienceType,
        audience_id: audienceType !== 'school' ? audienceId : null,
        send_sms: sendSms,
        attachments,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to dispatch announcement.');
        return;
      }

      // Reset form & reload
      setTitle('');
      setBody('');
      setAudienceType('school');
      setAudienceId('');
      setSendSms(false);
      setAttachments([]);
      setComposeOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to dispatch announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenRecipients = async (ann: Announcement) => {
    setSelectedAnnouncement(ann);
    setRecipientsModalOpen(true);
    setLoadingRecipients(true);
    try {
      const recs = await fetchAnnouncementRecipients(ann.id);
      setRecipientsList(recs);
    } catch (e) {
      console.warn('Failed to load recipients:', e);
    } finally {
      setLoadingRecipients(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">Announcements &amp; Parent Memos</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              Parent Dispatch
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Broadcast official school circulars, PTC memos, and critical updates with optional SMS and read tracking.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setComposeOpen(true);
          }}
          className="px-4 py-2 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Compose Memo
        </button>
      </div>

      {/* Announcements List */}
      {loading ? (
        <div className="p-12">
          <LoadingSpinner label="Loading announcements..." />
        </div>
      ) : announcements.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-card border border-border text-muted-foreground space-y-2">
          <Bell className="w-8 h-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm font-semibold text-foreground">No Announcements Sent</p>
          <p className="text-xs">Click "Compose Memo" above to broadcast your first memo to guardians.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map(ann => {
            const readPercentage =
              ann.recipients_count && ann.recipients_count > 0
                ? Math.round(((ann.read_count || 0) / ann.recipients_count) * 100)
                : 0;

            return (
              <div
                key={ann.id}
                className="p-5 rounded-2xl bg-card border border-border hover:border-primary/40 shadow-sm transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-foreground">{ann.title}</h3>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                        {ann.audience_type === 'school'
                          ? 'School-Wide'
                          : ann.audience_type === 'grade_level'
                          ? `Grade ${ann.audience_id}`
                          : 'Class Section'}
                      </span>
                      {ann.send_sms && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> SMS Dispatched
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      Posted on {new Date(ann.created_at).toLocaleString()}
                    </p>
                  </div>

                  {/* Metrics Badges */}
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <button
                      onClick={() => handleOpenRecipients(ann)}
                      className="px-3 py-1.5 rounded-xl bg-muted/60 hover:bg-muted border border-border flex items-center gap-2 text-foreground font-medium transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-primary" />
                      <span>
                        Read: <strong>{ann.read_count || 0}</strong> / {ann.recipients_count || 0} ({readPercentage}%)
                      </span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {ann.body}
                </p>

                {/* Attachments */}
                {ann.attachments && ann.attachments.length > 0 && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    {ann.attachments.map(att => (
                      <a
                        key={att.id}
                        href={att.storage_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-muted border border-border hover:border-primary/40 text-foreground text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="truncate max-w-[180px]">{att.file_name}</span>
                        <Download className="w-3 h-3 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compose Announcement Modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Compose Parent Memo</h3>
                  <p className="text-[11px] text-muted-foreground">Broadcast updates to student guardians</p>
                </div>
              </div>
              <button
                onClick={() => setComposeOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleComposeSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-foreground block mb-1">Memo Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Schedule of 2nd Quarter Parent-Teacher Conference (PTC)"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">Target Audience *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['school', 'grade_level', 'section'] as AnnouncementAudience[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setAudienceType(type);
                        setAudienceId('');
                      }}
                      className={cn(
                        'py-2 px-3 rounded-xl font-bold text-center border transition-all cursor-pointer capitalize text-[11px]',
                        audienceType === type
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {type === 'school' ? 'Whole School' : type === 'grade_level' ? 'Grade Level' : 'Section'}
                    </button>
                  ))}
                </div>
              </div>

              {audienceType === 'grade_level' && (
                <div>
                  <label className="font-bold text-foreground block mb-1">Select Grade Level *</label>
                  <select
                    value={audienceId}
                    onChange={e => setAudienceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none cursor-pointer"
                    required
                  >
                    <option value="">Select Grade Level...</option>
                    {[7, 8, 9, 10, 11, 12].map(g => (
                      <option key={g} value={String(g)}>
                        Grade {g}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {audienceType === 'section' && (
                <div>
                  <label className="font-bold text-foreground block mb-1">Select Class Section *</label>
                  <select
                    value={audienceId}
                    onChange={e => setAudienceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none cursor-pointer"
                    required
                  >
                    <option value="">Select Section...</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Grade {s.gradeLevel})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-bold text-foreground block mb-1">Memo Message / Body *</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={4}
                  placeholder="Provide complete details, instructions, agendas, or reminders..."
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 leading-relaxed"
                  required
                />
              </div>

              {/* Attachments Section */}
              <div className="space-y-2">
                <label className="font-bold text-foreground block">Attachments (PDF or Images, max 10MB)</label>
                <div className="flex items-center gap-2">
                  <label className="px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-primary" />
                    <span>{uploadingFile ? 'Uploading...' : 'Attach File'}</span>
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-muted-foreground">{attachments.length} file(s) attached</span>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 rounded-xl bg-muted/60 border border-border flex items-center justify-between text-[11px]"
                      >
                        <span className="truncate max-w-[280px] font-medium text-foreground">{att.file_name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="text-muted-foreground hover:text-rose-500 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SMS Notification Toggle */}
              <div className="p-3.5 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <span className="font-bold text-foreground block">Send SMS Summary</span>
                  <span className="text-[11px] text-muted-foreground">
                    Dispatches an instant text notification to all registered primary guardians.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={sendSms}
                  onChange={e => setSendSms(e.target.checked)}
                  className="w-4 h-4 text-primary rounded border-border focus:ring-primary cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingFile}
                  className="px-5 py-2 rounded-xl bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? 'Dispatching...' : 'Publish Memo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recipients Audit Modal */}
      {recipientsModalOpen && selectedAnnouncement && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Memo Read Receipts &amp; SMS Audit</h3>
                <p className="text-[11px] text-muted-foreground truncate max-w-md">
                  {selectedAnnouncement.title}
                </p>
              </div>
              <button
                onClick={() => setRecipientsModalOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingRecipients ? (
                <div className="p-8">
                  <LoadingSpinner label="Querying recipient tracking..." />
                </div>
              ) : recipientsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No recipient records found for this announcement.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3">Guardian Name</th>
                      <th className="p-3">Student</th>
                      <th className="p-3">SMS Status</th>
                      <th className="p-3">Read Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {recipientsList.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-muted/40">
                        <td className="p-3 font-medium text-foreground">
                          {r.guardian_name || 'Guardian'}
                          {r.guardian_phone && (
                            <span className="block text-[10px] text-muted-foreground font-mono">
                              {r.guardian_phone}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{r.student_name || '—'}</td>
                        <td className="p-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                              r.sms_status === 'sent' && 'bg-emerald-500/10 text-emerald-500',
                              r.sms_status === 'failed' && 'bg-rose-500/10 text-rose-500',
                              r.sms_status === 'not_requested' && 'bg-muted text-muted-foreground'
                            )}
                          >
                            {r.sms_status}
                          </span>
                        </td>
                        <td className="p-3">
                          {r.read_at ? (
                            <span className="text-emerald-500 flex items-center gap-1 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Read {new Date(r.read_at).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                              <Clock className="w-3.5 h-3.5" /> Unread
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <button
                onClick={() => setRecipientsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
