import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRole } from '@/hooks/useRole';
import { SITE_CONFIG } from '@/config/siteConfig';
import { RecognitionEvent } from '@/types/domain.types';
import { supabaseRecognitionAdapter } from '@/features/attendance/services/SupabaseRecognitionAdapter';
import { mockNotificationAdapter } from '@/features/notifications/services/MockNotificationAdapter';
import { getStoredStudents } from '@/features/faceRegistration/api';
import { LiveCameraFeedCard } from '@/features/attendance/components/LiveCameraFeedCard';
import {
  ClipboardList,
  MessageSquare,
  Users,
  ChevronRight,
  Calendar,
  Clock,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
  Radio,
  Camera,
  ShieldCheck,
  UserCheck,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDashboardGreeting } from '@/lib/dashboardLabels';
import { LordIcon, LORD_ICONS } from '@/components/motion/LordIcon';
import { fadeUp, staggerContainer } from '@/components/motion/PageFade';

export const DashboardOverviewPage: React.FC = () => {
  const { isAdmin, role } = useRole();
  const navigate = useNavigate();
  const [recentEvents, setRecentEvents] = useState<RecognitionEvent[]>([]);
  const [smsCount, setSmsCount] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  const hour = new Date().getHours();
  const greeting = getDashboardGreeting(hour, role);

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

  // Derived metrics from real stored data
  const enrolledCount = getStoredStudents().length;
  const todayStr = new Date().toDateString();
  const todayScans = recentEvents.filter(
    e => new Date(e.captured_at).toDateString() === todayStr
  );
  const todayScansCount = todayScans.length;
  const todayEntriesCount = todayScans.filter(e => e.event_type === 'entry').length;
  const todayExitsCount = todayScans.filter(e => e.event_type === 'exit').length;

  const attendancePercent =
    enrolledCount > 0 && todayScansCount > 0
      ? Math.min(100, Math.round((todayScansCount / enrolledCount) * 100))
      : 0;
  const attendanceRate = attendancePercent > 0 ? `${attendancePercent}%` : '—';

  useEffect(() => {
    supabaseRecognitionAdapter.getEvents({ limit: 8 }).then(setRecentEvents);
    mockNotificationAdapter.getSmsLogs(100).then(logs => setSmsCount(logs.length));

    const unsub1 = supabaseRecognitionAdapter.subscribeToEvents(evt => {
      setRecentEvents(prev => [evt, ...prev.slice(0, 7)]);
    });
    const unsub2 = mockNotificationAdapter.subscribeToSms(() => {
      setSmsCount(c => c + 1);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  // Determine school year (June–March)
  const now = new Date();
  const schoolYearStart = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  const schoolYear = `S.Y. ${schoolYearStart}–${schoolYearStart + 1}`;

  const latestScan = recentEvents[0];

  return (
    <motion.div
      className="space-y-5 max-w-7xl mx-auto"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* ── 1. Hero Institutional Header & Operational Bar ────────────────── */}
      <motion.div variants={fadeUp} className="bg-white dark:bg-[#0A2016] rounded-lg p-4 sm:p-5 border border-slate-200 dark:border-emerald-800/40 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="w-1 h-5 bg-primary rounded-sm" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-emerald-300">
                Student Attendance System
              </span>
              <span className="text-xs text-slate-400 dark:text-emerald-400/60 font-medium">
                DepEd Antipolo · Cluster 2
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-emerald-50 leading-tight">
              {greeting}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-emerald-300/80 mt-1 max-w-2xl">
              {SITE_CONFIG.schoolName} — Real-time attendance and notification status
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
                <span>3 Gate Nodes Active</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── 2. The Integrated Command Center: Live Camera + Verification Kiosk ── */}
      <motion.div variants={fadeUp} className="min-w-0 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): The Live Camera Feed Viewfinder */}
        <div className="min-w-0 lg:col-span-7 space-y-4">
          <LiveCameraFeedCard />
        </div>

        {/* Right Column (5 cols): Live Recognition Kiosk & Real-time Stream */}
        <div className="min-w-0 lg:col-span-5 space-y-4">
          {/* Spotlight: Latest Verified Student Scan */}
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

            {latestScan ? (
              <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                  {latestScan.student_photo ? (
                    <img
                      src={latestScan.student_photo}
                      alt={latestScan.student_name}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500 shadow-md"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-[#143828] border-2 border-emerald-500 flex items-center justify-center text-primary dark:text-emerald-200 font-heading font-bold text-xl shadow-md">
                      {latestScan.student_name?.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-xs">
                    <CheckCircle2 className="w-3 h-3" />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-heading font-bold text-base text-slate-900 dark:text-emerald-50 truncate">
                    {latestScan.student_name}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-emerald-400/80 truncate mt-0.5 font-medium">
                    {latestScan.section_name ? `${latestScan.section_name} • ` : ''}
                    {latestScan.student_lrn ? `LRN: ${latestScan.student_lrn}` : latestScan.room_name}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold capitalize shadow-2xs',
                      latestScan.event_type === 'entry'
                        ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                    )}>
                      {latestScan.event_type === 'entry' ? (
                        <ArrowDownLeft className="w-3 h-3" />
                      ) : (
                        <ArrowUpRight className="w-3 h-3" />
                      )}
                      {latestScan.event_type === 'entry' ? 'Time-In' : 'Time-Out'}
                    </span>

                    <span className="text-xs font-mono text-slate-500 dark:text-emerald-400/70 font-semibold">
                      {new Date(latestScan.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>

                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900/60">
                      SMS Sent
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-[#06180F] text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2 border border-emerald-100 dark:border-emerald-800/40">
                  <Radio className="w-6 h-6 animate-pulse" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-emerald-200">Awaiting Turnstile Scans</p>
                <p className="text-[11px] text-slate-400 dark:text-emerald-400/60 mt-0.5">
                  Live facial matches from Gate 01, 02, or 03 will highlight here immediately.
                </p>
              </div>
            )}
          </div>

          {/* Real-time Recognition Scan Stream */}
          <div className="bg-white dark:bg-[#0A2016] rounded-lg border border-slate-200 dark:border-emerald-800/40 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-emerald-950/5 dark:border-emerald-800/30 flex items-center justify-between">
              <div>
                <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-emerald-50">Recent Campus Scans</h3>
                <p className="text-[11px] text-slate-500 dark:text-emerald-400/70">Edge gate activity feed</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>

            <div className="p-3 divide-y divide-emerald-950/5 dark:divide-emerald-800/20 max-h-[290px] overflow-y-auto">
              {recentEvents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-emerald-400/60">
                  No scan events recorded today. Gate turnstiles are ready.
                </div>
              ) : (
                recentEvents.slice(0, 5).map(evt => (
                  <div
                    key={evt.id}
                    className="py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-emerald-50/50 dark:hover:bg-[#0E2A1E] rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {evt.student_photo ? (
                        <img
                          src={evt.student_photo}
                          alt={evt.student_name}
                          className="w-8 h-8 rounded-full object-cover shrink-0 border border-emerald-200 dark:border-emerald-700"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-[#143828] text-primary dark:text-emerald-200 flex items-center justify-center text-xs font-bold shrink-0">
                          {evt.student_name?.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-emerald-50 truncate">
                          {evt.student_name}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-emerald-400/60 truncate">
                          {evt.room_name || 'Main Gate Turnstile'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        'px-2 py-0.5 rounded-md text-[10px] font-bold capitalize',
                        evt.event_type === 'entry'
                          ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                      )}>
                        {evt.event_type}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 dark:text-emerald-400/60">
                        {new Date(evt.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-emerald-950/5 dark:border-emerald-800/30 bg-emerald-50/20 dark:bg-[#071A11]">
              <button
                onClick={() => navigate(isAdmin ? '/gate-log' : '/classroom')}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold text-primary dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-[#143828] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{isAdmin ? 'Open Full Gate Log & Filter' : 'Open Classroom Attendance'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── 3. Redesigned High-Impact Statistics & Performance Section ─────── */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-900 dark:text-emerald-50 tracking-tight">
              Attendance Overview
            </h2>
            <p className="text-xs text-slate-500 dark:text-emerald-400/80">
              Real-time attendance and notification status
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-primary dark:text-emerald-400 font-semibold">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">Updated live</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Attendance Rate with Progress Bar */}
          <div
            onClick={() => navigate('/classroom')}
            className="group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-colors cursor-pointer overflow-hidden flex flex-col justify-between"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-emerald-500" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90">
                  Campus Attendance
                </span>
                <div className="p-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 group-hover:scale-105 transition-transform">
                  <LordIcon src={LORD_ICONS.book} size={28} trigger="hover" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-emerald-50 tracking-tight font-sans">
                  {attendanceRate}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                  {todayScansCount} present
                </span>
              </div>

              {/* Real Progress Bar */}
              <div className="mt-3 w-full h-2 rounded-full bg-slate-100 dark:bg-[#06180F] overflow-hidden border border-emerald-950/5 dark:border-emerald-800/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                  style={{ width: `${attendancePercent}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-3 flex items-center justify-between">
              <span>{todayScansCount} of {enrolledCount} enrolled present</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>

          {/* Card 2: Today's Gate Scans & Flow Velocity */}
          <div
            onClick={isAdmin ? () => navigate('/gate-log') : undefined}
            className={cn(
              'group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-colors overflow-hidden flex flex-col justify-between',
              isAdmin && 'cursor-pointer'
            )}
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-blue-500" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90">
                  Turnstile Scans
                </span>
                <div className="p-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 group-hover:scale-105 transition-transform">
                  <LordIcon src={LORD_ICONS.school} size={28} trigger="hover" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-emerald-50 tracking-tight font-sans">
                  {todayScansCount}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                  Today's Traffic
                </span>
              </div>

              {/* Inflow vs Outflow directional breakdown chips */}
              <div className="flex items-center gap-2 mt-3 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                  <ArrowDownLeft className="w-3 h-3" />
                  {todayEntriesCount} In
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                  <ArrowUpRight className="w-3 h-3" />
                  {todayExitsCount} Out
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-3 flex items-center justify-between">
              <span>Main Turnstile Node-01</span>
              {isAdmin && <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-emerald-600 group-hover:translate-x-0.5 transition-transform" />}
            </p>
          </div>

          {/* Card 3: Enrolled Biometric Student Population */}
          <div
            onClick={() => navigate('/students')}
            className="group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-colors cursor-pointer overflow-hidden flex flex-col justify-between"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gold" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90">
                  Enrolled Students
                </span>
                <div className="p-1 rounded-xl bg-amber-100/60 dark:bg-amber-950/60 group-hover:scale-105 transition-transform">
                  <LordIcon src={LORD_ICONS.users} size={28} trigger="hover" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-emerald-50 tracking-tight font-sans">
                  {enrolledCount}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50">
                  100% Registered
                </span>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Student records verified</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-3 flex items-center justify-between">
              <span>View Student Directory</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>

          {/* Card 4: Parent SMS Dispatches */}
          <div
            onClick={isAdmin ? () => navigate('/sms-log') : undefined}
            className={cn(
              'group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-colors overflow-hidden flex flex-col justify-between',
              isAdmin && 'cursor-pointer'
            )}
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-500" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90">
                  Parent SMS Alerts
                </span>
                <div className="p-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 group-hover:scale-105 transition-transform">
                  <LordIcon src={LORD_ICONS.message} size={28} trigger="hover" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-emerald-50 tracking-tight font-sans">
                  {smsCount}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                  Notifications Active
                </span>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-emerald-400/80 mt-3 leading-snug line-clamp-1">
                Entry, exit & absence notices to guardians
              </p>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-3 flex items-center justify-between">
              <span>PhilSMS / Twilio Carrier</span>
              {isAdmin && <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-emerald-600 group-hover:translate-x-0.5 transition-transform" />}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── 4. Humanized Quick Actions & San Roque NHS Heritage Module ─────── */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Launch Terminal (2 Cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-[#0A2016] rounded-lg p-5 border border-slate-200 dark:border-emerald-800/40 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading text-base font-bold text-slate-900 dark:text-emerald-50">
                Quick Actions
              </h3>
              <p className="text-xs text-slate-500 dark:text-emerald-400/70">
                Fast navigation for teachers and school administrators
              </p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-[#06180F] text-primary dark:text-emerald-300 border border-emerald-950/10 dark:border-emerald-800/40">
              One-Click Launch
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {[
              {
                title: 'Classroom Attendance',
                desc: 'Take period-by-period subject attendance',
                icon: ClipboardList,
                path: '/classroom',
                badge: 'Faculty Daily',
                color: 'text-emerald-600 dark:text-emerald-400',
                bg: 'bg-emerald-50 dark:bg-emerald-950/60',
              },
              {
                  title: 'Face Registration',
                  desc: 'Register student faces for attendance',
                icon: Camera,
                path: '/face-registration',
                  badge: 'Student Records',
                color: 'text-blue-600 dark:text-blue-400',
                bg: 'bg-blue-50 dark:bg-blue-950/60',
              },
              {
                title: 'Students & Guardian Contacts',
                desc: 'Browse student records and emergency details',
                icon: Users,
                path: '/students',
                badge: 'Roster Master',
                color: 'text-amber-600 dark:text-amber-400',
                bg: 'bg-amber-50 dark:bg-amber-950/60',
              },
              isAdmin ? {
                title: 'SMS Parent Audit Log',
                desc: 'Inspect delivered and queued notification alerts',
                icon: MessageSquare,
                path: '/sms-log',
                badge: 'DepEd Alerts',
                color: 'text-purple-600 dark:text-purple-400',
                bg: 'bg-purple-50 dark:bg-purple-950/60',
              } : {
                title: 'Faculty Schedules & Sections',
                desc: 'View teaching loads, adviser assignments & rooms',
                icon: UserCheck,
                path: '/faculty',
                badge: 'Adviser Portal',
                color: 'text-emerald-600 dark:text-emerald-400',
                bg: 'bg-emerald-50 dark:bg-emerald-950/60',
              },
            ].map(btn => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.path}
                  onClick={() => navigate(btn.path)}
                  className="p-4 rounded-lg text-left border border-emerald-950/10 dark:border-emerald-800/40 bg-emerald-50/20 dark:bg-[#071910] hover:bg-emerald-50 dark:hover:bg-[#143828] hover:border-primary/40 dark:hover:border-emerald-500/50 shadow-sm transition-colors flex items-start justify-between group cursor-pointer"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn('p-2.5 rounded-xl shrink-0 transition-transform group-hover:scale-105', btn.bg, btn.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-heading font-bold text-sm text-slate-900 dark:text-emerald-50 group-hover:text-primary dark:group-hover:text-emerald-300 transition-colors">
                          {btn.title}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-[#06180F] text-slate-500 dark:text-emerald-400 border border-emerald-950/10 dark:border-emerald-800/40">
                          {btn.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-emerald-400/80 mt-1 line-clamp-1">
                        {btn.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-emerald-600 group-hover:text-primary dark:group-hover:text-emerald-300 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                </button>
              );
            })}
          </div>
        </div>

      </motion.div>
    </motion.div>
  );
};

