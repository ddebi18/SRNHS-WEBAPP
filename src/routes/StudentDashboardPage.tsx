import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
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
  Timer,
  BarChart3,
  GraduationCap,
  Fingerprint,
} from 'lucide-react';

/* ── Animation helpers ─────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

/* ── Mock data ─────────────────────────────────────────────── */
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

/* ── Status Badge Helper ──────────────────────────────────── */
const statusConfig: Record<AttendanceStatus | 'not-yet', { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  present: { label: 'Present', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  late: { label: 'Late', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  absent: { label: 'Absent', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800', icon: <XCircle className="w-3.5 h-3.5" /> },
  excused: { label: 'Excused', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  'not-yet': { label: 'Upcoming', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700', icon: <Clock className="w-3.5 h-3.5" /> },
};

const StatusBadge: React.FC<{ status: AttendanceStatus | 'not-yet' }> = ({ status }) => {
  const cfg = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

/* ── Tab type ─────────────────────────────────────────────── */
type TabId = 'face-scan' | 'subjects' | 'history' | 'mobile-attendance';

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
export const StudentDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

  const [gateTimeIn, setGateTimeIn] = useState<string | null>('6:45 AM');
  const [gateTimeOut, setGateTimeOut] = useState<string | null>(null);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  const presentCount = MOCK_SUBJECTS.filter(s => s.status === 'present').length;
  const lateCount = MOCK_SUBJECTS.filter(s => s.status === 'late').length;
  const totalDone = presentCount + lateCount;

  const tabs: { id: TabId; label: string; icon: React.ReactNode; mobileLabel: string }[] = [
    { id: 'face-scan', label: 'Face Scan Time In/Out', icon: <ScanFace className="w-4 h-4" />, mobileLabel: 'Scan' },
    { id: 'subjects', label: 'My Subjects', icon: <BookOpen className="w-4 h-4" />, mobileLabel: 'Subjects' },
    { id: 'history', label: 'Attendance History', icon: <BarChart3 className="w-4 h-4" />, mobileLabel: 'History' },
    { id: 'mobile-attendance', label: 'Mobile Attendance', icon: <Smartphone className="w-4 h-4" />, mobileLabel: 'Mobile' },
  ];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
      {/* ── Welcome Banner ─────────────────────────────────── */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#006937] via-[#008C4A] to-[#00B35B] p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-2xl font-bold shadow-lg backdrop-blur-sm">
              {user?.full_name?.[0] || 'S'}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">
                Good {now.getHours() < 12 ? 'Morning' : now.getHours() < 18 ? 'Afternoon' : 'Evening'}, {user?.full_name?.split(' ')[0] || 'Student'}!
              </h1>
              <p className="text-white/70 text-sm mt-0.5">{user?.department || 'Grade 10 - Diamond'}</p>
              <p className="text-white/50 text-xs mt-1 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                {dateStr} • {timeStr}
              </p>
            </div>
          </div>

          {/* Gate scan summary */}
          <div className="flex gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[100px] border border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-1">Gate In</div>
              <div className="text-lg font-bold flex items-center justify-center gap-1.5">
                <LogInIcon className="w-4 h-4 text-emerald-300" />
                {gateTimeIn || '—'}
              </div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[100px] border border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-1">Gate Out</div>
              <div className="text-lg font-bold flex items-center justify-center gap-1.5">
                <LogOutIcon className="w-4 h-4 text-rose-300" />
                {gateTimeOut || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="relative z-10 mt-5 grid grid-cols-3 gap-3">
          <div className="bg-white/10 rounded-xl px-3 py-2 text-center backdrop-blur-sm border border-white/5">
            <div className="text-2xl font-bold">{presentCount}</div>
            <div className="text-[10px] text-white/60 font-medium">Present</div>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2 text-center backdrop-blur-sm border border-white/5">
            <div className="text-2xl font-bold">{lateCount}</div>
            <div className="text-[10px] text-white/60 font-medium">Late</div>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2 text-center backdrop-blur-sm border border-white/5">
            <div className="text-2xl font-bold">{MOCK_SUBJECTS.length - totalDone}</div>
            <div className="text-[10px] text-white/60 font-medium">Upcoming</div>
          </div>
        </div>
      </motion.div>

      {/* ── Tab Navigation ─────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex gap-1 bg-white dark:bg-slate-900 rounded-xl p-1.5 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 min-w-0 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[#006937] text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.mobileLabel}</span>
          </button>
        ))}
      </motion.div>

      {/* ── Tab Content ────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'face-scan' && <FaceScanTab key="face-scan" gateTimeIn={gateTimeIn} gateTimeOut={gateTimeOut} setGateTimeIn={setGateTimeIn} setGateTimeOut={setGateTimeOut} />}
        {activeTab === 'subjects' && <SubjectsTab key="subjects" />}
        {activeTab === 'history' && <HistoryTab key="history" />}
        {activeTab === 'mobile-attendance' && <MobileAttendanceTab key="mobile-attendance" />}
      </AnimatePresence>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════════════
   TAB 1: FACE SCAN TIME IN / TIME OUT
   ══════════════════════════════════════════════════════════════ */
interface FaceScanTabProps {
  gateTimeIn: string | null;
  gateTimeOut: string | null;
  setGateTimeIn: (v: string | null) => void;
  setGateTimeOut: (v: string | null) => void;
}

const FaceScanTab: React.FC<FaceScanTabProps> = ({ gateTimeIn, gateTimeOut, setGateTimeIn, setGateTimeOut }) => {
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
      console.warn('Camera access denied:', err);
      // Simulate camera for demo
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

    // Simulate face recognition processing
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
      // Auto-clear result after 4 seconds
      setTimeout(() => setScanResult(null), 4000);
    }, 2500);
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
      className="grid grid-cols-1 lg:grid-cols-5 gap-6"
    >
      {/* Camera Preview */}
      <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-[#006937] dark:text-emerald-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Face Recognition Scanner</h3>
          </div>
          {cameraActive && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Camera Active
            </span>
          )}
        </div>

        <div className="relative aspect-[4/3] bg-slate-950 flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
            playsInline
            muted
          />

          {/* Scan overlay */}
          {cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-52 h-52 sm:w-64 sm:h-64 rounded-full border-4 ${scanning ? 'border-amber-400 animate-pulse' : 'border-white/40'} transition-colors duration-300`}>
                {/* Corner markers */}
                <div className="absolute top-1/2 left-1/2 w-52 h-52 sm:w-64 sm:h-64 -translate-x-1/2 -translate-y-1/2">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/80 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/80 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/80 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/80 rounded-br-lg" />
                </div>
              </div>
              {scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-16 h-16 border-4 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  <p className="mt-4 text-sm text-white font-semibold bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm">
                    Scanning face...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Placeholder when camera off */}
          {!cameraActive && (
            <div className="flex flex-col items-center gap-4 text-white/60">
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20">
                <Camera className="w-10 h-10" />
              </div>
              <p className="text-sm font-medium">Camera is off</p>
              <p className="text-xs text-white/40">Click "Start Camera" to begin</p>
            </div>
          )}

          {/* Scan Result Overlay */}
          <AnimatePresence>
            {scanResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={`absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm ${
                  scanResult === 'failed' ? 'bg-rose-950/70' : 'bg-emerald-950/70'
                }`}
              >
                {scanResult === 'failed' ? (
                  <XCircle className="w-16 h-16 text-rose-400 mb-3" />
                ) : (
                  <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-3" />
                )}
                <p className="text-xl font-bold text-white">
                  {scanResult === 'success-in' ? 'Time In Recorded!' : scanResult === 'success-out' ? 'Time Out Recorded!' : 'Face Not Recognized'}
                </p>
                <p className="text-sm text-white/60 mt-1">
                  {scanResult !== 'failed' ? new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'Please try again'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Camera Controls */}
        <div className="p-4 space-y-3">
          {/* Mode Selector */}
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => setScanMode('in')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                scanMode === 'in'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <LogInIcon className="w-4 h-4" />
              Time In
            </button>
            <button
              onClick={() => setScanMode('out')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                scanMode === 'out'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <LogOutIcon className="w-4 h-4" />
              Time Out
            </button>
          </div>

          <div className="flex gap-2">
            {!cameraActive ? (
              <button
                onClick={startCamera}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#006937] hover:bg-[#008C4A] text-white text-sm font-semibold shadow-sm transition-colors"
              >
                <Camera className="w-4 h-4" />
                Start Camera
              </button>
            ) : (
              <>
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#006937] hover:bg-[#008C4A] text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {scanning ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Fingerprint className="w-4 h-4" />
                  )}
                  {scanning ? 'Scanning...' : `Scan ${scanMode === 'in' ? 'Time In' : 'Time Out'}`}
                </button>
                <button
                  onClick={stopCamera}
                  className="px-4 py-3 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Side Panel - Today's Log */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Timer className="w-4 h-4 text-[#006937] dark:text-emerald-400" />
            Today's Time Log
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
              <div className="flex items-center gap-2">
                <LogInIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Gate Time In</span>
              </div>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{gateTimeIn || '—'}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50">
              <div className="flex items-center gap-2">
                <LogOutIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span className="text-xs font-medium text-rose-800 dark:text-rose-300">Gate Time Out</span>
              </div>
              <span className="text-sm font-bold text-rose-700 dark:text-rose-300">{gateTimeOut || '—'}</span>
            </div>
          </div>
        </div>

        {/* Subject Time In/Out Log */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#006937] dark:text-emerald-400" />
            Subject Scans Today
          </h3>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {MOCK_SUBJECTS.filter(s => s.status !== 'not-yet').map(sub => (
              <div key={sub.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{sub.code}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{sub.title}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    In: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{sub.timeIn}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Out: <span className="font-semibold text-rose-600 dark:text-rose-400">{sub.timeOut || '—'}</span>
                  </div>
                </div>
              </div>
            ))}
            {MOCK_SUBJECTS.filter(s => s.status !== 'not-yet').length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No scans recorded yet today</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════════════
   TAB 2: MY SUBJECTS
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-[#006937] dark:text-emerald-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">My Subjects — Current Schedule</h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {MOCK_SUBJECTS.length} subjects
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {MOCK_SUBJECTS.map(sub => (
            <div key={sub.id}>
              <button
                onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#006937]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-[#006937] dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {sub.code} — {sub.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {sub.teacher} • {sub.room}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <StatusBadge status={sub.status} />
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expanded === sub.id ? 'rotate-90' : ''}`} />
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
                    <div className="px-5 pb-4 pt-0 ml-[52px]">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-1">Schedule</div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{sub.schedule}</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-1">Time In</div>
                          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{sub.timeIn || '—'}</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-1">Time Out</div>
                          <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">{sub.timeOut || '—'}</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-1">Status</div>
                          <StatusBadge status={sub.status} />
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
   TAB 3: ATTENDANCE HISTORY
   ══════════════════════════════════════════════════════════════ */
const HistoryTab: React.FC = () => {
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const uniqueSubjects = Array.from(new Set(MOCK_HISTORY.map(h => h.subjectCode)));

  const filteredHistory = filterSubject === 'all'
    ? MOCK_HISTORY
    : MOCK_HISTORY.filter(h => h.subjectCode === filterSubject);

  // Group by date
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#006937] dark:text-emerald-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Attendance History</h3>
          </div>
          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#006937]/20"
          >
            <option value="all">All Subjects</option>
            {uniqueSubjects.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {Object.entries(grouped).map(([date, records]) => (
            <div key={date}>
              <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {new Date(date).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              {records.map((rec, idx) => (
                <div key={`${date}-${rec.subjectCode}-${idx}`} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#006937]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-[#006937] dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {rec.subjectCode} — {rec.subjectTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        In: {rec.timeIn} • Out: {rec.timeOut}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={rec.status} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {filteredHistory.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-400">
            No attendance records found.
          </div>
        )}
      </div>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════════════
   TAB 4: MOBILE ATTENDANCE (scan on phone)
   ══════════════════════════════════════════════════════════════ */
const MobileAttendanceTab: React.FC = () => {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [attendanceMarked, setAttendanceMarked] = useState<Record<string, 'in' | 'out'>>({});

  const handleMarkAttendance = (subjectId: string, type: 'in' | 'out') => {
    setAttendanceMarked(prev => ({ ...prev, [subjectId]: type }));
    // In a real app, this would trigger a face scan + API call
    setTimeout(() => {
      // Auto-deselect after marking
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
      {/* Info Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/50 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-blue-900 dark:text-blue-200">Mobile Attendance</h3>
            <p className="text-xs text-blue-700/70 dark:text-blue-400/70 mt-1 leading-relaxed">
              Quickly mark your attendance for each subject using your phone. Select a subject below,
              then tap Time In or Time Out. Face recognition will verify your identity.
            </p>
          </div>
        </div>
      </div>

      {/* Subject Cards for Mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {MOCK_SUBJECTS.map(sub => {
          const isSelected = selectedSubject === sub.id;
          const marked = attendanceMarked[sub.id];
          return (
            <motion.div
              key={sub.id}
              layout
              className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm overflow-hidden transition-all ${
                isSelected
                  ? 'border-[#006937] dark:border-emerald-500 ring-2 ring-[#006937]/20 dark:ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <button
                onClick={() => setSelectedSubject(isSelected ? null : sub.id)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    marked ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-[#006937]/10 dark:bg-emerald-900/20'
                  }`}>
                    {marked ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <BookOpen className="w-5 h-5 text-[#006937] dark:text-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{sub.code}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{sub.title}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub.schedule}</div>
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  {marked ? (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
                      {marked === 'in' ? '✓ Timed In' : '✓ Timed Out'}
                    </span>
                  ) : (
                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
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
                    <div className="px-4 pb-4 flex gap-2">
                      <button
                        onClick={() => handleMarkAttendance(sub.id, 'in')}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
                      >
                        <LogInIcon className="w-4 h-4" />
                        Time In
                      </button>
                      <button
                        onClick={() => handleMarkAttendance(sub.id, 'out')}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors shadow-sm"
                      >
                        <LogOutIcon className="w-4 h-4" />
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
