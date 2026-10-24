import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { fetchGuardianLinkedStudents } from '@/features/students/api';
import { Student, Guardian, Announcement } from '@/types/domain.types';
import { LoadingSpinner } from '@/components/ui/StateViews';
import {
  Users,
  Calendar,
  GraduationCap,
  Bell,
  LogOut,
  ChevronRight,
  FileText,
  Download,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ActiveTab = 'attendance' | 'grades' | 'announcements';
type DateFilter = 'all' | 'today' | 'week' | 'month';

interface GateEvent {
  id: string;
  event_type: 'entry' | 'exit';
  timestamp: string;
  source: string;
}

interface ClassAttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  subject_title: string;
  remarks?: string;
}

interface EventAttendanceRecord {
  id: string;
  event_title: string;
  event_date: string;
  venue?: string;
  checked_in_at: string;
  method: string;
}

interface GradeSubjectRow {
  subject_id: string;
  subject_title: string;
  subject_code?: string;
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
  q4?: number | null;
  final_rating?: number | null;
  remark?: 'Passed' | 'Failed' | 'Incomplete';
}

export const GuardianPortalPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('attendance');
  const [childrenList, setChildrenList] = useState<Array<{ student: Student; guardian: Guardian }>>([]);
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Attendance state
  const [gateEvents, setGateEvents] = useState<GateEvent[]>([]);
  const [classRecords, setClassRecords] = useState<ClassAttendanceRecord[]>([]);
  const [eventRecords, setEventRecords] = useState<EventAttendanceRecord[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Grades state
  const [gradesRows, setGradesRows] = useState<GradeSubjectRow[]>([]);
  const [gradesLoading, setGradesLoading] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  // 1. Fetch linked students
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const list = await fetchGuardianLinkedStudents();
        setChildrenList(list);
      } catch (e) {
        console.warn('Failed to load linked students:', e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [user]);

  const activeChild = childrenList[selectedChildIndex]?.student;
  const activeGuardian = childrenList[selectedChildIndex]?.guardian;

  // 2. Fetch Attendance for active child
  useEffect(() => {
    const studentId = activeChild?.id;
    if (!studentId) return;

    async function loadAttendance() {
      if (!supabase || !isSupabaseConfigured) {
        // Fallback sample data for preview
        setGateEvents([
          { id: '1', event_type: 'entry', timestamp: new Date().toISOString(), source: 'Gate Camera 1' },
        ]);
        setClassRecords([
          { id: '1', date: new Date().toISOString().split('T')[0]!, status: 'present', subject_title: 'Mathematics' },
        ]);
        setEventRecords([]);
        return;
      }

      try {
        // Gate attendance
        const { data: gateData } = await supabase
          .from('recognition_events')
          .select('id, event_type, timestamp, source')
          .eq('student_id', studentId)
          .order('timestamp', { ascending: false })
          .limit(50);

        if (gateData) setGateEvents(gateData as GateEvent[]);

        // Classroom attendance
        const { data: classData } = await supabase
          .from('classroom_attendance')
          .select('id, date, status, remarks, subjects(title, name)')
          .eq('student_id', studentId)
          .order('date', { ascending: false })
          .limit(50);

        if (classData) {
          setClassRecords(
            classData.map((r: any) => ({
              id: r.id,
              date: r.date,
              status: r.status,
              remarks: r.remarks,
              subject_title: r.subjects?.title || r.subjects?.name || 'Subject',
            }))
          );
        }

        // Event attendance
        const { data: eventData } = await supabase
          .from('event_attendance')
          .select('id, checked_in_at, method, school_events(title, event_date, venue)')
          .eq('student_id', studentId)
          .order('checked_in_at', { ascending: false })
          .limit(50);

        if (eventData) {
          setEventRecords(
            eventData.map((e: any) => ({
              id: e.id,
              event_title: e.school_events?.title || 'School Event',
              event_date: e.school_events?.event_date || '',
              venue: e.school_events?.venue,
              checked_in_at: e.checked_in_at,
              method: e.method,
            }))
          );
        }
      } catch (err) {
        console.warn('Attendance load error:', err);
      }
    }

    loadAttendance();
  }, [activeChild]);

  // 3. Fetch Published Grades
  useEffect(() => {
    const studentId = activeChild?.id;
    if (!studentId) return;

    async function loadGrades() {
      if (!supabase || !isSupabaseConfigured) {
        setGradesRows([
          {
            subject_id: 'sub-1',
            subject_title: 'General Mathematics',
            subject_code: 'GEN-MATH',
            q1: 88,
            q2: 90,
            q3: 89,
            q4: 92,
            final_rating: 90,
            remark: 'Passed',
          },
          {
            subject_id: 'sub-2',
            subject_title: 'Science & Technology',
            subject_code: 'SCI-TECH',
            q1: 85,
            q2: 87,
            q3: 86,
            q4: 89,
            final_rating: 87,
            remark: 'Passed',
          },
        ]);
        return;
      }

      try {
        setGradesLoading(true);
        // Only published grades are accessible to guardians by RLS
        const { data, error } = await supabase
          .from('grades')
          .select('id, quarter, grade, is_published, subjects(id, title, name, code)')
          .eq('student_id', studentId)
          .eq('is_published', true);

        if (error || !data) {
          setGradesRows([]);
          return;
        }

        // Aggregate by subject
        const map = new Map<string, GradeSubjectRow>();
        for (const item of data) {
          const sub = (item as any).subjects;
          const subId = sub?.id || 'unknown';
          const title = sub?.title || sub?.name || 'Subject';
          const code = sub?.code || '';

          if (!map.has(subId)) {
            map.set(subId, {
              subject_id: subId,
              subject_title: title,
              subject_code: code,
              q1: null,
              q2: null,
              q3: null,
              q4: null,
              final_rating: null,
            });
          }

          const existing = map.get(subId)!;
          if (item.quarter === 1) existing.q1 = item.grade;
          if (item.quarter === 2) existing.q2 = item.grade;
          if (item.quarter === 3) existing.q3 = item.grade;
          if (item.quarter === 4) existing.q4 = item.grade;
        }

        // Calculate finals
        const rows: GradeSubjectRow[] = Array.from(map.values()).map(r => {
          const quarters = [r.q1, r.q2, r.q3, r.q4].filter((q): q is number => typeof q === 'number');
          if (quarters.length === 4) {
            const avg = Math.round(quarters.reduce((a, b) => a + b, 0) / 4);
            return {
              ...r,
              final_rating: avg,
              remark: avg >= 75 ? 'Passed' : 'Failed',
            };
          }
          return { ...r, final_rating: null, remark: 'Incomplete' };
        });

        setGradesRows(rows);
      } catch (e) {
        console.warn('Grades load error:', e);
      } finally {
        setGradesLoading(false);
      }
    }

    loadGrades();
  }, [activeChild]);

  // 4. Fetch Announcements targeted to Guardian
  useEffect(() => {
    async function loadAnnouncements() {
      if (!supabase || !isSupabaseConfigured) {
        setAnnouncements([
          {
            id: 'ann-1',
            title: 'Second Quarter Parents-Teachers Conference (PTC)',
            body: 'Dear Parents and Guardians, the Q2 PTC will be held this coming Friday at 1:00 PM in the School Gymnasium. Please be on time.',
            audience_type: 'school',
            send_sms: true,
            created_at: new Date().toISOString(),
            is_read: false,
          },
        ]);
        return;
      }

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
            created_at,
            announcement_attachments(id, file_name, storage_path, mime, size),
            announcement_recipients(read_at, guardian_id)
          `)
          .order('created_at', { ascending: false });

        if (!error && data) {
          const mapped: Announcement[] = data.map((row: any) => {
            const recipient = row.announcement_recipients?.find(
              (r: any) => r.guardian_id === activeGuardian?.id
            );
            return {
              id: row.id,
              title: row.title,
              body: row.body,
              audience_type: row.audience_type,
              audience_id: row.audience_id,
              send_sms: row.send_sms,
              created_at: row.created_at,
              attachments: row.announcement_attachments || [],
              is_read: Boolean(recipient?.read_at),
            };
          });
          setAnnouncements(mapped);
        }
      } catch (err) {
        console.warn('Announcements fetch error:', err);
      }
    }

    loadAnnouncements();
  }, [activeGuardian]);

  // Mark announcement as read
  const handleOpenAnnouncement = async (ann: Announcement) => {
    setSelectedAnnouncement(ann);
    if (!ann.is_read && activeGuardian && supabase && isSupabaseConfigured) {
      try {
        await supabase
          .from('announcement_recipients')
          .update({ read_at: new Date().toISOString() })
          .eq('announcement_id', ann.id)
          .eq('guardian_id', activeGuardian.id);

        setAnnouncements(prev =>
          prev.map(a => (a.id === ann.id ? { ...a, is_read: true } : a))
        );
      } catch {}
    }
  };

  // Filter attendance by date
  const filteredClassRecords = useMemo(() => {
    if (dateFilter === 'all') return classRecords;
    const now = new Date();
    return classRecords.filter(r => {
      const d = new Date(r.date);
      if (dateFilter === 'today') {
        return d.toDateString() === now.toDateString();
      }
      if (dateFilter === 'week') {
        const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
        return diffDays <= 7;
      }
      if (dateFilter === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [classRecords, dateFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const present = classRecords.filter(r => r.status === 'present').length;
    const late = classRecords.filter(r => r.status === 'late').length;
    const absent = classRecords.filter(r => r.status === 'absent').length;
    const excused = classRecords.filter(r => r.status === 'excused').length;
    const gateCount = gateEvents.length;

    const completedFinals = gradesRows
      .map(r => r.final_rating)
      .filter((n): n is number => typeof n === 'number');

    const genAvg = completedFinals.length > 0
      ? Math.round(completedFinals.reduce((a, b) => a + b, 0) / completedFinals.length)
      : null;

    return { present, late, absent, excused, gateCount, genAvg };
  }, [classRecords, gateEvents, gradesRows]);

  const unreadAnnouncementsCount = announcements.filter(a => !a.is_read).length;

  if (loading) {
    return <LoadingSpinner label="Loading your parent portal..." />;
  }

  if (childrenList.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Users className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white">No Linked Students Found</h2>
          <p className="text-xs text-slate-400">
            Your account is verified, but has not yet been linked to a student record. Please contact your section adviser to complete verification.
          </p>
          <button
            onClick={() => logout()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-md shadow-teal-900/30">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-white">SRNHS Parent Portal</h1>
            <p className="text-[10px] text-teal-400 font-medium">Official DepEd Monitoring Service</p>
          </div>
        </div>

        {/* Child Selector Dropdown */}
        <div className="flex items-center gap-3">
          {childrenList.length > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-slate-400 text-[11px]">Child:</span>
              <select
                value={selectedChildIndex}
                onChange={e => setSelectedChildIndex(Number(e.target.value))}
                className="bg-transparent font-bold text-white focus:outline-none cursor-pointer"
              >
                {childrenList.map((c, idx) => (
                  <option key={c.student.id} value={idx} className="bg-slate-900 text-white">
                    {c.student.first_name} {c.student.last_name} ({c.student.section_name})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            id="guardian-logout-btn"
            onClick={() => logout()}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Child Information Header Card */}
        {activeChild && (
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-teal-950 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-lg">
                {activeChild.first_name[0]}{activeChild.last_name[0]}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-black text-white">
                    {activeChild.first_name} {activeChild.middle_name ? `${activeChild.middle_name[0]}. ` : ''}{activeChild.last_name} {activeChild.suffix || ''}
                  </h2>
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/30">
                    Grade {activeChild.grade_level} — {activeChild.section_name || 'Section'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-3 font-mono">
                  <span>LRN: {activeChild.lrn}</span>
                  {activeGuardian && (
                    <span className="text-slate-500">Linked: {activeGuardian.relationship}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Stat Pill */}
            {stats.genAvg !== null && (
              <div className="bg-slate-800/80 border border-slate-700/80 px-4 py-2.5 rounded-2xl text-center self-start sm:self-auto">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">General Average</span>
                <span className={cn('text-xl font-black', stats.genAvg >= 75 ? 'text-emerald-400' : 'text-rose-400')}>
                  {stats.genAvg}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('attendance')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer',
              activeTab === 'attendance'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            )}
          >
            <Calendar className="w-4 h-4" />
            Attendance History
          </button>

          <button
            onClick={() => setActiveTab('grades')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer',
              activeTab === 'grades'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            )}
          >
            <GraduationCap className="w-4 h-4" />
            Academic Grades
          </button>

          <button
            onClick={() => setActiveTab('announcements')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative cursor-pointer',
              activeTab === 'announcements'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            )}
          >
            <Bell className="w-4 h-4" />
            Memos &amp; Announcements
            {unreadAnnouncementsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                {unreadAnnouncementsCount}
              </span>
            )}
          </button>
        </div>

        {/* ── TAB 1: ATTENDANCE HISTORY ── */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Classes Present</span>
                <span className="text-2xl font-black text-emerald-400 mt-1 block">{stats.present}</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Tardiness / Late</span>
                <span className="text-2xl font-black text-amber-400 mt-1 block">{stats.late}</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Unexcused Absences</span>
                <span className="text-2xl font-black text-rose-400 mt-1 block">{stats.absent}</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Campus Gate Events</span>
                <span className="text-2xl font-black text-teal-400 mt-1 block">{stats.gateCount}</span>
              </div>
            </div>

            {/* Date Range Filter Bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Classroom Subject Attendance</h3>
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                {(['all', 'today', 'week', 'month'] as DateFilter[]).map(df => (
                  <button
                    key={df}
                    onClick={() => setDateFilter(df)}
                    className={cn(
                      'px-3 py-1 rounded-lg font-semibold transition-colors capitalize cursor-pointer',
                      dateFilter === df ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                    )}
                  >
                    {df === 'all' ? 'All Time' : df}
                  </button>
                ))}
              </div>
            </div>

            {/* Classroom Attendance Records */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
              {filteredClassRecords.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No attendance records logged for the selected timeframe.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {filteredClassRecords.map(r => (
                    <div key={r.id} className="p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors">
                      <div>
                        <div className="font-bold text-xs text-white">{r.subject_title}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{r.date}</div>
                        {r.remarks && <p className="text-[11px] text-slate-500 mt-0.5">{r.remarks}</p>}
                      </div>
                      <div>
                        <span
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border',
                            r.status === 'present' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                            r.status === 'late' && 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                            r.status === 'absent' && 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                            r.status === 'excused' && 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          )}
                        >
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Campus Gate Access Logs */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Campus Gate RFID / AI Scanner Logs</h3>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                {gateEvents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">No gate entry/exit events on record.</div>
                ) : (
                  <div className="divide-y divide-slate-800/80">
                    {gateEvents.map(ge => (
                      <div key={ge.id} className="p-3.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                              ge.event_type === 'entry'
                                ? 'bg-teal-500/20 text-teal-300'
                                : 'bg-slate-800 text-slate-400'
                            )}
                          >
                            Gate {ge.event_type}
                          </span>
                          <span className="text-slate-300 font-medium">{ge.source || 'Automated Gate'}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400">
                          {new Date(ge.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* School Events Attendance */}
            {eventRecords.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">School Event Participation</h3>
                <div className="rounded-2xl border border-slate-800 bg-slate-900 divide-y divide-slate-800/80 overflow-hidden">
                  {eventRecords.map(er => (
                    <div key={er.id} className="p-3.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white">{er.event_title}</div>
                        <div className="text-[11px] text-slate-400">{er.event_date} {er.venue ? `• ${er.venue}` : ''}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Attended
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: ACADEMIC GRADES ── */}
        {activeTab === 'grades' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Quarterly Academic Progress</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Showing official DepEd grades approved and published by faculty.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/30">
                Official DepEd Report Card
              </span>
            </div>

            {gradesLoading ? (
              <LoadingSpinner label="Loading official grades..." />
            ) : gradesRows.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-slate-500 space-y-2">
                <GraduationCap className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">No Published Grades Available</p>
                <p className="text-xs text-slate-500">
                  Grades for this school year have not yet been published by faculty members.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-[10px] font-bold uppercase">
                    <tr>
                      <th className="p-3.5">Learning Area / Subject</th>
                      <th className="p-3.5 text-center">Q1</th>
                      <th className="p-3.5 text-center">Q2</th>
                      <th className="p-3.5 text-center">Q3</th>
                      <th className="p-3.5 text-center">Q4</th>
                      <th className="p-3.5 text-center">Final</th>
                      <th className="p-3.5 text-center">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {gradesRows.map(row => (
                      <tr key={row.subject_id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5">
                          <span className="font-bold text-white block">{row.subject_title}</span>
                          {row.subject_code && (
                            <span className="text-[10px] font-mono text-slate-400">{row.subject_code}</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center font-mono font-semibold">
                          {row.q1 !== null && row.q1 !== undefined ? row.q1 : '—'}
                        </td>
                        <td className="p-3.5 text-center font-mono font-semibold">
                          {row.q2 !== null && row.q2 !== undefined ? row.q2 : '—'}
                        </td>
                        <td className="p-3.5 text-center font-mono font-semibold">
                          {row.q3 !== null && row.q3 !== undefined ? row.q3 : '—'}
                        </td>
                        <td className="p-3.5 text-center font-mono font-semibold">
                          {row.q4 !== null && row.q4 !== undefined ? row.q4 : '—'}
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-teal-400">
                          {row.final_rating !== null && row.final_rating !== undefined ? row.final_rating : '—'}
                        </td>
                        <td className="p-3.5 text-center">
                          {row.remark === 'Passed' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              Passed
                            </span>
                          )}
                          {row.remark === 'Failed' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              Failed
                            </span>
                          )}
                          {row.remark === 'Incomplete' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: ANNOUNCEMENTS & MEMOS ── */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              School Memos &amp; Parent Notifications ({announcements.length})
            </h3>

            {announcements.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-slate-500 space-y-2">
                <Bell className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">No Announcements</p>
                <p className="text-xs text-slate-500">You are all caught up on all official school announcements.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map(ann => (
                  <div
                    key={ann.id}
                    onClick={() => handleOpenAnnouncement(ann)}
                    className={cn(
                      'p-5 rounded-2xl border transition-all cursor-pointer',
                      ann.is_read
                        ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        : 'bg-teal-950/30 border-teal-500/40 hover:border-teal-400 shadow-md shadow-teal-950/20'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{ann.title}</h4>
                          {!ann.is_read && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-teal-500 text-slate-950">
                              New
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
                          {ann.body}
                        </p>
                        <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-2">
                          <span>{new Date(ann.created_at).toLocaleDateString()}</span>
                          {ann.attachments && ann.attachments.length > 0 && (
                            <span className="text-teal-400 flex items-center gap-1 font-medium">
                              <FileText className="w-3 h-3" /> {ann.attachments.length} attachment(s)
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Announcement Detail Modal */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
                Official School Memo
              </span>
              <h3 className="text-lg font-black text-white">{selectedAnnouncement.title}</h3>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Posted on {new Date(selectedAnnouncement.created_at).toLocaleString()}
              </p>
            </div>

            <div className="text-xs text-slate-200 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
              {selectedAnnouncement.body}
            </div>

            {selectedAnnouncement.attachments && selectedAnnouncement.attachments.length > 0 && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Attachments
                </span>
                {selectedAnnouncement.attachments.map(att => (
                  <div
                    key={att.id}
                    className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-teal-400 shrink-0" />
                      <span className="truncate text-white font-medium">{att.file_name}</span>
                    </div>
                    <a
                      href={att.storage_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors"
                    >
                      <Download className="w-3 h-3" /> View
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer transition-colors"
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
