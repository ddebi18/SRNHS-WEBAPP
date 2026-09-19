import React, { useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { StaffProfile, TeacherAssignment } from '@/types/domain.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { UserCheck, Calendar, Clock, Plus, CheckCircle, XCircle } from 'lucide-react';

const INITIAL_STAFF: StaffProfile[] = [];

const INITIAL_ASSIGNMENTS: TeacherAssignment[] = [];

export const FacultyManager: React.FC = () => {
  const { isAdmin, user } = useRole();
  const [staff, setStaff] = useState<StaffProfile[]>(INITIAL_STAFF);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>(INITIAL_ASSIGNMENTS);

  // Provision Staff Modal State
  const [provisionModalOpen, setProvisionModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'teacher'>('teacher');

  // Assignment Modal State
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [targetTeacherId, setTargetTeacherId] = useState('');
  const [sectionName, setSectionName] = useState('Grade 10 – Sampaguita');
  const [subjectTitle, setSubjectTitle] = useState('General Mathematics');
  const [roomName, setRoomName] = useState('Building A – Room 204');
  const [scheduleDay, setScheduleDay] = useState('Mon, Wed, Fri');
  const [timeRange, setTimeRange] = useState('08:00 AM - 09:00 AM');

  const toggleStaffStatus = (id: string) => {
    setStaff(prev =>
      prev.map(s => (s.id === id ? { ...s, is_active: !s.is_active } : s))
    );
  };

  const handleProvisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    const newStaff: StaffProfile = {
      id: `usr-${Date.now()}`,
      email: email.trim(),
      full_name: name.trim(),
      role,
      department: 'Faculty',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setStaff(prev => [...prev, newStaff]);
    setName('');
    setEmail('');
    setProvisionModalOpen(false);
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

  // Staff Table Columns
  const staffColumns: Column<StaffProfile>[] = [
    { header: 'Full Name', accessorKey: 'full_name', cell: s => <span className="font-bold text-slate-900 dark:text-slate-100">{s.full_name}</span> },
    { header: 'Institutional Email', accessorKey: 'email', cell: s => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{s.email}</span> },
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
    {
      header: 'Actions',
      cell: s => (
        <button
          onClick={() => toggleStaffStatus(s.id)}
          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
        >
          {s.is_active ? 'Deactivate' : 'Activate'}
        </button>
      ),
    },
  ];

  // Schedule Columns
  const scheduleColumns: Column<TeacherAssignment>[] = [
    { header: 'Assigned Teacher', accessorKey: 'teacher_name', cell: a => <span className="font-bold text-slate-900 dark:text-slate-100">{a.teacher_name}</span> },
    { header: 'Section', accessorKey: 'section_name', cell: a => <span className="font-bold text-brand-600 dark:text-brand-400">{a.section_name}</span> },
    { header: 'Subject Title', accessorKey: 'subject_title', cell: a => <span className="text-slate-800 dark:text-slate-200 font-medium">{a.subject_title}</span> },
    { header: 'Assigned Room', accessorKey: 'room_name', cell: a => <span className="text-slate-600 dark:text-slate-400">{a.room_name}</span> },
    { header: 'Teaching Days', accessorKey: 'schedule_day', cell: a => <span className="text-slate-600 dark:text-slate-400">{a.schedule_day}</span> },
    { header: 'Time Slot', cell: a => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{a.start_time} – {a.end_time}</span> },
  ];

  // If Teacher role, view only personal teaching schedule read-only
  if (!isAdmin) {
    const teacherAssignments = assignments.filter(a => a.teacher_id === user?.id || a.teacher_name === user?.full_name);
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-500" />
            My Teaching Schedule & Assigned Loads
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

  return (
    <div className="space-y-8">
      {/* Admin Section 1: Staff Provisioning */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-brand-500" />
              Staff Account Management & Provisioning
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Provision, deactivate, and audit institutional staff accounts for San Roque National High School.
            </p>
          </div>

          <button
            onClick={() => setProvisionModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-800 flex items-center gap-1.5 shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Provision Staff Account
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

      {/* Admin Section 2: Teaching Schedule Load Assignments */}
      <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-500" />
              Faculty Teaching Load & Schedule Assignments
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Map teachers to section, subject, room, and time slot schedules.
            </p>
          </div>

          <button
            onClick={() => setAssignmentModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white flex items-center gap-1.5 shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Assign Teaching Schedule
          </button>
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

      {/* Provision Staff Modal */}
      <Modal
        isOpen={provisionModalOpen}
        onClose={() => setProvisionModalOpen(false)}
        title="Provision Institutional Staff Account"
        subtitle="Staff accounts are provisioned by Admin. No public self-registration is allowed."
      >
        <form onSubmit={handleProvisionSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Full Staff Name</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ms. Elena Torres" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Institutional Email</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. e.torres@srnhs.edu.ph" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Role Permission</label>
            <select value={role} onChange={e => setRole(e.target.value as any)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
              <option value="teacher">Teacher (Faculty Scoped)</option>
              <option value="admin">School Administrator (Full System CRUD)</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setProvisionModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700">Provision Account</button>
          </div>
        </form>
      </Modal>

      {/* Assign Schedule Modal */}
      <Modal
        isOpen={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        title="Assign Teaching Load Schedule"
      >
        <form onSubmit={handleAssignmentSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Faculty Member</label>
            <select value={targetTeacherId} onChange={e => setTargetTeacherId(e.target.value)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
              {staff.filter(s => s.role === 'teacher').map(t => (
                <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Section</label>
              <input required type="text" value={sectionName} onChange={e => setSectionName(e.target.value)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Subject</label>
              <input required type="text" value={subjectTitle} onChange={e => setSubjectTitle(e.target.value)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Room</label>
              <input required type="text" value={roomName} onChange={e => setRoomName(e.target.value)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Schedule Days</label>
              <input required type="text" value={scheduleDay} onChange={e => setScheduleDay(e.target.value)} placeholder="Mon, Wed, Fri" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Time Slot</label>
            <input required type="text" value={timeRange} onChange={e => setTimeRange(e.target.value)} placeholder="08:00 AM - 09:00 AM" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setAssignmentModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700">Save Assignment</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
