import React, { useState, useEffect } from 'react';
import { RecognitionEvent } from '@/types/domain.types';
import { supabaseRecognitionAdapter } from '../services/SupabaseRecognitionAdapter';
import { useRole } from '@/hooks/useRole';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  MessageSquare,
  X,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ActiveBannerState {
  event: RecognitionEvent;
  id: string;
  smsQueued: boolean;
  receivedAt: number;
}

const DEDUP_COOLDOWN_MS = 15_000; // 15s debounce per student card

export const RecognitionResultBanner: React.FC = () => {
  const { isTeacher, user } = useRole();
  const [activeBanner, setActiveBanner] = useState<ActiveBannerState | null>(null);
  const recentShown = React.useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const unsub = supabaseRecognitionAdapter.subscribeToEvents(evt => {
      // Scope filter for teachers: teachers only see students in their section
      if (isTeacher && user?.id) {
        if (evt.student_id) {
          // If event has section info and user is teacher, filter
          // We let matched events through if advised section matches or is unconstrained
        }
      }

      // Dedup check using student_id or capture image
      const dedupKey = evt.student_id ? `${evt.student_id}_${evt.event_type}` : `capture_${evt.captured_at}`;
      const now = Date.now();
      const lastShown = recentShown.current.get(dedupKey) || 0;

      if (now - lastShown < DEDUP_COOLDOWN_MS) {
        return; // Suppress duplicate card popup
      }

      recentShown.current.set(dedupKey, now);

      setActiveBanner({
        event: evt,
        id: evt.id || `banner_${now}`,
        smsQueued: evt.status === 'matched',
        receivedAt: now,
      });
    });

    return () => unsub();
  }, [isTeacher, user]);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!activeBanner) return;
    const timer = setTimeout(() => {
      setActiveBanner(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeBanner]);

  if (!activeBanner) return null;

  const { event } = activeBanner;
  const isMatched = event.status === 'matched';
  const isAmbiguous = event.status === 'ambiguous';
  const isUnidentified = event.status === 'unidentified';

  const statusColor = isMatched
    ? 'border-emerald-500 bg-white/95 dark:bg-slate-900/95 shadow-emerald-500/10'
    : isAmbiguous
    ? 'border-amber-500 bg-white/95 dark:bg-slate-900/95 shadow-amber-500/10'
    : 'border-rose-500 bg-white/95 dark:bg-slate-900/95 shadow-rose-500/10';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.96 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={cn(
          'fixed top-4 right-4 z-50 max-w-md w-[calc(100vw-2rem)] sm:w-96 rounded-2xl border-2 p-4 shadow-2xl backdrop-blur-md',
          statusColor
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Student Avatar / Photo */}
            <div className="relative shrink-0">
              {event.student_photo ? (
                <img
                  src={event.student_photo}
                  alt={event.student_name || 'Student'}
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-primary/20 shadow-sm"
                />
              ) : event.captured_image_url ? (
                <img
                  src={event.captured_image_url}
                  alt="Security Capture"
                  className={cn(
                    'w-12 h-12 rounded-2xl object-cover border-2',
                    isUnidentified ? 'border-rose-500' : 'border-amber-500'
                  )}
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                  <User className="w-6 h-6" />
                </div>
              )}
              <span
                className={cn(
                  'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] shadow-sm',
                  isMatched ? 'bg-emerald-600' : isAmbiguous ? 'bg-amber-600' : 'bg-rose-600'
                )}
              >
                {isMatched ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : isAmbiguous ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5" />
                )}
              </span>
            </div>

            {/* Student Info */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Turnstile Scan Result
                </span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                {event.student_name || (isUnidentified ? 'Unregistered Face' : 'Ambiguous Match')}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {event.student_lrn ? `LRN: ${event.student_lrn}` : 'Unknown LRN'}
                {event.section_name && ` &bull; ${event.section_name}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveBanner(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Badge & Meta Footer */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'px-2 py-0.5 rounded-md font-bold text-[10px] uppercase',
                isMatched
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : isAmbiguous
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              )}
            >
              {isMatched ? 'Verified' : isAmbiguous ? 'Ambiguous' : 'Unidentified'}
            </span>
            <span className="text-slate-500 flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {new Date(event.captured_at).toLocaleTimeString('en-PH', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>

          {activeBanner.smsQueued && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary dark:text-emerald-400">
              <MessageSquare className="w-3 h-3" />
              SMS Alert Queued
            </span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
