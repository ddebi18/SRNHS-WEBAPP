import React from 'react';
import { cn } from '@/lib/utils';
import { AttendanceStatus, EventSource, SmsStatus, ViolationSeverity } from '@/types/domain.types';
import { CheckCircle2, Clock, XCircle, AlertCircle, Camera, Edit3, Send } from 'lucide-react';

export const AttendanceBadge: React.FC<{ status: AttendanceStatus; size?: 'sm' | 'md' }> = ({ status, size = 'md' }) => {
  const base = cn('inline-flex items-center gap-1.5 rounded-full font-bold', size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs');
  switch (status) {
    case 'present': return <span className={cn(base, 'bg-emerald-100 text-emerald-700')}><CheckCircle2 className="w-3 h-3" /> Present</span>;
    case 'late':    return <span className={cn(base, 'bg-amber-100 text-amber-700')}><Clock className="w-3 h-3" /> Late</span>;
    case 'absent':  return <span className={cn(base, 'bg-rose-100 text-rose-700')}><XCircle className="w-3 h-3" /> Absent</span>;
    case 'excused': return <span className={cn(base, 'bg-sky-100 text-sky-700')}><AlertCircle className="w-3 h-3" /> Excused</span>;
  }
};

export const SourceBadge: React.FC<{ source: EventSource }> = ({ source }) => {
  if (source === 'camera') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-blue-100 text-blue-700">
        <Camera className="w-3 h-3" /> Face Recognition
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-purple-100 text-purple-700">
      <Edit3 className="w-3 h-3" /> Faculty Override
    </span>
  );
};

export const SmsBadge: React.FC<{ status: SmsStatus }> = ({ status }) => {
  switch (status) {
    case 'sent':   return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-700"><Send className="w-3 h-3" /> Sent</span>;
    case 'queued': return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700"><Clock className="w-3 h-3" /> Queued</span>;
    case 'failed': return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700"><AlertCircle className="w-3 h-3" /> Failed</span>;
  }
};

export const ViolationSeverityBadge: React.FC<{ severity: ViolationSeverity }> = ({ severity }) => {
  switch (severity) {
    case 'minor':    return <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700">Minor</span>;
    case 'moderate': return <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-orange-100 text-orange-700">Moderate</span>;
    case 'severe':   return <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700">Severe</span>;
  }
};

export const ConsentBadge: React.FC<{ consent: boolean; date?: string | null }> = ({ consent, date }) => {
  if (consent) {
    return (
      <span title={date ? `Signed: ${date}` : 'Consent verified'} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-teal-100 text-teal-700">
        <CheckCircle2 className="w-3 h-3" /> Consent On File
      </span>
    );
  }
  return <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-black/5 text-black/50">Pending</span>;
};
