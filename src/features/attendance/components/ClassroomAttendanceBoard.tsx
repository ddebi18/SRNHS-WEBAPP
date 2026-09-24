import React, { useState, useEffect, useCallback } from 'react';
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
  { status: 'present', label: 'Present', icon: <Check className="w-3.5 h-3.5" />, active: 'bg-green-600 text-white shadow-sm', inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'late',    label: 'Late',    icon: <Clock className="w-3.5 h-3.5" />, active: 'bg-amber-600 text-white shadow-sm',   inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'absent',  label: 'Absent',  icon: <X className="w-3.5 h-3.5" />,     active: 'bg-red-600 text-white shadow-sm',    inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
  { status: 'excused', label: 'Excused', icon: <AlertCircle className="w-3.5 h-3.5" />, active: 'bg-blue-600 text-white shadow-sm', inactive: 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700' },
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

  // Filter sections by teacher ownership
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
    if (stored.length > 0 && !selectedSubject && stored[0]) {
      setSelectedSubject(stored[0].title);
    }
  }, [isTeacher, user]);

  // Load roster when selected section changes
  useEffect(() => {
    if (!selectedSection) return;
    setIsLoading(true);
    fetchSectionRoster(selectedSection).then(students => {
      setRoster(students);
      setIsLoading(false);
    });
  }, [selectedSection]);

  // Load recent scan events (gate turnstiles) for today
  const loadScans = useCallback(async () => {
    try {
      const events = await supabaseRecognitionAdapter.getEvents({ limit: 100 });
      setScanEvents(events);
    } catch (err) {
      console.warn('Failed to load scan events:', err);
    }
  }, []);

  useEffect(() => {
    loadScans();
    const unsub = supabaseRecognitionAdapter.subscribeToEvents(evt => {
      setScanEvents(prev => [evt, ...prev]);
    });
    return () => unsub();
  }, [loadScans]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadScans();
    if (selectedSection) {
      const students = await fetchSectionRoster(selectedSection);
      setRoster(students);
    }
    setIsLoading(false);
  };

  // Build the attendance row for each student
  const rows: StudentAttendanceRow[] = React.useMemo(() => {
    const todayStr = new Date().toDateString();

    return roster.map(student => {
      const override = manualOverrides[student.id];

      const studentScans = scanEvents.filter(e => {
        const isMatch = e.student_id === student.id || e.student_name?.toLowerCase() === student.name.toLowerCase();
        const isToday = new Date(e.captured_at).toDateString() === todayStr;
        return isMatch && isToday;
      });

      const entryScan = studentScans.find(e => e.event_type === 'entry') || studentScans[0];

      let computedStatus: AttendanceStatus = 'absent';
      let lastScanTime: string | undefined;

      if (entryScan) {
        const scanDate = new Date(entryScan.captured_at);
        lastScanTime = scanDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const cutoff = new Date(scanDate);
        cutoff.setHours(8, 0, 0, 0);
        computedStatus = scanDate > cutoff ? 'late' : 'present';
      }

      const finalStatus = override ? override.status : computedStatus;

      return {
        student_id: student.id,
        name: student.name,
        lrn: student.studentNumber || (student as any).lrn || '',
        photo: student.photoUrl || (student as any).photo,
        status: finalStatus,
        lastScanTime,
        lastScanEvent: entryScan,
        markedBy: override?.markedBy,
        guardianPhone: student.guardianPhone || '',
      };
    });
  }, [roster, scanEvents, manualOverrides]);

  const summary = React.useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [rows]);

  const handleStatusChange = async (studentId: string, newStatus: AttendanceStatus) => {
    const updated = {
      ...manualOverrides,
      [studentId]: {
        status: newStatus,
        markedBy: user?.full_name ? `${user.full_name} (${isTeacher ? 'Teacher' : 'Admin'})` : 'Faculty',
      },
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
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 sm:p-5 border border-slate-200 dark:border-emerald-800/40 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="w-1 h-5 bg-primary rounded-sm" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-emerald-300">
                Student Attendance System
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-emerald-50 leading-tight">
              Classroom Attendance
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-emerald-300/80 mt-1 max-w-2xl">
              Review today&apos;s attendance and update student status for the selected class.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#06180F] rounded-md border border-slate-200 dark:border-emerald-800/40 px-3 py-2">
              <Users className="w-4 h-4 text-primary dark:text-emerald-400 shrink-0" />
              {authorizedSections.length > 0 ? (
                <select
                  value={selectedSection}
                  onChange={e => setSelectedSection(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
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
                <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Users className="w-3.5 h-3.5" />
                  {isTeacher ? 'No assigned sections' : 'All Enrolled Students'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#06180F] rounded-md border border-slate-200 dark:border-emerald-800/40 px-3 py-2">
              <BookOpen className="w-4 h-4 text-primary dark:text-emerald-400 shrink-0" />
              {subjects.length > 0 ? (
                <select
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  {subjects.map(sub => (
                    <option key={sub.id} value={sub.title} className="dark:bg-slate-900">
                      {sub.title}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  No subjects assigned
                </span>
              )}
            </div>

            <button
              onClick={handleRefresh}
              className="p-2.5 rounded-md bg-white dark:bg-[#0A2016] border border-slate-200 dark:border-emerald-800/40 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm cursor-pointer shrink-0"
              title="Refresh attendance from camera scans"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 dark:bg-emerald-800/40 border border-slate-200 dark:border-emerald-800/40 rounded-lg overflow-hidden">
        {[
          {
            label: 'Present',
            count: summary.present,
            subtext: 'Turnstile verified on time',
            accent: 'emerald',
            icon: <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
          },
          {
            label: 'Late',
            count: summary.late,
            subtext: 'Time-in after 8:00 AM',
            accent: 'amber',
            icon: <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
          },
          {
            label: 'Absent',
            count: summary.absent,
            subtext: 'No entry scan detected',
            accent: 'rose',
            icon: <X className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
          },
          {
            label: 'Excused',
            count: summary.excused,
            subtext: 'Authorized school leave',
            accent: 'blue',
            icon: <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
          },
        ].map(s => (
          <div
            key={s.label}
            className={cn(
              'p-3.5 bg-white dark:bg-[#0A2016] flex items-center justify-between gap-3',
              s.accent === 'emerald' && 'border-l-4 border-l-emerald-500',
              s.accent === 'amber' && 'border-l-4 border-l-amber-500',
              s.accent === 'rose' && 'border-l-4 border-l-rose-500',
              s.accent === 'blue' && 'border-l-4 border-l-blue-500'
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-300/80">
                {s.label}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-emerald-50 tracking-tight mt-0.5">
                {s.count}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-emerald-300/70 mt-1 truncate">
                {s.subtext}
              </div>
            </div>

            <div className={cn(
              'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
              s.accent === 'emerald' && 'bg-emerald-50 dark:bg-emerald-950/40',
              s.accent === 'amber' && 'bg-amber-50 dark:bg-amber-950/40',
              s.accent === 'rose' && 'bg-rose-50 dark:bg-rose-950/40',
              s.accent === 'blue' && 'bg-blue-50 dark:bg-blue-950/40'
            )}>
              {s.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Attendance Roster Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedSection === 'all'
                ? 'All Sections'
                : selectedSectionObj
                ? selectedSectionObj.name
                : 'Classroom Roster'}
              {selectedSubject ? `, ${selectedSubject}` : ''}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {rows.length} Enrolled Students
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <RefreshCw className="w-3.5 h-3.5 text-green-600" />
            <span>Turnstile auto-sync active</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[680px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {['Student Name', 'LRN', 'Face Recognition Assist', 'Current Status', 'Mark Attendance'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                    No students enrolled in this section yet.
                  </td>
                </tr>
              ) : (
                rows.map(student => {
                  const isAbsent = student.status === 'absent';
                  return (
                    <tr
                      key={student.student_id}
                      className={cn(
                        'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                        isAbsent && 'bg-red-50/30 dark:bg-red-950/10 border-l-4 border-l-red-500'
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {student.photo ? (
                            <img src={student.photo} alt={student.name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                              {student.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-xs text-slate-900 dark:text-slate-100">{student.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{student.lrn}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {student.lastScanTime ? (
                          <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            {student.lastScanTime} — {student.lastScanEvent?.room_name || 'Camera Turnstile'}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">No scan detected</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <AttendanceBadge status={student.status} />
                          {student.markedBy && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              Manual: {student.markedBy}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 gap-0.5 border border-slate-200 dark:border-slate-700">
                          {STATUS_ACTIONS.map(action => (
                            <button
                              key={action.status}
                              onClick={() => handleStatusChange(student.student_id, action.status)}
                              title={action.label}
                              className={cn(
                                'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                                student.status === action.status ? action.active : action.inactive
                              )}
                            >
                              {action.icon}
                              <span className="hidden sm:inline">{action.label}</span>
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
