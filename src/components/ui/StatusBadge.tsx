import React from 'react';
import { cn } from '@/lib/utils';
import { AttendanceStatus, EventSource, SmsStatus, ViolationSeverity } from '@/types/domain.types';
import { CheckCircle2, Clock, XCircle, AlertCircle, Camera, Edit3, Send } from 'lucide-react';

/**
 * Attendance states are structurally distinct — not just color swaps:
 * - Present: solid green fill, check icon, confident weight
 * - Late:    amber outline (border, no fill), clock icon, dimmer
 * - Absent:  red text only (no pill) — alarming, stands out at row level
 * - Excused: blue subdued style, info icon
 */
export const AttendanceBadge: React.FC<{ status: AttendanceStatus; size?: 'sm' | 'md' }> = ({ status, size = 'md' }) => {
  const base = size === 'sm' ? 'text-[11px]' : 'text-xs';

  switch (status) {
    case 'present':
      return (
        <span className={cn(base, 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300')}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Present
        </span>
      );
    case 'late':
      return (
        <span className={cn(base, 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300')}>
          <Clock className="w-3.5 h-3.5" /> Late
        </span>
      );
    case 'absent':
      return (
        <span className={cn(base, 'inline-flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400')}>
          <XCircle className="w-3.5 h-3.5" /> Absent
        </span>
      );
    case 'excused':
      return (
        <span className={cn(base, 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 italic')}>
          <AlertCircle className="w-3.5 h-3.5" /> Excused
        </span>
      );
  }
};

export const SourceBadge: React.FC<{ source: EventSource }> = ({ source }) => {
  if (source === 'camera') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
        <Camera className="w-3 h-3" /> Face Recognition
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
      <Edit3 className="w-3 h-3" /> Faculty Override
    </span>
  );
};

export const SmsBadge: React.FC<{ status: SmsStatus }> = ({ status }) => {
  switch (status) {
    case 'sent':   return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"><Send className="w-3 h-3" /> Sent</span>;
    case 'queued': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"><Clock className="w-3 h-3" /> Queued</span>;
    case 'failed': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300"><AlertCircle className="w-3 h-3" /> Failed</span>;
  }
};

export const ViolationSeverityBadge: React.FC<{ severity: ViolationSeverity }> = ({ severity }) => {
  switch (severity) {
    case 'minor':    return <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">Minor</span>;
    case 'moderate': return <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300">Moderate</span>;
    case 'severe':   return <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300">Severe</span>;
  }
};

export const ConsentBadge: React.FC<{ consent: boolean; date?: string | null }> = ({ consent, date }) => {
  if (consent) {
    return (
      <span title={date ? `Signed: ${date}` : 'Consent verified'} className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-md bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
        <CheckCircle2 className="w-3 h-3" /> Consent On File
      </span>
    );
  }
  return <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Pending</span>;
};
