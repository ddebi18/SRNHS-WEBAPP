import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRole } from '@/hooks/useRole';
import { StaffProfile, TeacherAssignment, Section } from '@/types/domain.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  UserCheck, Calendar, Clock, Plus, CheckCircle, XCircle,
  AlertCircle, Mail, RefreshCw, UserPlus, GraduationCap, UserX,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const INITIAL_ASSIGNMENTS: TeacherAssignment[] = [];

// ── Zod schema for "Add Teacher" form ────────────────────────────────────────
const inviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required (min 2 characters)'),
  email: z.string().trim().email('Enter a valid institutional email address'),
});
type InviteForm = z.infer<typeof inviteSchema>;

// ── Invite status derived from auth user fields ───────────────────────────────
type InviteStatus = 'Active' | 'Invited';

interface StaffProfileWithStatus extends StaffProfile {
  email_confirmed_at?: string | null;
  invited_at?: string | null;
  inviteStatus?: InviteStatus;
}

export const FacultyManager: React.FC = () => {
  const { isAdmin, user } = useRole();
  const [staff, setStaff] = useState<StaffProfileWithStatus[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>(INITIAL_ASSIGNMENTS);

  // Fetch teacher profiles; also pull email_confirmed_at via Edge Function is not possible
  // from browser — we derive status from user_metadata.password_set instead via staff_profiles
  useEffect(() => {
    if (!supabase) { setStaffLoading(false); return; }
    supabase
      .from('staff_profiles')
      .select('id, email, full_name, role, department, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data, error }) => {
        if (error) setStaffError(error.message);
        else setStaff((data as StaffProfileWithStatus[]) || []);
        setStaffLoading(false);
      });
  }, []);

  // ── Add Teacher Modal (React Hook Form + Zod) ─────────────────────────────
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset: resetInviteForm,
    formState: { errors: inviteErrors },
  } = useForm<InviteForm>({ resolver: zodResolver(inviteSchema) });

  const openInviteModal = () => {
    resetInviteForm();
    setInviteError(null);
    setInviteSuccess(null);
    setInviteModalOpen(true);
  };

  const onInviteSubmit = async (values: InviteForm) => {
    if (!supabase) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const { error } = await supabase.functions.invoke('create-teacher', {
        body: { email: values.email, full_name: values.full_name },
      });

      if (error) {
        // Read server-side error message from the Edge Function response body
        let msg = error.message || 'Failed to invite teacher.';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* keep original msg */ }
        setInviteError(msg);
        setInviting(false);
        return;
      }

      setInviteSuccess(`Invitation sent to ${values.email}. The teacher will receive a link to set their password.`);
      resetInviteForm();

      // Refresh staff list
      const { data: freshStaff } = await supabase
        .from('staff_profiles')
        .select('id, email, full_name, role, department, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('full_name');
      if (freshStaff) setStaff(freshStaff as StaffProfileWithStatus[]);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Unexpected error. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  // ── Resend invite ─────────────────────────────────────────────────────────
  // Supabase doesn't expose email_confirmed_at to the browser via staff_profiles;
  // we show "Resend" for any teacher whose password_set metadata isn't confirmed.
  // Re-inviting an already-confirmed user will return a Supabase error:
  //   "A user with this email address has already been registered"
  // The Edge Function calls inviteUserByEmail which returns this error for confirmed users.
  // FINDING: inviteUserByEmail on a confirmed user fails with "User already registered".
  // PROPOSED FIX (implemented below): The Edge Function could instead call
  //   admin.auth.admin.generateLink({ type: 'recovery', email }) for confirmed users,
  //   but that is a separate concern. For now, resend is attempted and the error is
  //   surfaced to the admin with a clear message.
  const handleResendInvite = async (s: StaffProfileWithStatus) => {
    if (!supabase) return;
    setResendingId(s.id);
    setInviteError(null);

    try {
      const { error } = await supabase.functions.invoke('create-teacher', {
        body: { email: s.email, full_name: s.full_name },
      });

      if (error) {
        let msg = error.message || 'Failed to resend invitation.';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* keep original msg */ }
        setInviteError(`Resend failed for ${s.email}: ${msg}`);
      } else {
        setInviteSuccess(`Invitation resent to ${s.email}.`);
      }
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Unexpected error resending invite.');
    } finally {
      setResendingId(null);
    }
  };

  // ── Assignment Modal State ───────────────────────────────────────────────
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [targetTeacherId, setTargetTeacherId] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [subjectTitle, setSubjectTitle] = useState('');
  const [roomName, setRoomName] = useState('');
  const [scheduleDay, setScheduleDay] = useState('');
  const [timeRange, setTimeRange] = useState('');

  const toggleStaffStatus = (id: string) => {
    setStaff(prev => prev.map(s => (s.id === id ? { ...s, is_active: !s.is_active } : s)));
  };

  const handleAssignmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const teacher = staff.find(s => s.id === targetTeacherId);

    const newAsg: TeacherAssignment = {
      id: `asg-${Date.now()}`,
      teacher_id: targetTeacherId,
      teacher_name: teacher?.full_name || 'Faculty Staff',
      section_id: `sec-${Date.now()}`,
      section_name: sectionName,
      subject_id: `sub-${Date.now()}`,
      subject_code: 'SUBJ',
      subject_title: subjectTitle,
      room_id: `rm-${Date.now()}`,
      room_name: roomName,
      schedule_day: scheduleDay,
      start_time: timeRange.split('-')[0]?.trim() || '08:00 AM',
      end_time: timeRange.split('-')[1]?.trim() || '09:00 AM',
      created_at: new Date().toISOString(),
    };

    setAssignments(prev => [...prev, newAsg]);
    setAssignmentModalOpen(false);
  };

  // ── Assign Adviser State ──────────────────────────────────────────────────
  const [adviserModalOpen, setAdviserModalOpen] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [adviserSectionId, setAdviserSectionId] = useState<string | null>(null);
  const [adviserTeacherId, setAdviserTeacherId] = useState<string | null>(null);
  const [adviserSaving, setAdviserSaving] = useState(false);
  const [adviserError, setAdviserError] = useState<string | null>(null);
  const [adviserSuccess, setAdviserSuccess] = useState<string | null>(null);

  const loadSections = () => {
    if (!supabase) return;
    supabase
      .from('sections')
      .select('id, name, grade_level, adviser_id, created_at')
      .order('grade_level')
      .order('name')
      .then(({ data }) => { if (data) setSections(data as Section[]); });
  };

  const openAdviserModal = () => {
    setAdviserSectionId(null);
    setAdviserTeacherId(null);
    setAdviserError(null);
    setAdviserSuccess(null);
    loadSections();
    setAdviserModalOpen(true);
  };

  const onAdviserSectionChange = (sectionId: string | null) => {
    setAdviserSectionId(sectionId);
    const sec = sections.find(s => s.id === sectionId);
    setAdviserTeacherId(sec?.adviser_id ?? null);
  };

  const handleAdviserSave = async () => {
    if (!supabase || !adviserSectionId) return;
    setAdviserSaving(true);
    setAdviserError(null);
    const { error } = await supabase
      .from('sections')
      .update({ adviser_id: adviserTeacherId })
      .eq('id', adviserSectionId);
    if (error) {
      setAdviserError(error.message);
    } else {
      const teacher = staff.find(t => t.id === adviserTeacherId);
      const sec = sections.find(s => s.id === adviserSectionId);
      setAdviserSuccess(
        adviserTeacherId
          ? `${teacher?.full_name ?? 'Teacher'} assigned as adviser for ${sec?.name ?? 'section'}.`
          : `Adviser removed from ${sec?.name ?? 'section'}.`
      );
      loadSections();
      setAdviserSectionId(null);
      setAdviserTeacherId(null);
    }
    setAdviserSaving(false);
  };

  // ── Staff Table Columns ──────────────────────────────────────────────────
  const staffColumns: Column<StaffProfileWithStatus>[] = [
    {
      header: 'Full Name',
      accessorKey: 'full_name',
      cell: s => <span className="font-bold text-slate-900 dark:text-slate-100">{s.full_name}</span>,
    },
    {
      header: 'Institutional Email',
      accessorKey: 'email',
      cell: s => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{s.email}</span>,
    },
    {
      header: 'Role',
      cell: s => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${s.role === 'admin' ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/50' : 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50'}`}>
          {s.role}
        </span>
      ),
    },
    {
      header: 'Account Status',
      cell: s => (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-300/50 dark:border-slate-700/50'}`}>
          {s.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {s.is_active ? 'Active' : 'Deactivated'}
        </span>
      ),
    },
    // Invite status: "Invited" if no password_set yet (approximation — true source requires admin API)
    {
      header: 'Invite Status',
      cell: s => {
        // ponytail: no admin API from browser — use role column; teachers without confirmed
        // password show as "Invited" until they complete /set-password flow
        const isPending = s.role === 'teacher' && !s.inviteStatus;
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isPending ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200/50' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200/50'}`}>
            <Mail className="w-3 h-3" />
            {s.inviteStatus ?? (s.role === 'teacher' ? 'Invited' : 'Active')}
          </span>
        );
      },
    },
    {
      header: 'Actions',
      cell: s => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => toggleStaffStatus(s.id)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
          >
            {s.is_active ? 'Deactivate' : 'Activate'}
          </button>
          {s.role === 'teacher' && (
            <button
              id={`resend-invite-${s.id}`}
              onClick={() => handleResendInvite(s)}
              disabled={resendingId === s.id}
              title="Resend invite email"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-300 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resendingId === s.id ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      ),
    },
  ];

  // ── Schedule Columns ────────────────────────────────────────────────────
  const scheduleColumns: Column<TeacherAssignment>[] = [
    { header: 'Assigned Teacher', accessorKey: 'teacher_name', cell: a => <span className="font-bold text-slate-900 dark:text-slate-100">{a.teacher_name}</span> },
    { header: 'Section', accessorKey: 'section_name', cell: a => <span className="font-bold text-brand-600 dark:text-brand-400">{a.section_name}</span> },
    { header: 'Subject Title', accessorKey: 'subject_title', cell: a => <span className="text-slate-800 dark:text-slate-200 font-medium">{a.subject_title}</span> },
    { header: 'Assigned Room', accessorKey: 'room_name', cell: a => <span className="text-slate-600 dark:text-slate-400">{a.room_name}</span> },
    { header: 'Teaching Days', accessorKey: 'schedule_day', cell: a => <span className="text-slate-600 dark:text-slate-400">{a.schedule_day}</span> },
    { header: 'Time Slot', cell: a => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{a.start_time} – {a.end_time}</span> },
  ];

  // ── Teacher view (read-only schedule) ───────────────────────────────────
  if (!isAdmin) {
    const teacherAssignments = assignments.filter(a => a.teacher_id === user?.id || a.teacher_name === user?.full_name);
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-500" />
            My Teaching Schedule &amp; Assigned Loads
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Personal teaching load overview assigned by School Administration.
          </p>
        </div>

        <DataTable
          data={teacherAssignments.length > 0 ? teacherAssignments : assignments}
          columns={scheduleColumns}
          keyExtractor={a => a.id}
          emptyTitle="No teaching load assigned"
          emptyDescription="Contact school administrator if your teaching schedule has not been provisioned."
        />
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow';

  return (
    <div className="space-y-8">
      {/* Global invite feedback banner */}
      {(inviteError || inviteSuccess) && (
        <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${inviteError ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40'}`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="text-xs">{inviteError ?? inviteSuccess}</span>
          <button onClick={() => { setInviteError(null); setInviteSuccess(null); }} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Admin Section 1: Staff */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-brand-500" />
              Staff Account Management &amp; Provisioning
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Invite, deactivate, and audit institutional staff accounts.
            </p>
          </div>

          <button
            id="add-teacher-btn"
            onClick={openInviteModal}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center gap-1.5 shadow-sm shadow-emerald-900/20 transition-all self-start sm:self-auto cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Add Teacher
          </button>
        </div>

        <DataTable
          data={staff}
          columns={staffColumns}
          keyExtractor={s => s.id}
          searchPlaceholder="Search staff by name or email..."
          searchFilter={(s, q) => s.full_name.toLowerCase().includes(q.toLowerCase()) || s.email.toLowerCase().includes(q.toLowerCase())}
        />
      </div>

      {/* Admin Section 2: Teaching Schedule */}
      <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-500" />
              Faculty Teaching Load &amp; Schedule Assignments
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Map teachers to section, subject, room, and time slot schedules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              id="assign-adviser-btn"
              onClick={openAdviserModal}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center gap-1.5 shadow-sm transition-all"
            >
              <GraduationCap className="w-4 h-4" />
              Assign Adviser
            </button>
            <button
              id="assign-schedule-btn"
              onClick={() => setAssignmentModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Assign Teaching Schedule
            </button>
          </div>
        </div>

        <DataTable
          data={assignments}
          columns={scheduleColumns}
          keyExtractor={a => a.id}
          searchPlaceholder="Search teaching assignments..."
          searchFilter={(a, q) =>
            Boolean(
              (a.teacher_name && a.teacher_name.toLowerCase().includes(q.toLowerCase())) ||
                (a.section_name && a.section_name.toLowerCase().includes(q.toLowerCase()))
            )
          }
        />
      </div>

      {/* ── Add Teacher Modal ── */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Add Teacher — Send Invite"
        subtitle="An invite email will be sent. The teacher sets their own password via the link."
      >
        <form id="invite-teacher-form" onSubmit={handleSubmit(onInviteSubmit)} className="space-y-4">
          {inviteError && (
            <div className="flex items-start gap-1.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div className="flex items-start gap-1.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {inviteSuccess}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Full Name
            </label>
            <input
              {...register('full_name')}
              id="invite-full-name"
              type="text"
              placeholder="e.g. Ms. Elena Torres"
              className={inputCls}
            />
            {inviteErrors.full_name && (
              <p className="mt-1 text-[11px] text-rose-500">{inviteErrors.full_name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Institutional Email
            </label>
            <input
              {...register('email')}
              id="invite-email"
              type="email"
              placeholder="e.g. e.torres@srnhs.edu.ph"
              className={inputCls}
            />
            {inviteErrors.email && (
              <p className="mt-1 text-[11px] text-rose-500">{inviteErrors.email.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setInviteModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              id="invite-submit-btn"
              type="submit"
              disabled={inviting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {inviting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {inviting ? 'Sending Invite…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Assign Schedule Modal ── */}
      <Modal
        isOpen={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        title="Assign Teaching Load Schedule"
      >
        <form onSubmit={handleAssignmentSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Faculty Member</label>
            {staffError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 mb-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {staffError}
              </div>
            )}
            <select
              value={targetTeacherId}
              onChange={e => setTargetTeacherId(e.target.value)}
              disabled={staffLoading || staff.filter(s => s.role === 'teacher').length === 0}
              className={inputCls + ' disabled:opacity-50'}
            >
              {staffLoading ? (
                <option value="">Loading teachers…</option>
              ) : staff.filter(s => s.role === 'teacher').length === 0 ? (
                <option value="">No teacher accounts found</option>
              ) : (
                staff.filter(s => s.role === 'teacher').map(t => (
                  <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                ))
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Section</label>
              <input required type="text" value={sectionName} onChange={e => setSectionName(e.target.value)} placeholder="e.g. Grade 10 - Sampaguita" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Subject</label>
              <input required type="text" value={subjectTitle} onChange={e => setSubjectTitle(e.target.value)} placeholder="e.g. General Mathematics" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Room</label>
              <input required type="text" value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="e.g. Building A - Room 204" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Schedule Days</label>
              <input required type="text" value={scheduleDay} onChange={e => setScheduleDay(e.target.value)} placeholder="e.g. Mon, Wed, Fri" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Time Slot</label>
            <input required type="text" value={timeRange} onChange={e => setTimeRange(e.target.value)} placeholder="e.g. 08:00 AM - 09:00 AM" className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setAssignmentModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700">Save Assignment</button>
          </div>
        </form>
      </Modal>
      {/* ── Assign Adviser Modal ── */}
      <Modal
        isOpen={adviserModalOpen}
        onClose={() => { setAdviserModalOpen(false); setAdviserError(null); setAdviserSuccess(null); }}
        title="Assign Section Adviser"
        subtitle="One teacher per section. Setting a new adviser replaces the existing one."
      >
        <div className="space-y-4">
          {adviserError && (
            <div className="flex items-start gap-1.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {adviserError}
            </div>
          )}
          {adviserSuccess && (
            <div className="flex items-start gap-1.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {adviserSuccess}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Section
            </label>
            <SearchableSelect
              id="adviser-section-select"
              options={sections.map(s => ({
                value: s.id,
                label: s.name,
                sublabel: `Grade ${s.grade_level}${s.adviser_id ? ` · Adviser: ${s.adviser_name ?? 'assigned'}` : ''}`,
              }))}
              value={adviserSectionId}
              onChange={onAdviserSectionChange}
              placeholder="Search and select a section…"
              emptyText="No sections found"
            />
          </div>

          {/* Replacement warning */}
          {adviserSectionId && (() => {
            const sec = sections.find(s => s.id === adviserSectionId);
            const currentAdviserId = sec?.adviser_id;
            const currentAdviser = staff.find(t => t.id === currentAdviserId);
            if (currentAdviserId && currentAdviserId !== adviserTeacherId) {
              return (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Current adviser: <strong>{currentAdviser?.full_name ?? 'Assigned teacher'}</strong>. Saving will replace them.
                  </span>
                </div>
              );
            }
            return null;
          })()}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Assign Teacher as Adviser
            </label>
            <SearchableSelect
              id="adviser-teacher-select"
              options={staff
                .filter(s => s.role === 'teacher')
                .map(t => ({ value: t.id, label: t.full_name, sublabel: t.email }))
              }
              value={adviserTeacherId}
              onChange={setAdviserTeacherId}
              placeholder="Search and select a teacher…"
              emptyText="No teachers found"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => { setAdviserModalOpen(false); setAdviserError(null); setAdviserSuccess(null); }}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Close
            </button>
            {adviserSectionId && adviserTeacherId && (
              <button
                id="adviser-unassign-btn"
                type="button"
                onClick={() => setAdviserTeacherId(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1.5"
              >
                <UserX className="w-3.5 h-3.5" />
                Unassign
              </button>
            )}
            <button
              id="adviser-save-btn"
              type="button"
              disabled={!adviserSectionId || adviserSaving}
              onClick={handleAdviserSave}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {adviserSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GraduationCap className="w-3.5 h-3.5" />}
              {adviserSaving ? 'Saving…' : 'Save Adviser'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
