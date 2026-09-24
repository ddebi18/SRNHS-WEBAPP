import React, { useEffect, useState } from 'react';
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
    const unsubscribe = supabaseRecognitionAdapter.subscribeToEvents(_newEvent => {
      supabaseRecognitionAdapter.getEvents().then(setEvents);
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
            <img src={evt.student_photo} alt={evt.student_name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
              <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </div>
          )}
          <div>
            <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{evt.student_name}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{evt.student_lrn}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Section',
      cell: evt => <span className="text-xs text-slate-700 dark:text-slate-300">{evt.section_name}</span>,
    },
    {
      header: 'Event',
      cell: evt => (
        <span className={cn(
          'px-2 py-0.5 rounded text-[11px] font-medium capitalize',
          evt.event_type === 'entry' ? 'bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300' :
          evt.event_type === 'exit'  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' :
          'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
        )}>
          {evt.event_type}
        </span>
      ),
    },
    {
      header: 'Location',
      cell: evt => <span className="text-xs text-slate-600 dark:text-slate-400">{evt.room_name || '—'}</span>,
    },
    {
      header: 'Confidence',
      cell: evt => (
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                evt.confidence_score >= 0.95 ? 'bg-green-600' :
                evt.confidence_score >= 0.85 ? 'bg-amber-500' : 'bg-red-500'
              )}
              style={{ width: `${Math.round(evt.confidence_score * 100)}%` }}
            />
          </div>
          <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
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
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
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
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 bg-primary rounded-sm" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-emerald-300">Student Attendance System</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">Gate Attendance Log</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time feed from turnstile cameras at SRNHS main entrance gates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/50 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </div>
          <button
            onClick={loadEvents}
            className="p-2 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setManualModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-light transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Manual Entry
          </button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        {[
          { label: 'Total Scans', value: events.length, dot: 'bg-green-500' },
          { label: 'Gate Entries', value: entries, dot: 'bg-emerald-500' },
          { label: 'Gate Exits', value: exits, dot: 'bg-amber-500' },
          { label: 'Class Check-ins', value: checkins, dot: 'bg-slate-400' },
        ].map(chip => (
          <div
            key={chip.label}
            className="px-3.5 py-3 flex items-center gap-2.5 bg-white dark:bg-slate-900"
          >
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">{chip.value}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', chip.dot)} />
              {chip.label}
            </span>
          </div>
        ))}
      </div>

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
