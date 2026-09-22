import React, { useState, useEffect } from 'react';
import { useRole } from '@/hooks/useRole';
import { StaffProfile, TeacherAssignment, Room, Subject } from '@/types/domain.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { UserCheck, Calendar, Clock, Plus, CheckCircle, XCircle, Trash2, LayoutGrid, List } from 'lucide-react';
import {
  fetchStaffProfiles,
  createStaffProfile,
  toggleStaffStatus,
  fetchTeacherAssignments,
  createTeacherAssignment,
  deleteTeacherAssignment,
} from '@/features/faculty/api';
import { fetchRooms, fetchSubjects } from '@/features/academics/api';
import { getStoredSections } from '@/features/faceRegistration/api';
import { Section as FRSection } from '@/features/faceRegistration/types';

export const FacultyManager: React.FC = () => {
  const { isAdmin, user } = useRole();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<FRSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'timetable'>('table');

  // Provision Staff Modal State
  const [provisionModalOpen, setProvisionModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'teacher'>('teacher');
  const [department, setDepartment] = useState('Faculty');

  // Assignment Modal State
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [targetTeacherId, setTargetTeacherId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [scheduleDay, setScheduleDay] = useState('Monday, Wednesday, Friday');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');

  // Initial load
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [staffList, asgList, roomList, subjectList] = await Promise.all([
        fetchStaffProfiles(),
        fetchTeacherAssignments(),
        fetchRooms(),
        fetchSubjects(),
      ]);
      setStaff(staffList);
      setAssignments(asgList);
      setRooms(roomList);
      setSubjects(subjectList);

      const secList = getStoredSections();
      setSections(secList);

      if (staffList.length > 0 && !targetTeacherId) setTargetTeacherId(staffList[0]?.id || '');
      if (secList.length > 0 && !selectedSectionId) setSelectedSectionId(secList[0]?.id || '');
      if (subjectList.length > 0 && !selectedSubjectId) setSelectedSubjectId(subjectList[0]?.id || '');
      if (roomList.length > 0 && !selectedRoomId) setSelectedRoomId(roomList[0]?.id || '');
    } catch (err) {
      console.warn('[FacultyManager] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    const nextState = await toggleStaffStatus(id);
    setStaff(prev => prev.map(s => (s.id === id ? { ...s, is_active: nextState } : s)));
  };

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    const created = await createStaffProfile({
      email: email.trim(),
      full_name: name.trim(),
      role,
      department: department.trim() || 'Faculty',
    });

    setStaff(prev => [...prev, created]);
    setName('');
    setEmail('');
    setDepartment('Faculty');
    setProvisionModalOpen(false);
  };

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const teacher = staff.find(s => s.id === targetTeacherId);
    const section = sections.find(s => s.id === selectedSectionId);
    const subject = subjects.find(s => s.id === selectedSubjectId);
    const room = rooms.find(r => r.id === selectedRoomId);

    const created = await createTeacherAssignment({
      teacher_id: targetTeacherId,
      teacher_name: teacher?.full_name || 'Faculty Staff',
      section_id: selectedSectionId,
      section_name: section?.name || 'Assigned Section',
      subject_id: selectedSubjectId,
      subject_title: subject?.title || 'Subject Title',
      subject_code: subject?.code || 'SUBJ',
      room_id: selectedRoomId,
      room_name: room?.name || 'Assigned Room',
      schedule_day: scheduleDay,
      start_time: startTime,
      end_time: endTime,
    });

    setAssignments(prev => [...prev, created]);
    setAssignmentModalOpen(false);
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('Are you sure you want to remove this teaching assignment?')) return;
    await deleteTeacherAssignment(id);
    setAssignments(prev => prev.filter(a => a.id !== id));
  };

  // Staff Table Columns
  const staffColumns: Column<StaffProfile>[] = [
    { header: 'Full Name', accessorKey: 'full_name', cell: s => <span className="font-bold text-slate-900 dark:text-slate-100">{s.full_name}</span> },
    { header: 'Institutional Email', accessorKey: 'email', cell: s => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{s.email}</span> },
    { header: 'Department', accessorKey: 'department', cell: s => <span className="text-xs text-slate-600 dark:text-slate-400">{s.department || 'Faculty'}</span> },
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
          onClick={() => handleToggleStatus(s.id)}
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
    {
      header: 'Subject',
      cell: a => (
        <div>
          <div className="text-slate-900 dark:text-slate-100 font-semibold">{a.subject_title}</div>
          {a.subject_code && <div className="text-[10px] font-mono text-slate-500">{a.subject_code}</div>}
        </div>
      ),
    },
    { header: 'Assigned Room', accessorKey: 'room_name', cell: a => <span className="text-slate-600 dark:text-slate-400">{a.room_name}</span> },
    { header: 'Teaching Days', accessorKey: 'schedule_day', cell: a => <span className="text-slate-600 dark:text-slate-400">{a.schedule_day}</span> },
    { header: 'Time Slot', cell: a => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{a.start_time} – {a.end_time}</span> },
    {
      header: 'Actions',
      cell: a => (
        <button
          onClick={() => handleDeleteAssignment(a.id)}
          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
          title="Delete assignment"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  // If Teacher role, view only personal teaching schedule
  if (!isAdmin) {
    const teacherAssignments = assignments.filter(
      a => a.teacher_id === user?.id || (user?.full_name && a.teacher_name?.toLowerCase().includes(user.full_name.toLowerCase()))
    );
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
          columns={scheduleColumns.filter(c => c.header !== 'Actions')}
          keyExtractor={a => a.id}
          isLoading={isLoading}
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
          isLoading={isLoading}
          searchPlaceholder="Search staff by name, email, or department..."
          searchFilter={(s, q) =>
            s.full_name.toLowerCase().includes(q.toLowerCase()) ||
            s.email.toLowerCase().includes(q.toLowerCase()) ||
            (s.department || '').toLowerCase().includes(q.toLowerCase())
          }
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

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                  viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
              <button
                onClick={() => setViewMode('timetable')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                  viewMode === 'timetable' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Timetable
              </button>
            </div>

            <button
              onClick={() => setAssignmentModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white flex items-center gap-1.5 shadow-sm transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              Assign Teaching Schedule
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <DataTable
            data={assignments}
            columns={scheduleColumns}
            keyExtractor={a => a.id}
            isLoading={isLoading}
            searchPlaceholder="Search teaching assignments by teacher, section, or subject..."
            searchFilter={(a, q) =>
              Boolean(
                (a.teacher_name && a.teacher_name.toLowerCase().includes(q.toLowerCase())) ||
                (a.section_name && a.section_name.toLowerCase().includes(q.toLowerCase())) ||
                (a.subject_title && a.subject_title.toLowerCase().includes(q.toLowerCase())) ||
                (a.room_name && a.room_name.toLowerCase().includes(q.toLowerCase()))
              )
            }
          />
        ) : (
          /* Weekly Timetable Grid */
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => {
              const dayAssignments = assignments.filter(a =>
                a.schedule_day.toLowerCase().includes(day.toLowerCase()) ||
                (day === 'Monday' && a.schedule_day.toLowerCase().includes('mon')) ||
                (day === 'Tuesday' && a.schedule_day.toLowerCase().includes('tue')) ||
                (day === 'Wednesday' && a.schedule_day.toLowerCase().includes('wed')) ||
                (day === 'Thursday' && a.schedule_day.toLowerCase().includes('thu')) ||
                (day === 'Friday' && a.schedule_day.toLowerCase().includes('fri'))
              );
              return (
                <div key={day} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-card-sm flex flex-col gap-3">
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center justify-between">
                    <span>{day}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {dayAssignments.length} classes
                    </span>
                  </div>
                  {dayAssignments.length === 0 ? (
                    <div className="text-xs text-slate-400 py-6 text-center italic">No scheduled loads</div>
                  ) : (
                    <div className="space-y-2">
                      {dayAssignments.map(asg => (
                        <div key={asg.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-xs space-y-1">
                          <div className="font-bold text-brand-600 dark:text-brand-400">{asg.subject_title}</div>
                          <div className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">{asg.section_name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                            <span>{asg.room_name}</span>
                            <span className="font-mono">{asg.start_time} - {asg.end_time}</span>
                          </div>
                          <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 border-t border-slate-200/50 dark:border-slate-700/50 pt-1">
                            {asg.teacher_name}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Provision Staff Modal */}
      <Modal
        isOpen={provisionModalOpen}
        onClose={() => setProvisionModalOpen(false)}
        title="Provision Institutional Staff Account"
        subtitle="Staff accounts are provisioned by Admin. Credentials sync with staff profiles in database."
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Department</label>
              <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Science & ICT" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Role Permission</label>
              <select value={role} onChange={e => setRole(e.target.value as any)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                <option value="teacher">Teacher (Faculty Scoped)</option>
                <option value="admin">School Administrator (Full System CRUD)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setProvisionModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700">Provision Account</button>
          </div>
        </form>
      </Modal>

      {/* Assign Teaching Schedule Modal */}
      <Modal
        isOpen={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        title="Assign Faculty Teaching Load"
        subtitle="Map an active teacher to an academic section, subject curriculum, room, and schedule."
      >
        <form onSubmit={handleAssignmentSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Select Faculty Teacher</label>
            <select
              required
              value={targetTeacherId}
              onChange={e => setTargetTeacherId(e.target.value)}
              className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {staff.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Academic Section</label>
              <select
                required
                value={selectedSectionId}
                onChange={e => setSelectedSectionId(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {sections.map(sec => (
                  <option key={sec.id} value={sec.id}>{sec.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Subject</label>
              <select
                required
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {subjects.map(sub => (
                  <option key={sub.id} value={sub.id}>{sub.title} ({sub.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Assigned Room</label>
              <select
                required
                value={selectedRoomId}
                onChange={e => setSelectedRoomId(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {rooms.map(rm => (
                  <option key={rm.id} value={rm.id}>{rm.name} ({rm.building})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Schedule Days</label>
              <select
                value={scheduleDay}
                onChange={e => setScheduleDay(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="Monday, Wednesday, Friday">Mon, Wed, Fri</option>
                <option value="Tuesday, Thursday">Tue, Thu</option>
                <option value="Monday to Friday">Monday to Friday (Daily)</option>
                <option value="Saturday">Saturday</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Start Time</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">End Time</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setAssignmentModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-900 shadow-sm">Save Assignment</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
