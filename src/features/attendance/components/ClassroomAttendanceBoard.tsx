import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AttendanceStatus } from '@/types/domain.types';
import { AttendanceBadge } from '@/components/ui/StatusBadge';
import { useRole } from '@/hooks/useRole';
import { Check, Clock, X, AlertCircle, BookOpen, Users } from 'lucide-react';
import { mockNotificationAdapter } from '@/features/notifications/services/MockNotificationAdapter';
import { cn } from '@/lib/utils';

interface StudentAttendanceRow {
  student_id: string;
  name: string;
  lrn: string;
  photo?: string;
  status: AttendanceStatus;
  lastScanTime?: string;
  markedBy?: string;
  guardianPhone: string;
}

const SAMPLE_SECTION_STUDENTS: Record<string, StudentAttendanceRow[]> = {
  'sec-101': [
    { student_id: 'std-101', name: 'Juan Carlos Garcia', lrn: '109823456701', photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80', status: 'present', lastScanTime: '07:15 AM', guardianPhone: '+639171234567' },
    { student_id: 'std-102', name: 'Sophia Nicole Reyes', lrn: '109823456702', photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', status: 'present', lastScanTime: '07:00 AM', guardianPhone: '+639189876543' },
    { student_id: 'std-105', name: 'Mark Anthony Ramos', lrn: '109823456705', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', status: 'absent', guardianPhone: '+639195551212' },
  ],
  'sec-102': [
    { student_id: 'std-103', name: 'Angelo Gabriel Mendoza', lrn: '109823456703', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', status: 'present', lastScanTime: '07:45 AM', guardianPhone: '+639194443322' },
    { student_id: 'std-104', name: 'Samantha Claire Santos', lrn: '109823456704', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', status: 'late', lastScanTime: '08:15 AM', guardianPhone: '+639178889900' },
  ],
};

const STATUS_ACTIONS: { status: AttendanceStatus; label: string; icon: React.ReactNode; active: string; inactive: string }[] = [
  { status: 'present', label: 'Present', icon: <Check className="w-3.5 h-3.5" />, active: 'bg-emerald-500 text-white shadow-sm', inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'late',    label: 'Late',    icon: <Clock className="w-3.5 h-3.5" />, active: 'bg-amber-500 text-white shadow-sm',   inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'absent',  label: 'Absent',  icon: <X className="w-3.5 h-3.5" />,     active: 'bg-rose-500 text-white shadow-sm',    inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'excused', label: 'Excused', icon: <AlertCircle className="w-3.5 h-3.5" />, active: 'bg-sky-500 text-white shadow-sm', inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
];

export const ClassroomAttendanceBoard: React.FC = () => {
  const { user } = useRole();
  const [selectedSection, setSelectedSection] = useState('sec-101');
  const [selectedSubject, setSelectedSubject] = useState('General Mathematics');
  const [rows, setRows] = useState<Record<string, StudentAttendanceRow[]>>(SAMPLE_SECTION_STUDENTS);

  const currentStudents = rows[selectedSection] || [];
  const summary = {
    present: currentStudents.filter(s => s.status === 'present').length,
    late:    currentStudents.filter(s => s.status === 'late').length,
    absent:  currentStudents.filter(s => s.status === 'absent').length,
    excused: currentStudents.filter(s => s.status === 'excused').length,
  };

  const handleStatusChange = async (studentId: string, newStatus: AttendanceStatus) => {
    setRows(prev => {
      const sectionRows = prev[selectedSection] || [];
      return {
        ...prev,
        [selectedSection]: sectionRows.map(r =>
          r.student_id === studentId
            ? { ...r, status: newStatus, markedBy: user?.full_name }
            : r
        ),
      };
    });

    if (newStatus === 'absent') {
      const student = currentStudents.find(s => s.student_id === studentId);
      if (student) {
        await mockNotificationAdapter.sendAlert({
          student_id: student.student_id,
          student_name: student.name,
          guardian_phone: student.guardianPhone,
          message: `[SRNHS Alert] ${student.name} was marked Unexcused Absent for ${selectedSubject} on ${new Date().toLocaleDateString()}.`,
          event_type: 'unexcused_absence',
        });
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Classroom Attendance Board</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Pre-filled from facial recognition. Your manual mark is always the source of truth.
          </p>
        </div>

        {/* Section + Subject selectors */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-3 py-2 shadow-card-sm transition-colors">
            <Users className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <select
              value={selectedSection}
              onChange={e => setSelectedSection(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="sec-101" className="dark:bg-slate-900">Grade 10 – Sampaguita</option>
              <option value="sec-102" className="dark:bg-slate-900">Grade 11 – STEM A</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-3 py-2 shadow-card-sm transition-colors">
            <BookOpen className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="General Mathematics" className="dark:bg-slate-900">General Mathematics</option>
              <option value="Research 1" className="dark:bg-slate-900">Research 1</option>
              <option value="Panitikang Pilipino" className="dark:bg-slate-900">Panitikang Pilipino</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Present', count: summary.present, lightBg: 'bg-gradient-to-br from-[#D4A373] to-[#C68B59] text-amber-950 border-[#ba8b5b]', dot: 'bg-amber-950' },
          { label: 'Late',    count: summary.late,    lightBg: 'bg-gradient-to-br from-[#DDA15E] to-[#C68B59] text-amber-950 border-[#c28846]', dot: 'bg-amber-900' },
          { label: 'Absent',  count: summary.absent,  lightBg: 'bg-gradient-to-br from-[#C68B59] to-[#836452] text-amber-50 border-[#806143]',   dot: 'bg-amber-100' },
          { label: 'Excused', count: summary.excused, lightBg: 'bg-gradient-to-br from-[#E6CCB2] to-[#D4A373] text-amber-950 border-[#d1b397]', dot: 'bg-amber-800' },
        ].map(s => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              'rounded-2xl p-4 shadow-card border transition-all',
              'dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100',
              s.lightBg
            )}
          >
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', s.dot)} />
              {s.label}
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-slate-100 mt-1">{s.count}</div>
          </motion.div>
        ))}
      </div>

      {/* Attendance Roster Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
            {selectedSection === 'sec-101' ? 'Grade 10 – Sampaguita' : 'Grade 11 – STEM A'} · {selectedSubject}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[680px]">
            <thead className="bg-slate-50 dark:bg-slate-800/80">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                {['Student Name', 'LRN', 'Face Recognition Assist', 'Current Status', 'Mark Attendance'].map(h => (
                  <th key={h} className="px-5 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
              {currentStudents.map((student, i) => (
                <motion.tr
                  key={student.student_id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {student.photo && (
                        <img src={student.photo} alt={student.name} className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                      )}
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">{student.lrn}</td>
                  <td className="px-5 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {student.lastScanTime ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {student.lastScanTime} — Camera
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-600">No scan detected</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <AttendanceBadge status={student.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-2xl p-1 gap-0.5 border border-slate-200/50 dark:border-slate-700/50">
                      {STATUS_ACTIONS.map(action => (
                        <button
                          key={action.status}
                          onClick={() => handleStatusChange(student.student_id, action.status)}
                          title={action.label}
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all',
                            student.status === action.status ? action.active : action.inactive
                          )}
                        >
                          {action.icon}
                          <span className="hidden sm:inline">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
