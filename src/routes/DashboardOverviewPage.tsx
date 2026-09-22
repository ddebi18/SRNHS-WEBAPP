import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useRole } from '@/hooks/useRole';
import { SITE_CONFIG } from '@/config/siteConfig';
import { RecognitionEvent } from '@/types/domain.types';
import { supabaseRecognitionAdapter } from '@/features/attendance/services/SupabaseRecognitionAdapter';
import { mockNotificationAdapter } from '@/features/notifications/services/MockNotificationAdapter';
import { getStoredStudents } from '@/features/faceRegistration/api';
import { LiveCameraFeedCard } from '@/features/attendance/components/LiveCameraFeedCard';
import {
  ArrowRight,
  DoorOpen,
  ClipboardList,
  MessageSquare,
  Users,
  Camera,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Stagger animation helpers ───────────────────────────────────────────────
const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

// ─── Metric Card Component ───────────────────────────────────────────────────
interface MetricProps {
  title: string;
  value: string | number;
  sub: string;
  accentDot: string;
  lightBg: string;
  darkBg: string;
  iconBg: string;
  iconColor: string;
  glowClass: string;
  borderColor: string;
  icon: React.ReactNode;
  onClick?: () => void;
}
const MetricCard: React.FC<MetricProps> = ({ title, value, sub, accentDot, lightBg, darkBg, iconBg, iconColor, glowClass, borderColor, icon, onClick }) => (
  <motion.div
    variants={item}
    whileHover={{ y: -4, scale: 1.02 }}
    className={cn(
      'rounded-3xl p-5 cursor-pointer relative overflow-hidden transition-all border backdrop-blur-sm',
      lightBg, darkBg, glowClass, borderColor
    )}
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 mb-2">{title}</div>
        <div className="text-4xl font-black leading-none mb-1 text-slate-900 dark:text-slate-50">{value}</div>
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-2.5 flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full', accentDot)} />
          {sub}
        </div>
      </div>
      <div className={cn('p-3 rounded-2xl', iconBg)}>
        <div className={iconColor}>{icon}</div>
      </div>
    </div>
  </motion.div>
);

export const DashboardOverviewPage: React.FC = () => {
  const { user, isAdmin } = useRole();
  const navigate = useNavigate();
  const [recentEvents, setRecentEvents] = useState<RecognitionEvent[]>([]);
  const [smsCount, setSmsCount] = useState(0);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Derived metrics from real stored data
  const enrolledCount = getStoredStudents().length;
  const todayStr = new Date().toDateString();
  const todayScansCount = recentEvents.filter(
    e => new Date(e.captured_at).toDateString() === todayStr
  ).length;
  const attendanceRate =
    enrolledCount > 0 && todayScansCount > 0
      ? `${Math.min(100, Math.round((todayScansCount / enrolledCount) * 100))}%`
      : '—';

  useEffect(() => {
    supabaseRecognitionAdapter.getEvents({ limit: 6 }).then(setRecentEvents);
    mockNotificationAdapter.getSmsLogs(100).then(logs => setSmsCount(logs.length));

    const unsub1 = supabaseRecognitionAdapter.subscribeToEvents(evt => {
      setRecentEvents(prev => [evt, ...prev.slice(0, 5)]);
    });
    const unsub2 = mockNotificationAdapter.subscribeToSms(() => {
      setSmsCount(c => c + 1);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-1"
      >
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 leading-tight">
          {greeting}, {user?.full_name?.split(' ')[1] || user?.full_name}!
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium max-w-xl">
          {SITE_CONFIG.schoolName} — Facial recognition attendance running.{' '}
          {isAdmin
            ? 'You have full visibility across all school sections, live camera streams, and gate logs.'
            : 'Your classroom section dashboard is ready to take attendance.'}
        </p>
      </motion.div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <MetricCard
          title="Enrolled Students"
          value={enrolledCount}
          sub="Biometric consent on file"
          lightBg="bg-white/80"
          darkBg="dark:bg-emerald-950/30"
          borderColor="border-emerald-200/60 dark:border-emerald-700/40"
          glowClass="glow-emerald"
          accentDot="bg-emerald-500"
          iconBg="bg-emerald-100 dark:bg-emerald-900/50"
          iconColor="text-emerald-600 dark:text-emerald-400"
          icon={<Users className="w-5 h-5" />}
          onClick={() => navigate('/students')}
        />
        <MetricCard
          title="Today's Gate Scans"
          value={todayScansCount}
          sub="Via face recognition turnstile"
          lightBg="bg-white/80"
          darkBg="dark:bg-sky-950/30"
          borderColor="border-sky-200/60 dark:border-sky-700/40"
          glowClass="glow-sky"
          accentDot="bg-sky-500"
          iconBg="bg-sky-100 dark:bg-sky-900/50"
          iconColor="text-sky-600 dark:text-sky-400"
          icon={<DoorOpen className="w-5 h-5" />}
          onClick={isAdmin ? () => navigate('/gate-log') : undefined}
        />
        <MetricCard
          title="Attendance Rate"
          value={attendanceRate}
          sub="Classroom subject records"
          lightBg="bg-white/80"
          darkBg="dark:bg-violet-950/30"
          borderColor="border-violet-200/60 dark:border-violet-700/40"
          glowClass="glow-violet"
          accentDot="bg-violet-500"
          iconBg="bg-violet-100 dark:bg-violet-900/50"
          iconColor="text-violet-600 dark:text-violet-400"
          icon={<ClipboardList className="w-5 h-5" />}
          onClick={() => navigate('/classroom')}
        />
        <MetricCard
          title="Parent SMS Sent"
          value={smsCount}
          sub="Entry · Exit · Absence alerts"
          lightBg="bg-white/80"
          darkBg="dark:bg-amber-950/30"
          borderColor="border-amber-200/60 dark:border-amber-700/40"
          glowClass="glow-amber"
          accentDot="bg-amber-500"
          iconBg="bg-amber-100 dark:bg-amber-900/50"
          iconColor="text-amber-600 dark:text-amber-400"
          icon={<MessageSquare className="w-5 h-5" />}
          onClick={isAdmin ? () => navigate('/sms-log') : undefined}
        />
      </motion.div>

      {/* ── Main Layout: Camera Stream & Events ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left 2 Cols: Live Camera Stream Viewfinder + Live Recognition Feed */}
        <div className="lg:col-span-2 space-y-6">

          {/* 1. Live Turnstile Camera Feed Card (Admin only) */}
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <LiveCameraFeedCard />
            </motion.div>
          )}

          {/* 2. Live Recognition Feed Log */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm p-6 space-y-4 transition-all glow-sky"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Live Recognition Scans</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Facial scans streaming in real-time from gate cameras</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </div>
            </div>

            <div className="space-y-2">
              {recentEvents.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
                  No camera scan events yet. Turnstile scans will appear here automatically.
                </div>
              )}
              {recentEvents.map((evt, i) => (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 transition-colors"
                >
                  {evt.student_photo ? (
                    <img src={evt.student_photo} alt={evt.student_name} className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0 text-slate-800 dark:text-slate-200">
                      {evt.student_name?.slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{evt.student_name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{evt.section_name} · {evt.room_name}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      'px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize',
                      evt.event_type === 'entry' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50' :
                      evt.event_type === 'exit'  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50' :
                      'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50'
                    )}>
                      {evt.event_type}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {new Date(evt.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {isAdmin && (
              <button
                onClick={() => navigate('/gate-log')}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800
                  text-sm font-bold text-slate-500 dark:text-slate-400
                  hover:border-slate-300 dark:hover:border-slate-700
                  hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                Full Gate Log <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        </div>

        {/* Right 1 Col: Snapshot + Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="space-y-4"
        >
          {/* Today's snapshot */}
          <div className="rounded-3xl p-5 border border-white/10 shadow-card space-y-4 text-white backdrop-blur-sm" style={{background: 'linear-gradient(165deg, #1B4332 0%, #2D6A4F 50%, #40916C 100%)'}}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/80">Today's Snapshot</div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-[10px] font-bold text-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </div>
            </div>
            {todayScansCount === 0 ? (
              <div className="py-6 text-center text-xs text-white/40 font-medium">
                No attendance scans recorded today yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-white/70">Today's Scans</span>
                    <span className="font-bold text-white">{todayScansCount}/{enrolledCount}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: enrolledCount > 0 ? `${Math.min(100, Math.round((todayScansCount / enrolledCount) * 100))}%` : '0%' }}
                      transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-100"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick nav buttons */}
          {[
            {
              label: 'Take Classroom Attendance',
              sub: 'Mark present · late · excused',
              path: '/classroom',
              accentBorder: 'border-l-emerald-500',
              dotColor: 'bg-emerald-500',
            },
            {
              label: 'Student & Guardian Directory',
              sub: 'Photos · LRN · contacts',
              path: '/students',
              accentBorder: 'border-l-sky-500',
              dotColor: 'bg-sky-500',
            },
            isAdmin && {
              label: 'Parent SMS Audit Log',
              sub: 'Sent · queued · failed',
              path: '/sms-log',
              accentBorder: 'border-l-violet-500',
              dotColor: 'bg-violet-500',
            },
          ].filter(Boolean).map((btn: any) => (
            <motion.button
              key={btn.path}
              whileHover={{ x: 4, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(btn.path)}
              className={cn(
                'w-full p-4 rounded-2xl text-left shadow-card-sm flex items-center justify-between group',
                'bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800',
                'border-l-[3px]', btn.accentBorder,
                'hover:shadow-card hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all backdrop-blur-sm'
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn('w-2 h-2 rounded-full shrink-0', btn.dotColor)} />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{btn.label}</div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{btn.sub}</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:translate-x-1 transition-transform" />
            </motion.button>
          ))}

          {/* System Boundary Banner */}
          <div className="p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 border-l-[3px] border-l-emerald-500/60 shadow-card-sm space-y-2.5 transition-colors backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
              <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Edge Camera Boundary</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              Camera feeds stream directly from on-premise turnstiles. Real-time face recognition events sync into Supabase database via WebSocket.
            </p>
            <div className="flex items-center gap-1.5 pt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Realtime Gateway Ready</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
