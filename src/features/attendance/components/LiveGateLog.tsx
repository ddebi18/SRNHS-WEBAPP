import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RecognitionEvent } from '@/types/domain.types';
import { supabaseRecognitionAdapter } from '../services/SupabaseRecognitionAdapter';
import { DataTable, Column } from '@/components/ui/DataTable';
import { SourceBadge } from '@/components/ui/StatusBadge';
import { ManualEntryModal } from './ManualEntryModal';
import { LiveCameraFeedCard } from './LiveCameraFeedCard';
import { Plus, RefreshCw, User } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';
import { cn } from '@/lib/utils';

export const LiveGateLog: React.FC = () => {
  const { isAdmin } = useRole();
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [manualModalOpen, setManualModalOpen] = useState(false);

  const loadEvents = async () => {
    setIsLoading(true);
    const data = await supabaseRecognitionAdapter.getEvents();
    setEvents(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadEvents();
    const unsubscribe = supabaseRecognitionAdapter.subscribeToEvents(newEvent => {
      setEvents(prev => {
        if (prev.some(e => e.id === newEvent.id)) return prev;
        return [newEvent, ...prev];
      });
    });
    return () => unsubscribe();
  }, []);

  if (!isAdmin) {
    return <ForbiddenState message="School-wide turnstile gate entry/exit logs are restricted to School Administrators only." />;
  }

  // Summary counts
  const entries = events.filter(e => e.event_type === 'entry').length;
  const exits = events.filter(e => e.event_type === 'exit').length;
  const checkins = events.filter(e => e.event_type === 'classroom_checkin').length;

  const columns: Column<RecognitionEvent>[] = [
    {
      header: 'Student',
      cell: evt => (
        <div className="flex items-center gap-3">
          {evt.student_photo ? (
            <img src={evt.student_photo} alt={evt.student_name} className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
              <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </div>
          )}
          <div>
            <div className="font-bold text-slate-900 dark:text-slate-100">{evt.student_name}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{evt.student_lrn}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Section',
      cell: evt => <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{evt.section_name}</span>,
    },
    {
      header: 'Event',
      cell: evt => (
        <span className={cn(
          'px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide',
          evt.event_type === 'entry' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50' :
          evt.event_type === 'exit'  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50' :
          'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50'
        )}>
          {evt.event_type}
        </span>
      ),
    },
    {
      header: 'Location',
      cell: evt => <span className="text-sm text-slate-600 dark:text-slate-400">{evt.room_name || '—'}</span>,
    },
    {
      header: 'Confidence',
      cell: evt => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                evt.confidence_score >= 0.95 ? 'bg-emerald-500' :
                evt.confidence_score >= 0.85 ? 'bg-amber-500' : 'bg-rose-500'
              )}
              style={{ width: `${Math.round(evt.confidence_score * 100)}%` }}
            />
          </div>
          <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-400">
            {(evt.confidence_score * 100).toFixed(1)}%
          </span>
        </div>
      ),
    },
    {
      header: 'Source',
      cell: evt => <SourceBadge source={evt.source} />,
    },
    {
      header: 'Date & Time',
      cell: evt => (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            {new Date(evt.captured_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {new Date(evt.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-50">Today's Gate Entry / Exit Log</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Real-time feed from facial recognition turnstile cameras at SRNHS main gates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700/40 text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Realtime
          </div>
          <button
            onClick={loadEvents}
            className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all backdrop-blur-sm"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setManualModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sidebar text-white text-sm font-bold hover:opacity-90 transition-all shadow-card-sm"
          >
            <Plus className="w-4 h-4" />
            Manual Entry
          </button>
        </div>
      </div>

      {/* Summary chips */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap gap-3"
      >
        {[
          { label: 'Total Scans', value: events.length, dot: 'bg-emerald-500', lightBg: 'bg-white/80', darkBg: 'dark:bg-emerald-950/30', border: 'border-emerald-200/60 dark:border-emerald-700/40', glow: 'glow-emerald' },
          { label: 'Gate Entries', value: entries, dot: 'bg-sky-500', lightBg: 'bg-white/80', darkBg: 'dark:bg-sky-950/30', border: 'border-sky-200/60 dark:border-sky-700/40', glow: 'glow-sky' },
          { label: 'Gate Exits', value: exits, dot: 'bg-amber-500', lightBg: 'bg-white/80', darkBg: 'dark:bg-amber-950/30', border: 'border-amber-200/60 dark:border-amber-700/40', glow: 'glow-amber' },
          { label: 'Class Check-ins', value: checkins, dot: 'bg-violet-500', lightBg: 'bg-white/80', darkBg: 'dark:bg-violet-950/30', border: 'border-violet-200/60 dark:border-violet-700/40', glow: 'glow-violet' },
        ].map(chip => (
          <div
            key={chip.label}
            className={cn(
              'px-4 py-2.5 rounded-2xl flex items-center gap-3 border transition-all backdrop-blur-sm',
              chip.lightBg, chip.darkBg, chip.border, chip.glow
            )}
          >
            <span className="text-xl font-black text-slate-900 dark:text-slate-50">{chip.value}</span>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', chip.dot)} />
              {chip.label}
            </span>
          </div>
        ))}
      </motion.div>

      {/* Live Turnstile Camera Feed Viewfinder Card (Admin only) */}
      {isAdmin && <LiveCameraFeedCard />}

      {/* Table */}
      <DataTable
        data={events}
        columns={columns}
        keyExtractor={evt => evt.id}
        isLoading={isLoading}
        emptyTitle="No gate scans logged today"
        emptyDescription="Turnstile camera scans will stream in automatically as students pass through the gate."
        searchPlaceholder="Search by student name or LRN…"
        searchFilter={(evt, q) =>
          (evt.student_name || '').toLowerCase().includes(q.toLowerCase()) ||
          (evt.student_lrn || '').includes(q)
        }
      />

      <ManualEntryModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        onSuccess={loadEvents}
      />
    </div>
  );
};
