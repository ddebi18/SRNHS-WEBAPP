import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { SITE_CONFIG } from '@/config/siteConfig';
import { LordIcon, LORD_ICONS } from '@/components/motion/LordIcon';
import { fadeUp, staggerContainer } from '@/components/motion/PageFade';
import { cn } from '@/lib/utils';
import {
  Camera,
  Clock,
  BookOpen,
  CheckCircle2,
  XCircle,
  AlertCircle,
  LogIn as LogInIcon,
  LogOut as LogOutIcon,
  Calendar,
  ChevronRight,
  Smartphone,
  ScanFace,
  BarChart3,
  GraduationCap,
  Fingerprint,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';

/* ── Types & Mock Data ─────────────────────────────────────── */
type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

interface SubjectSchedule {
  id: string;
  code: string;
  title: string;
  teacher: string;
  room: string;
  schedule: string;
  timeIn?: string;
  timeOut?: string;
  status: AttendanceStatus | 'not-yet';
}

interface AttendanceRecord {
  date: string;
  subjectCode: string;
  subjectTitle: string;
  timeIn: string;
  timeOut: string;
  status: AttendanceStatus;
}

const MOCK_SUBJECTS: SubjectSchedule[] = [
  { id: 's1', code: 'MATH10', title: 'Mathematics 10', teacher: 'Mrs. Reyes', room: 'Room 201', schedule: 'MWF 7:30 - 8:30 AM', status: 'present', timeIn: '7:28 AM', timeOut: '8:30 AM' },
  { id: 's2', code: 'SCI10', title: 'Science 10', teacher: 'Mr. Dela Cruz', room: 'Room 305', schedule: 'MWF 8:45 - 9:45 AM', status: 'present', timeIn: '8:42 AM', timeOut: '9:45 AM' },
  { id: 's3', code: 'ENG10', title: 'English 10', teacher: 'Ms. Santos', room: 'Room 102', schedule: 'MWF 10:00 - 11:00 AM', status: 'late', timeIn: '10:12 AM', timeOut: '11:00 AM' },
  { id: 's4', code: 'FIL10', title: 'Filipino 10', teacher: 'Gng. Bautista', room: 'Room 203', schedule: 'TTh 7:30 - 9:00 AM', status: 'not-yet' },
  { id: 's5', code: 'AP10', title: 'Araling Panlipunan 10', teacher: 'Mr. Ramos', room: 'Room 104', schedule: 'TTh 9:15 - 10:45 AM', status: 'not-yet' },
  { id: 's6', code: 'MAPEH10', title: 'MAPEH 10', teacher: 'Coach Villanueva', room: 'Gym / Room 401', schedule: 'TTh 11:00 - 12:30 PM', status: 'not-yet' },
  { id: 's7', code: 'TLE10', title: 'TLE 10', teacher: 'Mrs. Mendoza', room: 'TLE Lab', schedule: 'Fri 1:00 - 3:00 PM', status: 'not-yet' },
  { id: 's8', code: 'ESP10', title: 'Edukasyon sa Pagpapakatao 10', teacher: 'Mr. Garcia', room: 'Room 106', schedule: 'Wed 1:00 - 2:00 PM', status: 'not-yet' },
];

const MOCK_HISTORY: AttendanceRecord[] = [
  { date: '2026-09-23', subjectCode: 'MATH10', subjectTitle: 'Mathematics 10', timeIn: '7:28 AM', timeOut: '8:30 AM', status: 'present' },
  { date: '2026-09-23', subjectCode: 'SCI10', subjectTitle: 'Science 10', timeIn: '8:44 AM', timeOut: '9:45 AM', status: 'present' },
  { date: '2026-09-23', subjectCode: 'ENG10', subjectTitle: 'English 10', timeIn: '10:05 AM', timeOut: '11:00 AM', status: 'late' },
  { date: '2026-09-22', subjectCode: 'FIL10', subjectTitle: 'Filipino 10', timeIn: '7:30 AM', timeOut: '9:00 AM', status: 'present' },
  { date: '2026-09-22', subjectCode: 'AP10', subjectTitle: 'Araling Panlipunan 10', timeIn: '9:18 AM', timeOut: '10:45 AM', status: 'present' },
  { date: '2026-09-22', subjectCode: 'MAPEH10', subjectTitle: 'MAPEH 10', timeIn: '—', timeOut: '—', status: 'absent' },
  { date: '2026-09-19', subjectCode: 'MATH10', subjectTitle: 'Mathematics 10', timeIn: '7:25 AM', timeOut: '8:30 AM', status: 'present' },
  { date: '2026-09-19', subjectCode: 'SCI10', subjectTitle: 'Science 10', timeIn: '8:40 AM', timeOut: '9:45 AM', status: 'present' },
  { date: '2026-09-19', subjectCode: 'ENG10', subjectTitle: 'English 10', timeIn: '—', timeOut: '—', status: 'excused' },
  { date: '2026-09-19', subjectCode: 'TLE10', subjectTitle: 'TLE 10', timeIn: '1:02 PM', timeOut: '3:00 PM', status: 'present' },
];

/* ── Status Badge Helper (Admin Theme Styled) ─────────────── */
const statusConfig: Record<AttendanceStatus | 'not-yet', { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  present: {
    label: 'Present',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/50',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  late: {
    label: 'Late',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/50',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  absent: {
    label: 'Absent',
    color: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/50',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  excused: {
    label: 'Excused',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/50',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  'not-yet': {
    label: 'Upcoming',
    color: 'text-slate-500 dark:text-emerald-400/70',
    bg: 'bg-slate-50 dark:bg-[#06180F] border-slate-200 dark:border-emerald-800/30',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
};

const StudentStatusBadge: React.FC<{ status: AttendanceStatus | 'not-yet' }> = ({ status }) => {
  const cfg = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

/* ── Tab type ─────────────────────────────────────────────── */
type TabId = 'face-scan' | 'subjects' | 'history' | 'mobile-attendance';

/* ══════════════════════════════════════════════════════════════
   MAIN STUDENT DASHBOARD PAGE
   ══════════════════════════════════════════════════════════════ */
export const StudentDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [gateTimeIn, setGateTimeIn] = useState<string | null>('6:45 AM');
  const [gateTimeOut, setGateTimeOut] = useState<string | null>(null);

  // Live Philippine Standard Time clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('en-PH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const getTabFromUrl = useCallback((): TabId => {
    const path = location.pathname;
    if (path.includes('/subjects')) return 'subjects';
    if (path.includes('/history')) return 'history';
    if (path.includes('/mobile-attendance')) return 'mobile-attendance';
    if (path.includes('/face-scan')) return 'face-scan';
    const queryTab = searchParams.get('tab') as TabId;
    if (queryTab && ['face-scan', 'subjects', 'history', 'mobile-attendance'].includes(queryTab)) {
      return queryTab;
    }
    return 'face-scan';
  }, [location.pathname, searchParams]);

  const [activeTab, setActiveTabState] = useState<TabId>(getTabFromUrl);

  useEffect(() => {
    setActiveTabState(getTabFromUrl());
  }, [getTabFromUrl]);

  const handleTabChange = (newTab: TabId) => {
    setActiveTabState(newTab);
    const tabRouteMap: Record<TabId, string> = {
      'face-scan': '/student/face-scan',
      'subjects': '/student/subjects',
      'history': '/student/history',
      'mobile-attendance': '/student/mobile-attendance',
    };
    navigate(tabRouteMap[newTab] || `/student/dashboard?tab=${newTab}`);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.full_name?.split(' ')[0] || 'Student';

  // Determine school year (June–March)
  const now = new Date();
  const schoolYearStart = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  const schoolYear = `S.Y. ${schoolYearStart}–${schoolYearStart + 1}`;

  const presentCount = MOCK_SUBJECTS.filter(s => s.status === 'present').length;
  const lateCount = MOCK_SUBJECTS.filter(s => s.status === 'late').length;
  const totalCompleted = presentCount + lateCount;
  const attendancePercent = Math.round((presentCount / MOCK_SUBJECTS.length) * 100);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; mobileLabel: string }[] = [
    { id: 'face-scan', label: 'Face Scan Time In/Out', icon: <ScanFace className="w-4 h-4" />, mobileLabel: 'Face Scan' },
    { id: 'subjects', label: 'My Subjects & Schedules', icon: <BookOpen className="w-4 h-4" />, mobileLabel: 'Subjects' },
    { id: 'history', label: 'Attendance History', icon: <BarChart3 className="w-4 h-4" />, mobileLabel: 'History' },
    { id: 'mobile-attendance', label: 'Mobile Attendance', icon: <Smartphone className="w-4 h-4" />, mobileLabel: 'Mobile' },
  ];

  return (
    <motion.div
      className="space-y-5 max-w-7xl mx-auto"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* ── 1. Hero Institutional Header & Operational Bar (Admin Match) ── */}
      <motion.div
        variants={fadeUp}
        className="bg-white dark:bg-[#0A2016] rounded-lg p-4 sm:p-5 border border-slate-200 dark:border-emerald-800/40 shadow-sm relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="w-1 h-5 bg-primary rounded-sm" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-emerald-300">
                Student Portal
              </span>
              <span className="text-xs text-slate-400 dark:text-emerald-400/60 font-medium">
                DepEd Antipolo · Cluster 2
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-emerald-50 leading-tight">
              {greeting}, {firstName}!
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-emerald-300/80 mt-1 max-w-2xl">
              {user?.department || 'Grade 10 - Diamond'} · {SITE_CONFIG.schoolName} — Real-time attendance and schedule monitoring
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 bg-emerald-50/40 dark:bg-[#06180F] p-2.5 sm:p-3 rounded-2xl border border-emerald-950/10 dark:border-emerald-800/30">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#0A2016] shadow-sm border border-emerald-950/5 dark:border-emerald-800/30">
                <Clock className="w-4 h-4 text-primary dark:text-emerald-400" />
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-emerald-400/60 leading-none">PST Clock</div>
                  <div className="text-xs font-mono font-bold text-slate-800 dark:text-emerald-100">{currentTimeStr || '12:00:00 PM'}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#0A2016] shadow-xs border border-emerald-950/5 dark:border-emerald-800/30">
                <Calendar className="w-4 h-4 text-gold dark:text-gold-light" />
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-emerald-400/60 leading-none">Academic Year</div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-emerald-100">{schoolYear}</div>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Student ID Verified</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── 2. Statistics & Overview Metric Cards (Exact Admin Style) ── */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-900 dark:text-emerald-50 tracking-tight">
              Daily Attendance Overview
            </h2>
            <p className="text-xs text-slate-500 dark:text-emerald-400/80">
              Turnstile entry status and subject schedules for today
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-primary dark:text-emerald-400 font-semibold">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">Active Record</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Gate Status */}
          <div className="group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-colors overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-emerald-500" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90">
                  Campus Turnstile
                </span>
                <div className="p-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 group-hover:scale-105 transition-transform">
                  <LordIcon src={LORD_ICONS.school} size={28} trigger="hover" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-extrabold text-slate-900 dark:text-emerald-50 tracking-tight font-sans">
                  {gateTimeIn || 'No Entry Yet'}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                  Timed-In
                </span>
              </div>

              <div className="flex items-center gap-2 mt-3 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                  <ArrowDownLeft className="w-3 h-3" />
                  In: {gateTimeIn || '—'}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                  <ArrowUpRight className="w-3 h-3" />
                  Out: {gateTimeOut || '—'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-3 flex items-center justify-between">
              <span>Main Gate Turnstile Node 01</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-emerald-600" />
            </p>
          </div>

          {/* Card 2: Subject Attendance Rate */}
          <div className="group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-colors overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-blue-500" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90">
                  Classroom Attendance
                </span>
                <div className="p-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 group-hover:scale-105 transition-transform">
                  <LordIcon src={LORD_ICONS.book} size={28} trigger="hover" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-emerald-50 tracking-tight font-sans">
                  {attendancePercent}%
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                  {presentCount} Present
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-3 w-full h-2 rounded-full bg-slate-100 dark:bg-[#06180F] overflow-hidden border border-emerald-950/5 dark:border-emerald-800/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                  style={{ width: `${attendancePercent}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-3 flex items-center justify-between">
              <span>{totalCompleted} of {MOCK_SUBJECTS.length} classes completed</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-emerald-600" />
            </p>
          </div>

          {/* Card 3: Enrolled Subjects */}
          <div className="group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-colors overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gold" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90">
                  Enrolled Subjects
                </span>
                <div className="p-1 rounded-xl bg-amber-100/60 dark:bg-amber-950/60 group-hover:scale-105 transition-transform">
                  <LordIcon src={LORD_ICONS.graduate} size={28} trigger="hover" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-emerald-50 tracking-tight font-sans">
                  {MOCK_SUBJECTS.length}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50">
                  Official Roster
                </span>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>{user?.department || 'Grade 10 - Diamond'}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-3 flex items-center justify-between">
              <span>DepEd K-12 JHS Curriculum</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-emerald-600" />
            </p>
          </div>

          {/* Card 4: Upcoming / Next Subject */}
          <div className="group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-colors overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-purple-500" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90">
                  Next Subject Period
                </span>
                <div className="p-1 rounded-xl bg-purple-50 dark:bg-purple-950/60 group-hover:scale-105 transition-transform">
                  <LordIcon src={LORD_ICONS.bell} size={28} trigger="hover" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-xl font-extrabold text-slate-900 dark:text-emerald-50 tracking-tight font-sans truncate">
                  Room 203
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
                  Filipino 10
                </span>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-emerald-300 font-semibold">
                <Clock className="w-3.5 h-3.5 text-purple-500" />
                <span>TTh 7:30 - 9:00 AM · Gng. Bautista</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-3 flex items-center justify-between">
              <span>Classroom Session Ready</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-emerald-600" />
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── 3. Tab Navigation Bar (Admin Segmented Design) ────────── */}
      <motion.div
        variants={fadeUp}
        className="flex gap-1.5 p-1.5 bg-white dark:bg-[#0A2016] rounded-lg border border-slate-200 dark:border-emerald-800/40 shadow-sm overflow-x-auto"
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'flex-1 min-w-0 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer',
              activeTab === tab.id
                ? 'bg-[#006937] text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-[#06180F]'
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.mobileLabel}</span>
          </button>
        ))}
      </motion.div>

      {/* ── 4. Tab Content Area ───────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'face-scan' && (
          <FaceScanTab
            key="face-scan"
            gateTimeIn={gateTimeIn}
            gateTimeOut={gateTimeOut}
            setGateTimeIn={setGateTimeIn}
            setGateTimeOut={setGateTimeOut}
            studentName={user?.full_name || 'Mark Anthony'}
            department={user?.department || 'Grade 10 - Diamond'}
          />
        )}
        {activeTab === 'subjects' && <SubjectsTab key="subjects" />}
        {activeTab === 'history' && <HistoryTab key="history" />}
        {activeTab === 'mobile-attendance' && <MobileAttendanceTab key="mobile-attendance" />}
      </AnimatePresence>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════════════
   TAB 1: FACE SCAN TIME IN / TIME OUT (Command Center Style)
   ══════════════════════════════════════════════════════════════ */
interface FaceScanTabProps {
  gateTimeIn: string | null;
  gateTimeOut: string | null;
  setGateTimeIn: (v: string | null) => void;
  setGateTimeOut: (v: string | null) => void;
  studentName: string;
  department: string;
}

const FaceScanTab: React.FC<FaceScanTabProps> = ({
  gateTimeIn,
  gateTimeOut,
  setGateTimeIn,
  setGateTimeOut,
  studentName,
  department,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success-in' | 'success-out' | 'failed' | null>(null);
  const [scanMode, setScanMode] = useState<'in' | 'out'>('in');

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err) {
      console.warn('Camera access fallback simulation:', err);
      setCameraActive(true);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const handleScan = useCallback(() => {
    setScanning(true);
    setScanResult(null);

    setTimeout(() => {
      setScanning(false);
      const now = new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
      if (scanMode === 'in') {
        setGateTimeIn(now);
        setScanResult('success-in');
      } else {
        setGateTimeOut(now);
        setScanResult('success-out');
      }
      setTimeout(() => setScanResult(null), 4000);
    }, 2200);
  }, [scanMode, setGateTimeIn, setGateTimeOut]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
    >
      {/* Left Column (7 cols): Camera Viewfinder */}
      <div className="lg:col-span-7 bg-white dark:bg-[#0A2016] rounded-lg border border-slate-200 dark:border-emerald-800/40 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-emerald-950/5 dark:border-emerald-800/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-[#006937] dark:text-emerald-400" />
            <div>
              <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-emerald-50">
                Turnstile Face Recognition Scanner
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-emerald-400/70">
                Self-Service Campus Gate Check-In & Check-Out
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-bold">
            <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {cameraActive ? 'Camera Ready' : 'Standby'}
          </span>
        </div>

        {/* Viewfinder Frame */}
        <div className="relative aspect-[4/3] bg-slate-950 flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
            playsInline
            muted
          />

          {cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-52 h-52 sm:w-64 sm:h-64 rounded-2xl border-2 ${scanning ? 'border-amber-400 animate-pulse' : 'border-emerald-400/50'} transition-colors duration-300`}>
                {/* Corner markers */}
                <div className="absolute top-1/2 left-1/2 w-52 h-52 sm:w-64 sm:h-64 -translate-x-1/2 -translate-y-1/2">
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-md" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-md" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-md" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-md" />
                </div>
              </div>

              {scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
                  <div className="w-14 h-14 border-4 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  <p className="mt-3 text-xs text-white font-semibold bg-black/60 px-3.5 py-1 rounded-full border border-white/20">
                    Verifying biometric descriptors...
                  </p>
                </div>
              )}
            </div>
          )}

          {!cameraActive && (
            <div className="flex flex-col items-center gap-3 text-white/60 p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
                <Camera className="w-8 h-8 text-white/70" />
              </div>
              <p className="text-sm font-semibold text-white">Camera Viewfinder is Standby</p>
              <p className="text-xs text-white/50 max-w-xs">
                Activate the live camera to scan your face against your enrolled school biometric vector.
              </p>
            </div>
          )}

          {/* Result Overlay Banner */}
          <AnimatePresence>
            {scanResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm ${
                  scanResult === 'failed' ? 'bg-rose-950/80' : 'bg-emerald-950/80'
                }`}
              >
                {scanResult === 'failed' ? (
                  <XCircle className="w-14 h-14 text-rose-400 mb-2" />
                ) : (
                  <CheckCircle2 className="w-14 h-14 text-emerald-400 mb-2" />
                )}
                <p className="text-lg font-bold text-white">
                  {scanResult === 'success-in' ? 'Turnstile Time-In Verified!' : scanResult === 'success-out' ? 'Turnstile Time-Out Verified!' : 'Face Not Recognized'}
                </p>
                <p className="text-xs text-white/70 mt-1">
                  {scanResult !== 'failed' ? `${studentName} · SMS Notification Dispatched` : 'Please center face and try again'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Viewfinder Controls (Admin Style) */}
        <div className="p-4 space-y-3 bg-white dark:bg-[#0A2016]">
          {/* Mode Selector */}
          <div className="flex gap-2 p-1.5 bg-emerald-50/40 dark:bg-[#06180F] rounded-lg border border-emerald-950/10 dark:border-emerald-800/30">
            <button
              onClick={() => setScanMode('in')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all cursor-pointer',
                scanMode === 'in'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-emerald-300 hover:bg-white dark:hover:bg-[#0A2016]'
              )}
            >
              <LogInIcon className="w-4 h-4" />
              Time-In Mode
            </button>
            <button
              onClick={() => setScanMode('out')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all cursor-pointer',
                scanMode === 'out'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-emerald-300 hover:bg-white dark:hover:bg-[#0A2016]'
              )}
            >
              <LogOutIcon className="w-4 h-4" />
              Time-Out Mode
            </button>
          </div>

          <div className="flex gap-2.5">
            {!cameraActive ? (
              <button
                onClick={startCamera}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#006937] hover:bg-[#008C4A] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Initialize Live Camera
              </button>
            ) : (
              <>
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#006937] hover:bg-[#008C4A] text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {scanning ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Fingerprint className="w-4 h-4" />
                  )}
                  {scanning ? 'Verifying...' : `Execute ${scanMode === 'in' ? 'Time-In' : 'Time-Out'} Match`}
                </button>
                <button
                  onClick={stopCamera}
                  className="px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-[#06180F] border border-slate-200 dark:border-emerald-800/40 text-slate-700 dark:text-emerald-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Column (5 cols): Spotlight Card + Recent Feed (Admin Match) */}
      <div className="lg:col-span-5 space-y-4">
        {/* Spotlight Card */}
        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-emerald-950/5 dark:border-emerald-800/30">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-primary dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-emerald-50">Latest Turnstile Scan</h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
              Verified Match
            </span>
          </div>

          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-[#143828] border-2 border-emerald-500 flex items-center justify-center text-primary dark:text-emerald-200 font-heading font-bold text-xl shadow-md">
                {studentName?.slice(0, 2).toUpperCase()}
              </div>
              <span className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-xs">
                <CheckCircle2 className="w-3 h-3" />
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-heading font-bold text-base text-slate-900 dark:text-emerald-50 truncate">
                {studentName}
              </h4>
              <p className="text-xs text-slate-500 dark:text-emerald-400/80 truncate mt-0.5 font-medium">
                {department} • Turnstile Node-01
              </p>

              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold capitalize shadow-2xs bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                  <ArrowDownLeft className="w-3 h-3" />
                  Time-In
                </span>

                <span className="text-xs font-mono text-slate-500 dark:text-emerald-400/70 font-semibold">
                  {gateTimeOut ? `Out: ${gateTimeOut}` : `In: ${gateTimeIn || '6:45 AM'}`}
                </span>

                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900/60">
                  SMS Sent
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Scan History Feed (Admin Match) */}
        <div className="bg-white dark:bg-[#0A2016] rounded-lg border border-slate-200 dark:border-emerald-800/40 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-emerald-950/5 dark:border-emerald-800/30 flex items-center justify-between">
            <div>
              <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-emerald-50">Recent Activity Log</h3>
              <p className="text-[11px] text-slate-500 dark:text-emerald-400/70">Personal turnstile & subject logs</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>

          <div className="p-3 divide-y divide-emerald-950/5 dark:divide-emerald-800/20 max-h-[290px] overflow-y-auto">
            {MOCK_SUBJECTS.slice(0, 4).map(sub => (
              <div
                key={sub.id}
                className="py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-emerald-50/50 dark:hover:bg-[#0E2A1E] rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-[#143828] text-primary dark:text-emerald-200 flex items-center justify-center text-xs font-bold shrink-0">
                    {sub.code.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-emerald-50 truncate">
                      {sub.code} — {sub.title}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-emerald-400/60 truncate">
                      {sub.room} • {sub.teacher}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <StudentStatusBadge status={sub.status} />
                  <span className="text-[11px] font-mono text-slate-400 dark:text-emerald-400/60">
                    {sub.timeIn || '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════════════
   TAB 2: MY SUBJECTS (Admin Table & Drawer Style)
   ══════════════════════════════════════════════════════════════ */
const SubjectsTab: React.FC = () => {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35 }}
    >
      <div className="bg-white dark:bg-[#0A2016] rounded-lg border border-slate-200 dark:border-emerald-800/40 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-emerald-950/5 dark:border-emerald-800/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-[#006937] dark:text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-emerald-50">
                Official Enrolled Subjects & Teacher Assignments
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-emerald-400/70">
                DepEd standard schedule for Grade 10 - Diamond
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-primary dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/50">
            {MOCK_SUBJECTS.length} Subjects
          </span>
        </div>

        <div className="divide-y divide-emerald-950/5 dark:divide-emerald-800/20">
          {MOCK_SUBJECTS.map(sub => (
            <div key={sub.id}>
              <button
                onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-emerald-50/50 dark:hover:bg-[#0E2A1E] transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-primary dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-emerald-50 truncate">
                      {sub.code} — {sub.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-emerald-400/70 mt-0.5">
                      {sub.teacher} • {sub.room}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <StudentStatusBadge status={sub.status} />
                  <ChevronRight className={`w-4 h-4 text-slate-400 dark:text-emerald-600 transition-transform ${expanded === sub.id ? 'rotate-90' : ''}`} />
                </div>
              </button>

              <AnimatePresence>
                {expanded === sub.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 pt-1 ml-[52px]">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-emerald-50/30 dark:bg-[#06180F] rounded-lg p-3 border border-emerald-950/10 dark:border-emerald-800/30">
                          <div className="text-[10px] text-slate-500 dark:text-emerald-400/70 font-bold uppercase tracking-wider mb-1">Weekly Schedule</div>
                          <div className="text-xs font-bold text-slate-900 dark:text-emerald-50">{sub.schedule}</div>
                        </div>
                        <div className="bg-emerald-50/30 dark:bg-[#06180F] rounded-lg p-3 border border-emerald-950/10 dark:border-emerald-800/30">
                          <div className="text-[10px] text-slate-500 dark:text-emerald-400/70 font-bold uppercase tracking-wider mb-1">Time In Stamp</div>
                          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{sub.timeIn || 'Not recorded'}</div>
                        </div>
                        <div className="bg-emerald-50/30 dark:bg-[#06180F] rounded-lg p-3 border border-emerald-950/10 dark:border-emerald-800/30">
                          <div className="text-[10px] text-slate-500 dark:text-emerald-400/70 font-bold uppercase tracking-wider mb-1">Time Out Stamp</div>
                          <div className="text-xs font-bold text-rose-600 dark:text-rose-400">{sub.timeOut || 'Not recorded'}</div>
                        </div>
                        <div className="bg-emerald-50/30 dark:bg-[#06180F] rounded-lg p-3 border border-emerald-950/10 dark:border-emerald-800/30">
                          <div className="text-[10px] text-slate-500 dark:text-emerald-400/70 font-bold uppercase tracking-wider mb-1">Session Status</div>
                          <StudentStatusBadge status={sub.status} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════════════
   TAB 3: ATTENDANCE HISTORY (Admin LiveGateLog Style)
   ══════════════════════════════════════════════════════════════ */
const HistoryTab: React.FC = () => {
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const uniqueSubjects = Array.from(new Set(MOCK_HISTORY.map(h => h.subjectCode)));

  const filteredHistory = filterSubject === 'all'
    ? MOCK_HISTORY
    : MOCK_HISTORY.filter(h => h.subjectCode === filterSubject);

  const grouped = filteredHistory.reduce<Record<string, AttendanceRecord[]>>((acc, rec) => {
    (acc[rec.date] = acc[rec.date] || []).push(rec);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35 }}
    >
      <div className="bg-white dark:bg-[#0A2016] rounded-lg border border-slate-200 dark:border-emerald-800/40 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-emerald-950/5 dark:border-emerald-800/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#006937] dark:text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-emerald-50">Attendance History & Audit Logs</h3>
              <p className="text-[11px] text-slate-500 dark:text-emerald-400/70">Verified turnstile and classroom records</p>
            </div>
          </div>
          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-50/40 dark:bg-[#06180F] border border-emerald-950/10 dark:border-emerald-800/30 text-slate-800 dark:text-emerald-100 font-semibold focus:outline-none focus:ring-2 focus:ring-[#006937]/30"
          >
            <option value="all">Filter: All Subjects</option>
            {uniqueSubjects.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-emerald-950/5 dark:divide-emerald-800/20">
          {Object.entries(grouped).map(([date, records]) => (
            <div key={date}>
              <div className="px-5 py-2.5 bg-emerald-50/30 dark:bg-[#06180F] border-b border-emerald-950/5 dark:border-emerald-800/30 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-primary dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-emerald-100">
                  {new Date(date).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              {records.map((rec, idx) => (
                <div
                  key={`${date}-${rec.subjectCode}-${idx}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-emerald-50/50 dark:hover:bg-[#0E2A1E] transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-primary dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-emerald-50 truncate">
                        {rec.subjectCode} — {rec.subjectTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-emerald-400/70 mt-0.5">
                        In: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{rec.timeIn}</span> • Out: <span className="font-semibold text-rose-600 dark:text-rose-400">{rec.timeOut}</span>
                      </div>
                    </div>
                  </div>
                  <StudentStatusBadge status={rec.status} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {filteredHistory.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-400 dark:text-emerald-400/60">
            No attendance records match your filter criteria.
          </div>
        )}
      </div>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════════════
   TAB 4: MOBILE ATTENDANCE (Admin Card & Action Style)
   ══════════════════════════════════════════════════════════════ */
const MobileAttendanceTab: React.FC = () => {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [attendanceMarked, setAttendanceMarked] = useState<Record<string, 'in' | 'out'>>({});

  const handleMarkAttendance = (subjectId: string, type: 'in' | 'out') => {
    setAttendanceMarked(prev => ({ ...prev, [subjectId]: type }));
    setTimeout(() => {
      setSelectedSubject(null);
    }, 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* Notice Card */}
      <div className="bg-emerald-50/40 dark:bg-[#06180F] rounded-lg border border-emerald-950/10 dark:border-emerald-800/30 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#0A2016] border border-emerald-950/5 dark:border-emerald-800/30 text-primary dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-emerald-50">
              Mobile Face Recognition Check-In
            </h3>
            <p className="text-xs text-slate-500 dark:text-emerald-400/80 mt-1 leading-relaxed">
              Mark attendance directly from your smartphone or tablet. Select a scheduled subject below, then execute Time In or Time Out.
            </p>
          </div>
        </div>
      </div>

      {/* Subject Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {MOCK_SUBJECTS.map(sub => {
          const isSelected = selectedSubject === sub.id;
          const marked = attendanceMarked[sub.id];
          return (
            <motion.div
              key={sub.id}
              layout
              className={cn(
                'bg-white dark:bg-[#0A2016] rounded-lg border shadow-xs overflow-hidden transition-all',
                isSelected
                  ? 'border-[#006937] dark:border-emerald-500 ring-2 ring-[#006937]/20 dark:ring-emerald-500/20'
                  : 'border-slate-200 dark:border-emerald-800/40 hover:border-primary/40'
              )}
            >
              <button
                onClick={() => setSelectedSubject(isSelected ? null : sub.id)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-emerald-50/40 dark:hover:bg-[#0E2A1E] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border',
                    marked
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-800/30 text-[#006937] dark:text-emerald-400'
                  )}>
                    {marked ? <CheckCircle2 className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-emerald-50 truncate">{sub.code}</div>
                    <div className="text-[11px] text-slate-500 dark:text-emerald-400/80 truncate">{sub.title}</div>
                    <div className="text-[10px] text-slate-400 dark:text-emerald-400/60 mt-0.5">{sub.schedule}</div>
                  </div>
                </div>

                <div className="shrink-0 ml-2">
                  {marked ? (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                      {marked === 'in' ? '✓ Timed In' : '✓ Timed Out'}
                    </span>
                  ) : (
                    <ChevronRight className={`w-4 h-4 text-slate-400 dark:text-emerald-600 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {isSelected && !marked && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3.5 pt-1 flex gap-2">
                      <button
                        onClick={() => handleMarkAttendance(sub.id, 'in')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
                      >
                        <LogInIcon className="w-3.5 h-3.5" />
                        Time In
                      </button>
                      <button
                        onClick={() => handleMarkAttendance(sub.id, 'out')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
                      >
                        <LogOutIcon className="w-3.5 h-3.5" />
                        Time Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default StudentDashboardPage;
