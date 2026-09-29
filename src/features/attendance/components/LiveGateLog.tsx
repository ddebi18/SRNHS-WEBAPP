import React, { useEffect, useState } from 'react';
import { RecognitionEvent } from '@/types/domain.types';
import { supabaseRecognitionAdapter } from '../services/SupabaseRecognitionAdapter';
import { DataTable, Column } from '@/components/ui/DataTable';
import { SourceBadge } from '@/components/ui/StatusBadge';
import { ManualEntryModal } from './ManualEntryModal';
import { LiveCameraFeedCard } from './LiveCameraFeedCard';
import { Modal } from '@/components/ui/Modal';
import { Plus, RefreshCw, User, ShieldAlert, AlertCircle, Eye, ShieldCheck, Clock } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';
import { cn } from '@/lib/utils';

export const LiveGateLog: React.FC = () => {
  const { isAdmin } = useRole();
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [selectedSecurityEvent, setSelectedSecurityEvent] = useState<RecognitionEvent | null>(null);

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
  const entries = events.filter(e => e.event_type === 'entry' && e.status !== 'unidentified' && e.status !== 'ambiguous').length;
  const exits = events.filter(e => e.event_type === 'exit' && e.status !== 'unidentified' && e.status !== 'ambiguous').length;
  const securityAlerts = events.filter(e => e.status === 'unidentified' || e.status === 'ambiguous').length;

  const columns: Column<RecognitionEvent>[] = [
    {
      header: 'Student / Subject',
      cell: evt => {
        const isUnidentified = evt.status === 'unidentified';
        const isAmbiguous = evt.status === 'ambiguous';
        const isSecurity = isUnidentified || isAmbiguous;

        return (
          <div className="flex items-center gap-3">
            {isSecurity ? (
              evt.captured_image_url ? (
                <button
                  onClick={() => setSelectedSecurityEvent(evt)}
                  className="relative group shrink-0"
                  title="Click to view security capture"
                >
                  <img
                    src={evt.captured_image_url}
                    alt="Security Capture"
                    className={cn(
                      'w-9 h-9 rounded-full object-cover shrink-0 border-2 transition-transform group-hover:scale-105',
                      isUnidentified ? 'border-rose-500' : 'border-amber-500'
                    )}
                  />
                  <span className={cn(
                    'absolute -bottom-1 -right-1 p-0.5 rounded-full text-white text-[9px]',
                    isUnidentified ? 'bg-rose-600' : 'bg-amber-600'
                  )}>
                    {isUnidentified ? <ShieldAlert className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                  </span>
                </button>
              ) : (
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center shrink-0 border',
                  isUnidentified
                    ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400'
                    : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900/50 text-amber-600 dark:text-amber-400'
                )}>
                  {isUnidentified ? <ShieldAlert className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                </div>
              )
            ) : evt.student_photo ? (
              <img
                src={evt.student_photo}
                alt={evt.student_name}
                className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </div>
            )}

            <div>
              <div className={cn(
                'font-semibold text-xs flex items-center gap-1.5',
                isUnidentified ? 'text-rose-900 dark:text-rose-200' :
                isAmbiguous ? 'text-amber-900 dark:text-amber-200' :
                'text-slate-900 dark:text-slate-100'
              )}>
                <span>{evt.student_name}</span>
                {isSecurity && (
                  <button
                    onClick={() => setSelectedSecurityEvent(evt)}
                    className="text-[10px] text-slate-400 hover:text-primary dark:hover:text-emerald-400 inline-flex items-center gap-0.5"
                    title="Review capture"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className={cn(
                'text-[11px] font-mono',
                isUnidentified ? 'text-rose-600/80 dark:text-rose-400/80' :
                isAmbiguous ? 'text-amber-700 dark:text-amber-400' :
                'text-slate-500 dark:text-slate-400'
              )}>
                {evt.student_lrn}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Section',
      cell: evt => (
        <span className="text-xs text-slate-700 dark:text-slate-300">
          {evt.status === 'unidentified' || evt.status === 'ambiguous' ? '—' : (evt.section_name || '—')}
        </span>
      ),
    },
    {
      header: 'Event Status',
      cell: evt => {
        if (evt.status === 'unidentified') {
          return (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 inline-flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-rose-600" />
              Unidentified Face
            </span>
          );
        }
        if (evt.status === 'ambiguous') {
          return (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 inline-flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-amber-600" />
              Ambiguous Match
            </span>
          );
        }
        return (
          <span className={cn(
            'px-2 py-0.5 rounded text-[11px] font-medium capitalize',
            evt.event_type === 'entry' ? 'bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300' :
            evt.event_type === 'exit'  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' :
            'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
          )}>
            {evt.event_type}
          </span>
        );
      },
    },
    {
      header: 'Gate / Location',
      cell: evt => <span className="text-xs text-slate-600 dark:text-slate-400">{evt.room_name || evt.gate_id || '—'}</span>,
    },
    {
      header: 'Score / Margin',
      cell: evt => {
        const score = evt.top_similarity_score ?? evt.confidence_score;
        const isUnidentified = evt.status === 'unidentified';
        const isAmbiguous = evt.status === 'ambiguous';

        return (
          <div className="flex items-center gap-2">
            <div className="w-14 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  isUnidentified ? 'bg-rose-500' :
                  isAmbiguous ? 'bg-amber-500' :
                  score >= 0.90 ? 'bg-green-600' :
                  score >= 0.70 ? 'bg-amber-500' : 'bg-red-500'
                )}
                style={{ width: `${Math.min(100, Math.round(score * 100))}%` }}
              />
            </div>
            <span className={cn(
              'text-xs font-mono',
              isUnidentified ? 'text-rose-600 dark:text-rose-400' :
              isAmbiguous ? 'text-amber-600 dark:text-amber-400' :
              'text-slate-600 dark:text-slate-400'
            )}>
              {(score * 100).toFixed(1)}%
            </span>
          </div>
        );
      },
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
          { label: 'Security Alerts', value: securityAlerts, dot: 'bg-rose-500' },
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
        searchPlaceholder="Search by student name, LRN, or status…"
        searchFilter={(evt, q) =>
          (evt.student_name || '').toLowerCase().includes(q.toLowerCase()) ||
          (evt.student_lrn || '').includes(q) ||
          (evt.status || '').toLowerCase().includes(q.toLowerCase())
        }
      />

      <ManualEntryModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        onSuccess={loadEvents}
      />

      {/* Security Review Modal (Admin Only) */}
      <Modal
        isOpen={!!selectedSecurityEvent}
        onClose={() => setSelectedSecurityEvent(null)}
        title={selectedSecurityEvent?.status === 'ambiguous' ? 'Ambiguous Biometric Match Review' : 'Unidentified Face Security Review'}
        subtitle="Confidential audit review for campus security administrators"
        maxWidth="lg"
      >
        {selectedSecurityEvent && (
          <div className="space-y-5">
            {/* Top overview card */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              {selectedSecurityEvent.captured_image_url ? (
                <img
                  src={selectedSecurityEvent.captured_image_url}
                  alt="Captured Face"
                  className="w-28 h-28 rounded-xl object-cover border-2 border-rose-500/70 shadow-sm shrink-0"
                />
              ) : (
                <div className="w-28 h-28 rounded-xl bg-slate-200 dark:bg-slate-700 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                  <ShieldAlert className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-mono">No Image</span>
                </div>
              )}

              <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className={cn(
                    'px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1',
                    selectedSecurityEvent.status === 'ambiguous'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                  )}>
                    {selectedSecurityEvent.status === 'ambiguous' ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" /> Ambiguous Detection
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5" /> Unregistered Face
                      </>
                    )}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    ID: {selectedSecurityEvent.id.slice(0, 8)}...
                  </span>
                </div>

                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedSecurityEvent.status === 'ambiguous'
                    ? 'Multiple potential student identities detected within tolerance'
                    : 'Individual does not match any enrolled student roster records'}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="font-medium text-slate-500">Location:</span> {selectedSecurityEvent.room_name || selectedSecurityEvent.gate_id || 'Main Turnstile'}
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">Top Similarity:</span>{' '}
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {(((selectedSecurityEvent.top_similarity_score ?? selectedSecurityEvent.confidence_score)) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>
                      {new Date(selectedSecurityEvent.captured_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ambiguous candidates list */}
            {selectedSecurityEvent.status === 'ambiguous' && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Candidate Matches (Margin &lt; 8.0%)
                </h4>
                <div className="space-y-1.5">
                  {(selectedSecurityEvent.candidate_student_ids || []).map((cand, idx) => (
                    <div
                      key={cand.student_id || idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{cand.student_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">LRN: {cand.lrn}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-amber-700 dark:text-amber-400">
                          {(cand.similarity * 100).toFixed(1)}%
                        </div>
                        <span className="text-[10px] text-slate-400">Similarity</span>
                      </div>
                    </div>
                  ))}
                  {(!selectedSecurityEvent.candidate_student_ids || selectedSecurityEvent.candidate_student_ids.length === 0) && (
                    <p className="text-xs text-slate-500 italic">No candidate details attached to this record.</p>
                  )}
                </div>
              </div>
            )}

            {/* RA 10173 Compliance notice */}
            <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <span className="font-semibold">RA 10173 Data Privacy Act Compliance:</span>
                <p className="text-[11px] opacity-90">
                  Biometric captures of unidentified visitors are stored in an encrypted vault accessible exclusively by authorized administrators. In compliance with school security retention policy, records are automatically purged after 30 days.
                </p>
              </div>
            </div>

            {/* Footer action */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedSecurityEvent(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Close Review
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
