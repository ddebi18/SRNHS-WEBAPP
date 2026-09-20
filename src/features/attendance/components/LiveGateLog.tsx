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
    // cloudOnly: read directly from Supabase so the admin sees scans from
    // every scanning device, not just events stored on this machine.
    const data = await supabaseRecognitionAdapter.getEvents({ cloudOnly: true });
    setEvents(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadEvents();
    const unsubscribe = supabaseRecognitionAdapter.subscribeToEvents(_newEvent => {
      // On any new event, re-fetch the full cloud log so new scans appear instantly
      supabaseRecognitionAdapter.getEvents({ cloudOnly: true }).then(setEvents);
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
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Today's Gate Entry / Exit Log</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Real-time feed from facial recognition turnstile cameras at SRNHS main gates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50 text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Realtime
          </div>
          <button
            onClick={loadEvents}
            className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-card-sm"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setManualModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sidebar text-white text-sm font-bold hover:bg-black/80 dark:hover:bg-slate-800 transition-colors shadow-card"
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
          { label: 'Total Scans', value: events.length, dot: 'bg-amber-950', lightBg: 'bg-gradient-to-br from-[#D4A373] to-[#C68B59] text-amber-950 border-[#ba8b5b]' },
          { label: 'Gate Entries', value: entries, dot: 'bg-amber-900', lightBg: 'bg-gradient-to-br from-[#E6CCB2] to-[#D4A373] text-amber-950 border-[#d1b397]' },
          { label: 'Gate Exits', value: exits, dot: 'bg-amber-900', lightBg: 'bg-gradient-to-br from-[#DDA15E] to-[#C68B59] text-amber-950 border-[#c28846]' },
          { label: 'Class Check-ins', value: checkins, dot: 'bg-amber-100', lightBg: 'bg-gradient-to-br from-[#C68B59] to-[#836452] text-amber-50 border-[#806143]' },
        ].map(chip => (
          <div
            key={chip.label}
            className={cn(
              'px-4 py-2.5 rounded-2xl shadow-card-sm flex items-center gap-3 border transition-colors',
              'dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100',
              chip.lightBg
            )}
          >
            <span className="text-xl font-black text-slate-900 dark:text-slate-100">{chip.value}</span>
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
