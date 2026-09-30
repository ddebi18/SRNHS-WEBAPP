import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRole } from '@/hooks/useRole';
import { StaffProfile, TeacherAssignment } from '@/types/domain.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  UserCheck,
  Calendar,
  Clock,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Mail,
  RefreshCw,
  UserPlus,
  GraduationCap,
  UserX,
  Edit2,
  Trash2,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  useTeachers,
  useSections,
  useSubjects,
  useRooms,
  useTeachingAssignments,
  useCreateAssignment,
  useUpdateAssignment,
  useDeleteAssignment,
  useAssignAdviser,
} from '@/features/faculty/api';
import {
  formatTime12Hour,
  checkScheduleConflicts,
  timeToMinutes,
} from '@/features/faculty/conflictUtils';

// ── Zod schema for "Add Teacher" form ────────────────────────────────────────
const inviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required (min 2 characters)'),
  email: z.string().trim().email('Enter a valid institutional email address'),
});
type InviteForm = z.infer<typeof inviteSchema>;

// ── Zod schema for "Teaching Schedule" form ──────────────────────────────────
const scheduleSchema = z
  .object({
    teacher_id: z.string().min(1, 'Please select a faculty teacher'),
    section_id: z.string().min(1, 'Please select a section'),
    subject_id: z.string().min(1, 'Please select a subject'),
    room_id: z.string().min(1, 'Please select a room'),
    days: z.array(z.string()).min(1, 'Select at least one schedule day'),
    start_time: z.string().min(1, 'Start time is required'),
    end_time: z.string().min(1, 'End time is required'),
  })
  .refine(
    data => {
      const s = timeToMinutes(data.start_time);
      const e = timeToMinutes(data.end_time);
      return e > s;
    },
    {
      message: 'End time must be strictly after start time',
      path: ['end_time'],
    }
  );

type ScheduleForm = z.infer<typeof scheduleSchema>;

const WEEKDAYS = [
  { key: 'Mon', label: 'Mon' },
  { key: 'Tue', label: 'Tue' },
  { key: 'Wed', label: 'Wed' },
  { key: 'Thu', label: 'Thu' },
  { key: 'Fri', label: 'Fri' },
  { key: 'Sat', label: 'Sat' },
];

