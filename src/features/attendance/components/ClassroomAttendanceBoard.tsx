import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AttendanceStatus, RecognitionEvent } from '@/types/domain.types';
import { AttendanceBadge } from '@/components/ui/StatusBadge';
import { useRole } from '@/hooks/useRole';
import { Check, Clock, X, AlertCircle, BookOpen, Users, RefreshCw } from 'lucide-react';
import { mockNotificationAdapter } from '@/features/notifications/services/MockNotificationAdapter';
import { supabaseRecognitionAdapter } from '../services/SupabaseRecognitionAdapter';
import { fetchSections, fetchSectionRoster } from '@/features/faceRegistration/api';
import { Section, Student } from '@/features/faceRegistration/types';
import { Subject } from '@/types/domain.types';
import { cn } from '@/lib/utils';

const LS_SUBJECTS = 'srnhs_academics_subjects_v1';
function getStoredSubjects(): Subject[] {
  try {
    const raw = localStorage.getItem(LS_SUBJECTS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

interface StudentAttendanceRow {
  student_id: string;
  name: string;
  lrn: string;
  photo?: string;
  status: AttendanceStatus;
  lastScanTime?: string;
  lastScanEvent?: RecognitionEvent;
  markedBy?: string;
  guardianPhone: string;
}

const OVERRIDES_STORAGE_KEY = 'srnhs_attendance_teacher_overrides_v1';

function loadStoredOverrides(): Record<string, { status: AttendanceStatus; markedBy?: string }> {
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveStoredOverrides(overrides: Record<string, { status: AttendanceStatus; markedBy?: string }>) {
  try {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {}
}

const STATUS_ACTIONS: { status: AttendanceStatus; label: string; icon: React.ReactNode; active: string; inactive: string }[] = [
  { status: 'present', label: 'Present', icon: <Check className="w-3.5 h-3.5" />, active: 'bg-emerald-500 text-white shadow-sm', inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'late',    label: 'Late',    icon: <Clock className="w-3.5 h-3.5" />, active: 'bg-amber-500 text-white shadow-sm',   inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'absent',  label: 'Absent',  icon: <X className="w-3.5 h-3.5" />,     active: 'bg-rose-500 text-white shadow-sm',    inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'excused', label: 'Excused', icon: <AlertCircle className="w-3.5 h-3.5" />, active: 'bg-sky-500 text-white shadow-sm', inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
];

export const ClassroomAttendanceBoard: React.FC = () => {
  const { user, isTeacher, isAdmin } = useRole();
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [roster, setRoster] = useState<Student[]>([]);
  const [scanEvents, setScanEvents] = useState<RecognitionEvent[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Record<string, { status: AttendanceStatus; markedBy?: string }>>(loadStoredOverrides());
  const [isLoading, setIsLoading] = useState(true);

  // Filter sections by teacher ownership (Requirement 4)
  const authorizedSections = React.useMemo(() => {
    if (isAdmin) return sections;
    return sections.filter(sec => {
      const sTeacherId = sec.teacherId || (sec as any).adviser_id;
      const sTeacherName = sec.teacherName || (sec as any).adviser_name;
      if (sTeacherId && user?.id && sTeacherId === user.id) return true;
      if (sTeacherName && user?.full_name && sTeacherName.toLowerCase().includes(user.full_name.toLowerCase())) return true;
      if (!sTeacherId && !sTeacherName) return true;
      return false;
    });
  }, [sections, isAdmin, user]);

  // Load sections and subjects on mount
  useEffect(() => {
    fetchSections().then(data => {
      setSections(data);
      if (!selectedSection) {
        if (isTeacher) {
          const firstAuthorized = data.find(s => {
            const tId = s.teacherId || (s as any).adviser_id;
            const tName = s.teacherName || (s as any).adviser_name;
            return !tId || tId === user?.id || (user?.full_name && tName?.toLowerCase().includes(user.full_name.toLowerCase()));
          });
          setSelectedSection(firstAuthorized ? firstAuthorized.id : (data[0]?.id || ''));
        } else {
          setSelectedSection('all');
        }
      }
    });
    const stored = getStoredSubjects();
    setSubjects(stored);
    if (stored.length > 0) {
      setSelectedSubject(stored[0]!.title);
    }
  }, [isTeacher, user]);


  // Fetch roster when selected section changes
  const loadRoster = useCallback(async (secId: string) => {
    setIsLoading(true);
    try {
      const students = await fetchSectionRoster(secId);
      setRoster(students);
    } catch (err) {
      console.warn('Could not load section roster:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSection) {
      loadRoster(selectedSection);
    }
  }, [selectedSection, loadRoster]);

  // Load scan events and subscribe to real-time events
  useEffect(() => {
    supabaseRecognitionAdapter.getEvents().then(setScanEvents);

    const unsubscribe = supabaseRecognitionAdapter.subscribeToEvents(newEvent => {
      setScanEvents(prev => [newEvent, ...prev.filter(e => e.id !== newEvent.id)]);
    });

    return () => unsubscribe();
  }, []);

  // Sync / refresh both roster and events
  const handleRefresh = async () => {
    setIsLoading(true);
    if (selectedSection) {
      await loadRoster(selectedSection);
    }
    const events = await supabaseRecognitionAdapter.getEvents();
    setScanEvents(events);
    setIsLoading(false);
  };

  // Build rows combining roster, camera scan events, and manual teacher overrides
  const rows: StudentAttendanceRow[] = roster.map(student => {
    // Find latest scan event for this student today
    const studentEvent = scanEvents.find(
      e => e.student_id === student.id ||
           (e.student_lrn && e.student_lrn === student.studentNumber) ||
           (e.student_name && student.name && e.student_name.toLowerCase() === student.name.toLowerCase())
    );

    const override = manualOverrides[student.id];

    let status: AttendanceStatus = 'absent';
    let lastScanTime: string | undefined = undefined;

    if (override) {
      status = override.status;
    } else if (studentEvent) {
      const scanDate = new Date(studentEvent.captured_at);
      lastScanTime = scanDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      // If scanned after 8:00 AM, mark as late, otherwise present
      const scanHour = scanDate.getHours();
      const scanMin = scanDate.getMinutes();
      const isLate = scanHour > 8 || (scanHour === 8 && scanMin > 0);
      status = isLate ? 'late' : 'present';
    }

    return {
      student_id: student.id,
      name: student.name,
      lrn: student.studentNumber,
      photo: student.registeredPhotos?.front || student.photoUrl,
      status,
      lastScanTime: lastScanTime || (studentEvent ? new Date(studentEvent.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined),
      lastScanEvent: studentEvent,
      markedBy: override?.markedBy,
      guardianPhone: student.guardianPhone || '+639171234567',
    };
  });

  const summary = {
    present: rows.filter(s => s.status === 'present').length,
    late:    rows.filter(s => s.status === 'late').length,
    absent:  rows.filter(s => s.status === 'absent').length,
    excused: rows.filter(s => s.status === 'excused').length,
  };

  const handleStatusChange = async (studentId: string, newStatus: AttendanceStatus) => {
    const updated = {
      ...manualOverrides,
      [studentId]: { status: newStatus, markedBy: user?.full_name || 'Teacher' },
    };
    setManualOverrides(updated);
    saveStoredOverrides(updated);

    if (newStatus === 'absent') {
      const student = rows.find(s => s.student_id === studentId);
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

  const selectedSectionObj = sections.find(s => s.id === selectedSection);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Classroom Attendance Board</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50 text-[11px] font-black">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected to Turnstiles
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Pre-filled automatically from gate facial recognition time-ins. Your manual mark is always the source of truth.
          </p>
        </div>

        {/* Section + Subject selectors & Sync button */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-800 px-3.5 py-2 shadow-card-sm transition-all">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {authorizedSections.length > 0 ? (
              <select
                value={selectedSection}
                onChange={e => setSelectedSection(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                {isAdmin && (
                  <option value="all" className="dark:bg-slate-900">
                    All Sections (All Students)
                  </option>
                )}
                {authorizedSections.map(sec => (
                  <option key={sec.id} value={sec.id} className="dark:bg-slate-900">
                    {sec.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                <Users className="w-3.5 h-3.5" />
                {isTeacher ? 'No assigned sections' : 'All Enrolled Students'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-800 px-3.5 py-2 shadow-card-sm transition-all">
            <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {subjects.length > 0 ? (
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                {subjects.map(sub => (
                  <option key={sub.id} value={sub.title} className="dark:bg-slate-900">
                    {sub.title}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                No subjects assigned
              </span>
            )}
          </div>

          <button
            onClick={handleRefresh}
            className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/80 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-card-sm cursor-pointer shrink-0"
            title="Refresh attendance from camera scans"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {[
          {
            label: 'Present',
            count: summary.present,
            subtext: 'Turnstile verified on time',
            icon: <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />,
            iconBg: 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.25)]',
            cardBg: 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/25 dark:border-emerald-800/40',
            dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]',
            tag: 'text-emerald-700 dark:text-emerald-300',
            glow: 'glow-emerald',
          },
          {
            label: 'Late',
            count: summary.late,
            subtext: 'Time-in after 8:00 AM',
            icon: <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 stroke-[2.5]" />,
            iconBg: 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
            cardBg: 'bg-amber-500/10 dark:bg-amber-950/30 border-amber-500/25 dark:border-amber-800/40',
            dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]',
            tag: 'text-amber-700 dark:text-amber-300',
            glow: 'glow-amber',
          },
          {
            label: 'Absent',
            count: summary.absent,
            subtext: 'No entry scan detected',
            icon: <X className="w-5 h-5 text-rose-600 dark:text-rose-400 stroke-[2.5]" />,
            iconBg: 'bg-rose-500/15 dark:bg-rose-500/20 border-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.25)]',
            cardBg: 'bg-rose-500/10 dark:bg-rose-950/30 border-rose-500/25 dark:border-rose-800/40',
            dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]',
            tag: 'text-rose-700 dark:text-rose-300',
            glow: 'glow-rose',
          },
          {
            label: 'Excused',
            count: summary.excused,
            subtext: 'Authorized school leave',
            icon: <AlertCircle className="w-5 h-5 text-sky-600 dark:text-sky-400 stroke-[2.5]" />,
            iconBg: 'bg-sky-500/15 dark:bg-sky-500/20 border-sky-500/20 shadow-[0_0_12px_rgba(14,165,233,0.25)]',
            cardBg: 'bg-sky-500/10 dark:bg-sky-950/30 border-sky-500/25 dark:border-sky-800/40',
            dot: 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.7)]',
            tag: 'text-sky-700 dark:text-sky-300',
            glow: 'glow-sky',
          },
        ].map(s => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              'rounded-3xl p-5 border backdrop-blur-sm transition-all flex items-center justify-between gap-3',
              s.cardBg,
              s.glow
            )}
          >
            <div className="min-w-0 flex-1">
              <div className={cn('text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5', s.tag)}>
                <span className={cn('w-2 h-2 rounded-full shrink-0', s.dot)} />
                <span className="truncate">{s.label}</span>
              </div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight mt-1.5">
                {s.count}
              </div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1 truncate">
                {s.subtext}
              </div>
            </div>

            <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border', s.iconBg)}>
              {s.icon}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Attendance Roster Table */}
      <div className="bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm shadow-card overflow-hidden transition-all">
        <div className="px-6 py-5 border-b border-slate-200/60 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
              {selectedSection === 'all'
                ? 'All Sections'
                : selectedSectionObj
                ? selectedSectionObj.name
                : 'Classroom Roster'}
              {selectedSubject ? ` · ${selectedSubject}` : ''}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {rows.length} Enrolled Students
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            <RefreshCw className="w-4 h-4 text-emerald-500" />
            <span>Turnstile Auto-Sync Active</span>
          </div>
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 text-sm font-medium">
                    No students enrolled in this section yet.
                  </td>
                </tr>
              ) : (
                rows.map((student, i) => (
                  <motion.tr
                    key={student.student_id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {student.photo ? (
                          <img src={student.photo} alt={student.name} className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                            {student.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">{student.lrn}</td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {student.lastScanTime ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          {student.lastScanTime} — {student.lastScanEvent?.room_name || 'Camera Turnstile'}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">No scan detected</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-0.5">
                        <AttendanceBadge status={student.status} />
                        {student.markedBy && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            Manual: {student.markedBy}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-2xl p-1 gap-0.5 border border-slate-200/50 dark:border-slate-700/50">
                        {STATUS_ACTIONS.map(action => (
                          <button
                            key={action.status}
                            onClick={() => handleStatusChange(student.student_id, action.status)}
                            title={action.label}
                            className={cn(
                              'flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer',
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
