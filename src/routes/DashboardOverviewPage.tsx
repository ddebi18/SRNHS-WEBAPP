import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useRole } from '@/hooks/useRole';
import { SITE_CONFIG } from '@/config/siteConfig';
import { supabaseRecognitionAdapter } from '@/features/attendance/services/SupabaseRecognitionAdapter';
import { mockNotificationAdapter } from '@/features/notifications/services/MockNotificationAdapter';
import { getStoredStudents } from '@/features/faceRegistration/api';
import { getLocalStaff } from '@/features/faculty/api';
import { getLocalRooms, getLocalSubjects } from '@/features/academics/api';
import { getLocalViolations } from '@/features/students/api';
import { RecognitionEvent } from '@/types/domain.types';
import {
  ArrowRight,
  DoorOpen,
  ClipboardList,
  MessageSquare,
  Users,
  BookOpen,
  School,
  GraduationCap,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  LayoutDashboard,
  ShieldCheck,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Animation helpers ────────────────────────────────────────────────────────
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } },
};

// ─── Shared sub-components ────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  color: 'green' | 'amber' | 'blue' | 'rose' | 'purple' | 'slate';
  onClick?: () => void;
}

const colorMap = {
  green:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/70 dark:border-emerald-800/50', icon: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/70 dark:border-amber-800/50',         icon: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',         dot: 'bg-amber-500'  },
  blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200/70 dark:border-blue-800/50',             icon: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',             dot: 'bg-blue-500'   },
  rose:   { bg: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200/70 dark:border-rose-800/50',             icon: 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',             dot: 'bg-rose-500'   },
  purple: { bg: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200/70 dark:border-violet-800/50',     icon: 'bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300',     dot: 'bg-violet-500' },
  slate:  { bg: 'bg-slate-50 dark:bg-slate-900 border-slate-200/70 dark:border-slate-800',               icon: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',           dot: 'bg-slate-400'  },
};

const StatCard: React.FC<StatCardProps> = ({ title, value, sub, icon, color, onClick }) => {
  const c = colorMap[color];
  return (
    <motion.div
      variants={item}
      whileHover={onClick ? { y: -2, boxShadow: '0 8px 24px 0 rgba(0,0,0,0.10)' } : {}}
      className={cn(
        'rounded-2xl p-5 border shadow-card-sm transition-all',
        c.bg,
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">{title}</div>
          <div className="text-3xl font-black text-slate-900 dark:text-slate-100 leading-none tabular-nums">{value}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{sub}</span>
          </div>
        </div>
        <div className={cn('p-2.5 rounded-xl shrink-0', c.icon)}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
};

interface NavButtonProps {
  label: string;
  sub: string;
  path: string;
  icon: React.ReactNode;
  badge?: string | number;
}
const NavButton: React.FC<NavButtonProps & { navigate: (p: string) => void }> = ({ label, sub, path, icon, badge, navigate }) => (
  <motion.button
    variants={item}
    whileHover={{ x: 3 }}
    whileTap={{ scale: 0.98 }}
    onClick={() => navigate(path)}
    className="w-full flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm hover:shadow-card hover:border-slate-300 dark:hover:border-slate-700 transition-all text-left group"
  >
    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/50 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{label}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{sub}</div>
    </div>
    {badge !== undefined && (
      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold shrink-0">
        {badge}
      </span>
    )}
    <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
  </motion.button>
);

// ─── Gate event row ───────────────────────────────────────────────────────────
const EventRow: React.FC<{ evt: RecognitionEvent; idx: number }> = ({ evt, idx }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: idx * 0.04 }}
    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50"
  >
    {evt.student_photo ? (
      <img src={evt.student_photo} alt={evt.student_name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
    ) : (
      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[11px] font-bold shrink-0 text-slate-600 dark:text-slate-300">
        {(evt.student_name ?? '??').slice(0, 2).toUpperCase()}
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{evt.student_name}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{evt.section_name}</div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <span className={cn(
        'px-2 py-0.5 rounded-full text-[10px] font-bold capitalize',
        evt.event_type === 'entry' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' :
        evt.event_type === 'exit'  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' :
                                     'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
      )}>
        {evt.event_type}
      </span>
      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
        {new Date(evt.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  </motion.div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export const DashboardOverviewPage: React.FC = () => {
  const { user, isAdmin, isTeacher } = useRole();
  const navigate = useNavigate();

  // Live data state
  const [recentEvents, setRecentEvents] = useState<RecognitionEvent[]>([]);
  const [todayScansCount, setTodayScansCount] = useState(0);
  const [smsCount, setSmsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Synchronous local data
  const students = getStoredStudents();
  const staff = getLocalStaff();
  const rooms = getLocalRooms();
  const subjects = getLocalSubjects();
  const violations = getLocalViolations();

  const enrolledCount = students.length;
  const activeStaff = staff.filter(s => s.is_active);
  const teacherCount = activeStaff.filter(s => s.role === 'teacher').length;
  const recentViolations = violations.slice(0, 3);
  const todayViolations = violations.filter(
    v => new Date(v.incident_date).toDateString() === new Date().toDateString()
  ).length;

  const attendanceRate =
    enrolledCount > 0 && todayScansCount > 0
      ? Math.min(100, Math.round((todayScansCount / enrolledCount) * 100))
      : null;

  // Time-of-day greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.full_name?.split(' ')[0] ?? user?.full_name ?? '';

  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const loadLiveData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [events, smsLogs] = await Promise.all([
        supabaseRecognitionAdapter.getEvents({ limit: 8 }),
        mockNotificationAdapter.getSmsLogs(200),
      ]);

      const todayStr = new Date().toDateString();
      const todayEvents = events.filter(e => new Date(e.captured_at).toDateString() === todayStr);
      setRecentEvents(events.slice(0, 6));
      setTodayScansCount(todayEvents.length);
      setSmsCount(smsLogs.length);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveData();

    const unsub1 = supabaseRecognitionAdapter.subscribeToEvents(evt => {
      setRecentEvents(prev => {
        if (prev.some(e => e.id === evt.id)) return prev;
        return [evt, ...prev.slice(0, 5)];
      });
      if (new Date(evt.captured_at).toDateString() === new Date().toDateString()) {
        setTodayScansCount(c => c + 1);
      }
    });

    const unsub2 = mockNotificationAdapter.subscribeToSms(() => setSmsCount(c => c + 1));

    return () => { unsub1(); unsub2(); };
  }, [loadLiveData]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold',
              isAdmin
                ? 'bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300'
                : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
            )}>
              {isAdmin ? <ShieldCheck className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
              {isAdmin ? 'Administrator' : 'Teacher'}
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 leading-tight">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            {today} · {SITE_CONFIG.schoolName}
          </p>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Dashboard live</span>
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════════
          ADMIN DASHBOARD
      ══════════════════════════════════════════════════════════════════════ */}
      {isAdmin && (
        <>
          {/* Admin KPI row */}
          <motion.div variants={container} initial="hidden" animate="show"
            className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Enrolled Students"
              value={enrolledCount}
              sub="Biometric consent on file"
              icon={<Users className="w-4 h-4" />}
              color="green"
              onClick={() => navigate('/students')}
            />
            <StatCard
              title="Today's Gate Scans"
              value={isLoading ? '…' : todayScansCount}
              sub={attendanceRate !== null ? `${attendanceRate}% of enrolled` : 'No scans yet today'}
              icon={<DoorOpen className="w-4 h-4" />}
              color="amber"
              onClick={() => navigate('/gate-log')}
            />
            <StatCard
              title="Active Teaching Staff"
              value={teacherCount}
              sub={`${rooms.length} rooms · ${subjects.length} subjects`}
              icon={<School className="w-4 h-4" />}
              color="blue"
              onClick={() => navigate('/faculty')}
            />
            <StatCard
              title="SMS Alerts Sent"
              value={isLoading ? '…' : smsCount}
              sub="Entry · Exit · Absence"
              icon={<MessageSquare className="w-4 h-4" />}
              color="purple"
              onClick={() => navigate('/sms-log')}
            />
          </motion.div>

          {/* Admin main grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left 2-col: Recent Gate Events + Attendance Trend */}
            <div className="lg:col-span-2 space-y-5">

              {/* Recent Gate Events */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Recent Gate Events</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Latest student entry & exit records</p>
                  </div>
                  <button
                    onClick={() => navigate('/gate-log')}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors"
                  >
                    View all <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-2">
                  {recentEvents.length === 0 ? (
                    <div className="py-10 text-center">
                      <DoorOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">No gate events recorded today yet.</p>
                    </div>
                  ) : (
                    recentEvents.map((evt, i) => <EventRow key={evt.id} evt={evt} idx={i} />)
                  )}
                </div>
              </motion.div>

              {/* Today's Attendance Bar */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Today's Attendance Overview</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Gate scans vs enrolled students</p>
                  </div>
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                </div>

                <div className="space-y-3">
                  {/* Present */}
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Scanned In</span>
                      <span>{todayScansCount} / {enrolledCount}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: enrolledCount > 0 ? `${Math.min(100, Math.round((todayScansCount / enrolledCount) * 100))}%` : '0%' }}
                        transition={{ delay: 0.5, duration: 0.7, ease: 'easeOut' }}
                        className="h-full rounded-full bg-emerald-500"
                      />
                    </div>
                  </div>
                  {/* Not yet scanned */}
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-500" />Not Yet Scanned</span>
                      <span>{Math.max(0, enrolledCount - todayScansCount)} / {enrolledCount}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: enrolledCount > 0 ? `${Math.min(100, Math.round((Math.max(0, enrolledCount - todayScansCount) / enrolledCount) * 100))}%` : '0%' }}
                        transition={{ delay: 0.6, duration: 0.7, ease: 'easeOut' }}
                        className="h-full rounded-full bg-amber-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Summary chips */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />{todayScansCount} scanned
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                    <Clock className="w-3 h-3" />{Math.max(0, enrolledCount - todayScansCount)} pending
                  </span>
                  {attendanceRate !== null && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/50 text-blue-700 dark:text-blue-300 text-[11px] font-bold">
                      <TrendingUp className="w-3 h-3" />{attendanceRate}% rate
                    </span>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Right 1-col: Quick Actions + Violations snapshot */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
              className="space-y-4"
            >
              {/* Quick Nav */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-5 space-y-3">
                <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 mb-1">Quick Actions</h2>
                <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                  <NavButton navigate={navigate} label="Classroom Attendance" sub="Mark present · late · excused" path="/classroom" icon={<ClipboardList className="w-4 h-4" />} />
                  <NavButton navigate={navigate} label="Gate Log" sub="Entry & exit records" path="/gate-log" icon={<DoorOpen className="w-4 h-4" />} badge={todayScansCount || undefined} />
                  <NavButton navigate={navigate} label="Student Directory" sub="Profiles · LRN · guardians" path="/students" icon={<Users className="w-4 h-4" />} badge={enrolledCount} />
                  <NavButton navigate={navigate} label="Faculty & Schedules" sub="Staff · assignments · timetable" path="/faculty" icon={<School className="w-4 h-4" />} badge={teacherCount} />
                  <NavButton navigate={navigate} label="Rooms & Subjects" sub="Academic structure & rooms" path="/academics" icon={<BookOpen className="w-4 h-4" />} />
                  <NavButton navigate={navigate} label="SMS Audit Log" sub="Sent · queued · failed" path="/sms-log" icon={<MessageSquare className="w-4 h-4" />} badge={smsCount || undefined} />
                </motion.div>
              </div>

              {/* Recent Violations */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Discipline Incidents</h2>
                  {todayViolations > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 text-[11px] font-bold">
                      {todayViolations} today
                    </span>
                  )}
                </div>
                {recentViolations.length === 0 ? (
                  <div className="py-5 text-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">No incidents on record.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentViolations.map(v => (
                      <div key={v.id} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                        <AlertTriangle className={cn('w-3.5 h-3.5 mt-0.5 shrink-0',
                          v.severity === 'severe' ? 'text-rose-500' :
                          v.severity === 'moderate' ? 'text-amber-500' : 'text-blue-500'
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{v.student_name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{v.title}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{new Date(v.incident_date).toLocaleDateString()}</div>
                        </div>
                        <span className={cn('shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize',
                          v.severity === 'severe'   ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' :
                          v.severity === 'moderate' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400' :
                                                      'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                        )}>
                          {v.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => navigate('/students')}
                  className="w-full text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center gap-1 pt-1 transition-colors"
                >
                  View student profiles <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TEACHER DASHBOARD
      ══════════════════════════════════════════════════════════════════════ */}
      {isTeacher && (
        <>
          {/* Teacher KPI row */}
          <motion.div variants={container} initial="hidden" animate="show"
            className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="My Students"
              value={enrolledCount}
              sub="Enrolled in your sections"
              icon={<Users className="w-4 h-4" />}
              color="green"
              onClick={() => navigate('/students')}
            />
            <StatCard
              title="Today's Scans"
              value={isLoading ? '…' : todayScansCount}
              sub={attendanceRate !== null ? `${attendanceRate}% attendance rate` : 'No gate scans yet'}
              icon={<DoorOpen className="w-4 h-4" />}
              color="amber"
            />
            <StatCard
              title="Subjects"
              value={subjects.length}
              sub={`Across ${rooms.length} rooms`}
              icon={<BookOpen className="w-4 h-4" />}
              color="blue"
              onClick={() => navigate('/academics')}
            />
            <StatCard
              title="SMS Alerts"
              value={isLoading ? '…' : smsCount}
              sub="Auto-sent to guardians"
              icon={<MessageSquare className="w-4 h-4" />}
              color="purple"
            />
          </motion.div>

          {/* Teacher main grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left 2-col: Today's actions + Gate events */}
            <div className="lg:col-span-2 space-y-5">

              {/* Today's class actions */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-5 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Today's Checklist</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      label: 'Take Classroom Attendance',
                      desc: 'Mark students present, late, or absent for today',
                      path: '/classroom',
                      icon: <ClipboardList className="w-5 h-5" />,
                      color: 'text-emerald-600 dark:text-emerald-400',
                      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
                      action: 'Start',
                    },
                    {
                      label: 'View Student Profiles',
                      desc: 'Access LRN records, photos & guardian contacts',
                      path: '/students',
                      icon: <Users className="w-5 h-5" />,
                      color: 'text-blue-600 dark:text-blue-400',
                      bg: 'bg-blue-50 dark:bg-blue-950/40',
                      action: 'Open',
                    },
                    {
                      label: 'Register Student Face',
                      desc: 'Capture biometric photos for new students',
                      path: '/face-registration',
                      icon: <GraduationCap className="w-5 h-5" />,
                      color: 'text-violet-600 dark:text-violet-400',
                      bg: 'bg-violet-50 dark:bg-violet-950/40',
                      action: 'Open',
                    },
                    {
                      label: 'Faculty & Schedules',
                      desc: 'View timetable and subject assignments',
                      path: '/faculty',
                      icon: <School className="w-5 h-5" />,
                      color: 'text-amber-600 dark:text-amber-400',
                      bg: 'bg-amber-50 dark:bg-amber-950/40',
                      action: 'View',
                    },
                  ].map(card => (
                    <motion.button
                      key={card.path}
                      whileHover={{ y: -2, boxShadow: '0 6px 20px 0 rgba(0,0,0,0.09)' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigate(card.path)}
                      className="flex items-start gap-3 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-left shadow-card-sm"
                    >
                      <div className={cn('p-2 rounded-lg shrink-0', card.bg, card.color)}>
                        {card.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{card.label}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{card.desc}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Recent gate events (read-only for teachers) */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">School Gate Activity</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Recent student entry & exit events</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </div>
                </div>
                <div className="space-y-2">
                  {recentEvents.length === 0 ? (
                    <div className="py-8 text-center">
                      <DoorOpen className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">No gate events yet today.</p>
                    </div>
                  ) : (
                    recentEvents.slice(0, 5).map((evt, i) => <EventRow key={evt.id} evt={evt} idx={i} />)
                  )}
                </div>
              </motion.div>
            </div>

            {/* Right 1-col: Attendance summary + SMS info */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="space-y-4"
            >
              {/* Attendance rate card */}
              <div className="rounded-2xl p-5 text-white space-y-4 shadow-card" style={{ background: 'linear-gradient(150deg, #1B4332 0%, #2D6A4F 55%, #52B788 100%)' }}>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-white/70">Today's Summary</div>
                  <LayoutDashboard className="w-4 h-4 text-white/50" />
                </div>

                <div className="text-4xl font-black leading-none">
                  {attendanceRate !== null ? `${attendanceRate}%` : '—'}
                </div>
                <div className="text-xs font-medium text-white/70">Gate attendance rate today</div>

                <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: attendanceRate !== null ? `${attendanceRate}%` : '0%' }}
                    transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-white/10">
                    <div className="text-xl font-black">{todayScansCount}</div>
                    <div className="text-[11px] text-white/60 font-medium">Scanned</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/10">
                    <div className="text-xl font-black">{Math.max(0, enrolledCount - todayScansCount)}</div>
                    <div className="text-[11px] text-white/60 font-medium">Pending</div>
                  </div>
                </div>
              </div>

              {/* Status chips */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-5 space-y-3">
                <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">System Status</h2>
                <div className="space-y-2">
                  {[
                    { label: 'Gate Turnstile', status: 'Online', ok: true },
                    { label: 'SMS Gateway', status: `${smsCount} sent today`, ok: true },
                    { label: 'Biometric Sync', status: `${enrolledCount} profiles`, ok: enrolledCount > 0 },
                    { label: 'Supabase DB', status: 'Connected', ok: true },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{row.label}</span>
                      <span className={cn(
                        'flex items-center gap-1 text-[11px] font-bold',
                        row.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      )}>
                        {row.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SMS note */}
              <div className="p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200/60 dark:border-violet-800/50">
                <div className="flex items-center gap-2 text-xs font-bold text-violet-700 dark:text-violet-300 mb-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Auto SMS Alerts
                </div>
                <p className="text-[11px] text-violet-600 dark:text-violet-400 leading-relaxed font-medium">
                  Guardian SMS alerts fire automatically when you mark a student <strong>absent</strong> or <strong>late</strong> in Classroom Attendance.
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
};