export const FacultyManager: React.FC = () => {
  const { isAdmin, user } = useRole();

  // ── Queries via React Query ────────────────────────────────────────────────
  const { data: teachers = [], isLoading: teachersLoading } = useTeachers();
  const { data: sections = [], isLoading: sectionsLoading } = useSections();
  const { data: subjects = [], isLoading: subjectsLoading } = useSubjects();
  const { data: rooms = [], isLoading: roomsLoading } = useRooms();
  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useTeachingAssignments();

  // ── Mutations via React Query ──────────────────────────────────────────────
  const createAssignmentMutation = useCreateAssignment();
  const updateAssignmentMutation = useUpdateAssignment();
  const deleteAssignmentMutation = useDeleteAssignment();
  const assignAdviserMutation = useAssignAdviser();

  // ── Staff Accounts State (for admin list) ──────────────────────────────────
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('staff_profiles')
      .select('id, email, full_name, role, department, is_active, created_at, updated_at')
      .order('full_name')
      .then(({ data }) => {
        if (data) setStaff(data as StaffProfile[]);
      });
  }, [teachers]);

  const toggleStaffStatus = async (id: string, current: boolean) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('staff_profiles')
      .update({ is_active: !current })
      .eq('id', id);

    if (!error) {
      setStaff(prev =>
        prev.map(s => (s.id === id ? { ...s, is_active: !current } : s))
      );
    }
  };

  // ── Add Teacher Modal State ───────────────────────────────────────────────
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const {
    register: registerInvite,
    handleSubmit: handleSubmitInvite,
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
        let msg = error.message || 'Failed to invite teacher.';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        setInviteError(msg);
        setInviting(false);
        return;
      }

      setInviteSuccess(
        `Invitation sent to ${values.email}. The teacher will receive a link to set their password.`
      );
      resetInviteForm();

      const { data: freshStaff } = await supabase
        .from('staff_profiles')
        .select('id, email, full_name, role, department, is_active, created_at, updated_at')
        .order('full_name');
      if (freshStaff) setStaff(freshStaff as StaffProfile[]);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Unexpected error. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (s: StaffProfile) => {
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
        } catch {}
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

  // ── Teaching Schedule Modal State ─────────────────────────────────────────
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);

  const {
    control,
    handleSubmit: handleSubmitSchedule,
    reset: resetScheduleForm,
    setValue: setScheduleValue,
    watch: watchSchedule,
    formState: { errors: scheduleFormErrors, isSubmitting: isScheduleSubmitting },
  } = useForm<ScheduleForm>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      teacher_id: '',
      section_id: '',
      subject_id: '',
      room_id: '',
      days: ['Mon', 'Wed', 'Fri'],
      start_time: '08:00',
      end_time: '09:00',
    },
  });

  const selectedDays = watchSchedule('days') || [];

  const toggleDay = (day: string) => {
    const cur = selectedDays;
    const next = cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day];
    setScheduleValue('days', next, { shouldValidate: true });
  };

  const openAddScheduleModal = () => {
    setEditingAssignmentId(null);
    resetScheduleForm({
      teacher_id: teachers[0]?.id || '',
      section_id: sections[0]?.id || '',
      subject_id: subjects[0]?.id || '',
      room_id: rooms[0]?.id || '',
      days: ['Mon', 'Wed', 'Fri'],
      start_time: '08:00',
      end_time: '09:00',
    });
    setScheduleError(null);
    setScheduleSuccess(null);
    setScheduleModalOpen(true);
  };

  const openEditScheduleModal = (asg: TeacherAssignment) => {
    setEditingAssignmentId(asg.id);
    resetScheduleForm({
      teacher_id: asg.teacher_id,
      section_id: asg.section_id,
      subject_id: asg.subject_id,
      room_id: asg.room_id,
      days: asg.days && asg.days.length > 0 ? asg.days : ['Mon'],
      start_time: asg.start_time.slice(0, 5),
      end_time: asg.end_time.slice(0, 5),
    });
    setScheduleError(null);
    setScheduleSuccess(null);
    setScheduleModalOpen(true);
  };

  const onScheduleSubmit = async (values: ScheduleForm) => {
    setScheduleError(null);

    // 1. Conflict detection before save
    const conflictResult = checkScheduleConflicts(
      values,
      assignments,
      editingAssignmentId ?? undefined
    );

    if (conflictResult.hasConflict) {
      setScheduleError(conflictResult.reason || 'Schedule conflict detected.');
      return;
    }

    try {
      if (editingAssignmentId) {
        await updateAssignmentMutation.mutateAsync({
          id: editingAssignmentId,
          ...values,
        });
        setScheduleSuccess('Teaching schedule assignment successfully updated.');
      } else {
        await createAssignmentMutation.mutateAsync(values);
        setScheduleSuccess('Teaching schedule assignment successfully created.');
      }

      setScheduleModalOpen(false);
      resetScheduleForm();
    } catch (err: unknown) {
      setScheduleError(err instanceof Error ? err.message : 'Failed to save teaching assignment.');
    }
  };

  // ── Delete Confirmation Modal State ───────────────────────────────────────
  const [deleteTargetAssignment, setDeleteTargetAssignment] = useState<TeacherAssignment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDeleteAssignment = async () => {
    if (!deleteTargetAssignment) return;
    setIsDeleting(true);
    try {
      await deleteAssignmentMutation.mutateAsync(deleteTargetAssignment.id);
      setDeleteTargetAssignment(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete assignment');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Assign Adviser Modal State ────────────────────────────────────────────
  const [adviserModalOpen, setAdviserModalOpen] = useState(false);
  const [adviserSectionId, setAdviserSectionId] = useState<string | null>(null);
  const [adviserTeacherId, setAdviserTeacherId] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [adviserSaving, setAdviserSaving] = useState(false);
  const [adviserError, setAdviserError] = useState<string | null>(null);
  const [adviserSuccess, setAdviserSuccess] = useState<string | null>(null);

  const openAdviserModal = (preselectedSectionId?: string) => {
    setAdviserSectionId(preselectedSectionId || null);
    if (preselectedSectionId) {
      const sec = sections.find(s => s.id === preselectedSectionId);
      setAdviserTeacherId(sec?.adviser_id ?? null);
    } else {
      setAdviserTeacherId(null);
    }
    setConfirmReplace(false);
    setAdviserError(null);
    setAdviserSuccess(null);
    setAdviserModalOpen(true);
  };

  const onAdviserSectionChange = (sectionId: string | null) => {
    setAdviserSectionId(sectionId);
    setConfirmReplace(false);
    const sec = sections.find(s => s.id === sectionId);
    setAdviserTeacherId(sec?.adviser_id ?? null);
  };

  const handleAdviserSave = async () => {
    if (!adviserSectionId) return;
    const sec = sections.find(s => s.id === adviserSectionId);
    const isReplacing = Boolean(sec?.adviser_id && sec.adviser_id !== adviserTeacherId && adviserTeacherId);

    if (isReplacing && !confirmReplace) {
      setAdviserError('Please confirm the replacement of the current adviser before saving.');
      return;
    }

    setAdviserSaving(true);
    setAdviserError(null);

    try {
      await assignAdviserMutation.mutateAsync({
        sectionId: adviserSectionId,
        adviserId: adviserTeacherId,
      });

      const teacher = teachers.find(t => t.id === adviserTeacherId);
      setAdviserSuccess(
        adviserTeacherId
          ? `${teacher?.full_name ?? 'Teacher'} assigned as adviser for ${sec?.name ?? 'section'}.`
          : `Adviser unassigned from ${sec?.name ?? 'section'}.`
      );
      setConfirmReplace(false);
    } catch (err: unknown) {
      setAdviserError(err instanceof Error ? err.message : 'Failed to update section adviser.');
    } finally {
      setAdviserSaving(false);
    }
  };

  // ── Staff Table Columns ───────────────────────────────────────────────────
  const staffColumns: Column<StaffProfile>[] = [
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
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
            s.role === 'admin'
              ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200/50'
              : 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/50'
          }`}
        >
          {s.role}
        </span>
      ),
    },
    {
      header: 'Account Status',
      cell: s => (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            s.is_active
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {s.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {s.is_active ? 'Active' : 'Deactivated'}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: s => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => toggleStaffStatus(s.id, s.is_active)}
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

  // ── Teaching Schedule Columns ─────────────────────────────────────────────
  const scheduleColumns: Column<TeacherAssignment>[] = [
    {
      header: 'Assigned Teacher',
      accessorKey: 'teacher_name',
      cell: a => (
        <div>
          <span className="font-bold text-slate-900 dark:text-slate-100 block">
            {a.teacher_name || 'Unassigned'}
          </span>
          {a.teacher_email && (
            <span className="font-mono text-[11px] text-slate-400 block">{a.teacher_email}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Section',
      accessorKey: 'section_name',
      cell: a => (
        <span className="font-semibold text-brand-600 dark:text-brand-400">
          {a.section_name || 'Section'}
        </span>
      ),
    },
    {
      header: 'Subject',
      accessorKey: 'subject_title',
      cell: a => (
        <div>
          <span className="text-slate-900 dark:text-slate-100 font-medium block">
            {a.subject_title || 'Subject'}
          </span>
          {a.subject_code && (
            <span className="text-[11px] font-mono text-slate-400 block">{a.subject_code}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Room',
      accessorKey: 'room_name',
      cell: a => (
        <span className="text-slate-600 dark:text-slate-400 text-xs">
          {a.room_name || 'Room'}
        </span>
      ),
    },
    {
      header: 'Days',
      cell: a => {
        const days = a.days && a.days.length > 0 ? a.days : a.schedule_day ? a.schedule_day.split(',').map(s => s.trim()) : [];
        return (
          <div className="flex flex-wrap gap-1">
            {days.map(d => (
              <span
                key={d}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                {d}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      header: 'Time Slot',
      cell: a => (
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300 font-medium">
          {formatTime12Hour(a.start_time)} – {formatTime12Hour(a.end_time)}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            header: 'Actions',
            cell: (a: TeacherAssignment) => (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEditScheduleModal(a)}
                  title="Edit assignment"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTargetAssignment(a)}
                  title="Delete assignment"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-300 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  // ── Section Advisers Table Columns ────────────────────────────────────────
  const adviserColumns: Column<any>[] = [
    {
      header: 'Grade & Section',
      cell: s => (
        <span className="font-bold text-slate-900 dark:text-slate-100">
          Grade {s.grade_level} - {s.name}
        </span>
      ),
    },
    {
      header: 'Designated Class Adviser',
      cell: s => {
        if (!s.adviser_id) {
          return <span className="text-xs italic text-slate-400 dark:text-slate-500">Unassigned</span>;
        }
        const teacher = teachers.find(t => t.id === s.adviser_id);
        const name = s.adviser_name || teacher?.full_name || 'Assigned Teacher';
        return (
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="font-semibold text-indigo-700 dark:text-indigo-300 text-xs">
              {name}
            </span>
          </div>
        );
      },
    },
    ...(isAdmin
      ? [
          {
            header: 'Actions',
            cell: (s: any) => (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openAdviserModal(s.id)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                >
                  {s.adviser_id ? 'Change' : 'Assign'}
                </button>
                {s.adviser_id && (
                  <button
                    onClick={() => {
                      assignAdviserMutation.mutate({ sectionId: s.id, adviserId: null });
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  // ── Teacher view (read-only schedule) ─────────────────────────────────────
  if (!isAdmin) {
    const teacherAssignments = assignments.filter(
      a => a.teacher_id === user?.id || (user?.email && a.teacher_email === user.email)
    );

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
          data={teacherAssignments}
          columns={scheduleColumns}
          keyExtractor={a => a.id}
          searchPlaceholder="Search my teaching schedule..."
          searchFilter={(a, q) => {
            const query = q.toLowerCase();
            return (
              (a.section_name?.toLowerCase().includes(query) ?? false) ||
              (a.subject_title?.toLowerCase().includes(query) ?? false) ||
              (a.room_name?.toLowerCase().includes(query) ?? false) ||
              (a.schedule_day?.toLowerCase().includes(query) ?? false)
            );
          }}
          emptyTitle="No teaching load assigned"
          emptyDescription="Contact school administrator if your teaching schedule has not been provisioned."
        />
      </div>
    );
  }

  const inputCls =
    'w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow';

  return (
    <div className="space-y-8">
      {/* Global feedback banner */}
      {(inviteError || inviteSuccess || scheduleSuccess) && (
        <div
          className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
            inviteError
              ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40'
              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="text-xs">{inviteError ?? inviteSuccess ?? scheduleSuccess}</span>
          <button
            onClick={() => {
              setInviteError(null);
              setInviteSuccess(null);
              setScheduleSuccess(null);
            }}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin Section 1: Staff Provisioning */}
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
          searchFilter={(s, q) =>
            s.full_name.toLowerCase().includes(q.toLowerCase()) ||
            s.email.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>

      {/* Admin Section 2: Teaching Schedule Assignments */}
      <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-500" />
              Faculty Teaching Load &amp; Schedule Assignments
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Map teachers to section, subject, room, and time slot schedules with collision detection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {assignmentsLoading && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400 mr-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Loading…
              </span>
            )}
            <button
              id="assign-adviser-btn"
              onClick={() => openAdviserModal()}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center gap-1.5 shadow-sm transition-all"
            >
              <GraduationCap className="w-4 h-4" />
              Assign Adviser
            </button>
            <button
              id="assign-schedule-btn"
              onClick={openAddScheduleModal}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Assign Teaching Schedule
            </button>
          </div>
        </div>

        {assignmentsError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 text-xs text-rose-700">
            Error loading teaching assignments: {(assignmentsError as any)?.message}
          </div>
        )}

        <DataTable
          data={assignments}
          columns={scheduleColumns}
          keyExtractor={a => a.id}
          searchPlaceholder="Search teaching assignments across teacher, section, subject, room..."
          searchFilter={(a, q) => {
            const query = q.toLowerCase();
            return (
              (a.teacher_name?.toLowerCase().includes(query) ?? false) ||
              (a.section_name?.toLowerCase().includes(query) ?? false) ||
              (a.subject_title?.toLowerCase().includes(query) ?? false) ||
              (a.room_name?.toLowerCase().includes(query) ?? false) ||
              (a.schedule_day?.toLowerCase().includes(query) ?? false)
            );
          }}
          emptyTitle="No teaching schedule records found"
          emptyDescription="Click 'Assign Teaching Schedule' above to create a new load assignment."
        />
      </div>

      {/* Admin Section 3: Section Advisers Overview */}
      <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            Class Section Advisers Directory
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Section-to-adviser allocations (one teacher per section).
          </p>
        </div>

        <DataTable
          data={sections}
          columns={adviserColumns}
          keyExtractor={s => s.id}
          searchPlaceholder="Search sections..."
          searchFilter={(s, q) =>
            s.name.toLowerCase().includes(q.toLowerCase()) ||
            (s.adviser_name?.toLowerCase().includes(q.toLowerCase()) ?? false)
          }
        />
      </div>

      {/* ── Modal: Add Teacher ── */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Add Teacher — Send Invite"
        subtitle="An invite email will be sent. The teacher sets their own password via the link."
      >
        <form onSubmit={handleSubmitInvite(onInviteSubmit)} className="space-y-4">
          {inviteError && (
            <div className="flex items-start gap-1.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {inviteError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Full Name
            </label>
            <input
              {...registerInvite('full_name')}
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
              {...registerInvite('email')}
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

      {/* ── Modal: Assign Teaching Schedule ── */}
      <Modal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        title={editingAssignmentId ? 'Edit Teaching Load Schedule' : 'Assign Teaching Load Schedule'}
        subtitle="Specify teacher, section, subject, room, days, and time slot."
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitSchedule(onScheduleSubmit)} className="space-y-4">
          {scheduleError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{scheduleError}</span>
            </div>
          )}

          {/* Teacher Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Faculty Member
            </label>
            <Controller
              control={control}
              name="teacher_id"
              render={({ field }) => (
                <SearchableSelect
                  id="schedule-teacher-select"
                  options={teachers.map(t => ({
                    value: t.id,
                    label: t.full_name,
                    description: t.email,
                  }))}
                  value={field.value || null}
                  onChange={val => field.onChange(val || '')}
                  placeholder="Select a teacher…"
                  searchPlaceholder="Search teachers by name or email…"
                  isLoading={teachersLoading}
                  error={scheduleFormErrors.teacher_id?.message}
                />
              )}
            />
          </div>

          {/* Section & Subject in 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Section
              </label>
              <Controller
                control={control}
                name="section_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="schedule-section-select"
                    options={sections.map(s => ({
                      value: s.id,
                      label: `Grade ${s.grade_level} - ${s.name}`,
                      description: s.adviser_name ? `Adviser: ${s.adviser_name}` : 'Unassigned',
                    }))}
                    value={field.value || null}
                    onChange={val => field.onChange(val || '')}
                    placeholder="Select a section…"
                    searchPlaceholder="Search sections…"
                    isLoading={sectionsLoading}
                    error={scheduleFormErrors.section_id?.message}
                  />
                )}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Subject
              </label>
              <Controller
                control={control}
                name="subject_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="schedule-subject-select"
                    options={subjects.map(sub => ({
                      value: sub.id,
                      label: sub.title || sub.name || 'Subject',
                      description: sub.code || undefined,
                    }))}
                    value={field.value || null}
                    onChange={val => field.onChange(val || '')}
                    placeholder="Select a subject…"
                    searchPlaceholder="Search subjects…"
                    isLoading={subjectsLoading}
                    error={scheduleFormErrors.subject_id?.message}
                  />
                )}
              />
            </div>
          </div>

          {/* Room */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Room
            </label>
            <Controller
              control={control}
              name="room_id"
              render={({ field }) => (
                <SearchableSelect
                  id="schedule-room-select"
                  options={rooms.map(r => ({
                    value: r.id,
                    label: r.name,
                    description: `${r.building} · Cap: ${r.capacity}`,
                  }))}
                  value={field.value || null}
                  onChange={val => field.onChange(val || '')}
                  placeholder="Select a room…"
                  searchPlaceholder="Search rooms…"
                  isLoading={roomsLoading}
                  error={scheduleFormErrors.room_id?.message}
                />
              )}
            />
          </div>

          {/* Schedule Days Multi-Select Chips */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Schedule Days
            </label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(day => {
                const isSelected = selectedDays.includes(day.key);
                return (
                  <button
                    type="button"
                    key={day.key}
                    onClick={() => toggleDay(day.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            {scheduleFormErrors.days && (
              <p className="mt-1 text-[11px] text-rose-500">
                {scheduleFormErrors.days.message}
              </p>
            )}
          </div>

          {/* Time Slot Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Start Time
              </label>
              <input
                type="time"
                {...control.register('start_time')}
                className={inputCls}
              />
              {scheduleFormErrors.start_time && (
                <p className="mt-1 text-[11px] text-rose-500">
                  {scheduleFormErrors.start_time.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                End Time
              </label>
              <input
                type="time"
                {...control.register('end_time')}
                className={inputCls}
              />
              {scheduleFormErrors.end_time && (
                <p className="mt-1 text-[11px] text-rose-500">
                  {scheduleFormErrors.end_time.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setScheduleModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              id="schedule-submit-btn"
              type="submit"
              disabled={isScheduleSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isScheduleSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {isScheduleSubmitting
                ? 'Saving…'
                : editingAssignmentId
                ? 'Update Assignment'
                : 'Save Assignment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Delete Confirmation ── */}
      <Modal
        isOpen={Boolean(deleteTargetAssignment)}
        onClose={() => setDeleteTargetAssignment(null)}
        title="Delete Teaching Assignment"
        subtitle="This action will remove the schedule from the active directory."
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Are you sure you want to remove the teaching load for{' '}
            <strong>{deleteTargetAssignment?.teacher_name}</strong> (
            {deleteTargetAssignment?.subject_title} · {deleteTargetAssignment?.section_name})?
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setDeleteTargetAssignment(null)}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              id="confirm-delete-asg-btn"
              type="button"
              disabled={isDeleting}
              onClick={confirmDeleteAssignment}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 flex items-center gap-1.5"
            >
              {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Assign Section Adviser ── */}
      <Modal
        isOpen={adviserModalOpen}
        onClose={() => {
          setAdviserModalOpen(false);
          setAdviserError(null);
          setAdviserSuccess(null);
        }}
        title="Assign Section Adviser"
        subtitle="One teacher per section. A teacher cannot advise two sections simultaneously."
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
              Select Section
            </label>
            <SearchableSelect
              id="adviser-section-select"
              options={sections.map(s => ({
                value: s.id,
                label: `Grade ${s.grade_level} - ${s.name}`,
                description: s.adviser_id
                  ? `Current Adviser: ${s.adviser_name ?? 'Assigned'}`
                  : 'Unassigned',
              }))}
              value={adviserSectionId}
              onChange={onAdviserSectionChange}
              placeholder="Search and select a section…"
              emptyText="No sections found"
            />
          </div>

          {/* Replacement Warning and Explicit Checkbox */}
          {adviserSectionId && (() => {
            const sec = sections.find(s => s.id === adviserSectionId);
            const currentAdviserId = sec?.adviser_id;
            const currentAdviser = teachers.find(t => t.id === currentAdviserId);
            const isReplacing = Boolean(currentAdviserId && currentAdviserId !== adviserTeacherId && adviserTeacherId);

            if (isReplacing) {
              return (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      Section <strong>{sec?.name}</strong> currently has an adviser:{' '}
                      <strong>{sec?.adviser_name || currentAdviser?.full_name || 'Assigned Teacher'}</strong>.
                      Saving will replace them.
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer font-medium pt-1 text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      id="confirm-replace-checkbox"
                      checked={confirmReplace}
                      onChange={e => setConfirmReplace(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span>I confirm replacing the current section adviser</span>
                  </label>
                </div>
              );
            }
            return null;
          })()}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Assign Teacher as Class Adviser
            </label>
            <SearchableSelect
              id="adviser-teacher-select"
              options={teachers.map(t => {
                const alreadyAdvisedSection = sections.find(
                  s => s.adviser_id === t.id && s.id !== adviserSectionId
                );
                return {
                  value: t.id,
                  label: t.full_name,
                  description: alreadyAdvisedSection
                    ? `Already advising Grade ${alreadyAdvisedSection.grade_level} - ${alreadyAdvisedSection.name}`
                    : t.email,
                };
              })}
              value={adviserTeacherId}
              onChange={setAdviserTeacherId}
              placeholder="Search and select a teacher…"
              emptyText="No teachers found"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setAdviserModalOpen(false);
                setAdviserError(null);
                setAdviserSuccess(null);
              }}
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
              {adviserSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <GraduationCap className="w-3.5 h-3.5" />
              )}
              {adviserSaving ? 'Saving…' : 'Save Adviser'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
