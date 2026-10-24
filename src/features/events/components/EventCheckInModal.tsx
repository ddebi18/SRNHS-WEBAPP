import React, { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SchoolEvent, EventAttendance } from '@/types/domain.types';
import { recordEventAttendance, resolveStudentByLrn } from '../api';
import { useRole } from '@/hooks/useRole';
import { isValidLRN } from '@/lib/validation';
import {
  QrCode,
  Users,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Search,
  ScanLine,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CheckInTab = 'qr' | 'manual' | 'attendees';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  event: SchoolEvent;
  attendees: EventAttendance[];
  onCheckedIn: () => void;
}

export const EventCheckInModal: React.FC<Props> = ({
  isOpen, onClose, event, attendees, onCheckedIn,
}) => {
  const { user } = useRole();
  const [tab, setTab] = useState<CheckInTab>('qr');

  // QR / LRN tab state
  const [lrnInput, setLrnInput] = useState('');
  const [lrnError, setLrnError] = useState<string | null>(null);
  const [lrnSuccess, setLrnSuccess] = useState<string | null>(null);

  // Manual override state
  const [manualLrn, setManualLrn] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);

  const resetFeedback = () => {
    setLrnError(null);
    setLrnSuccess(null);
    setManualError(null);
    setManualSuccess(null);
  };

  // ── LRN/QR check-in ───────────────────────────────────────────────────────

  const handleLrnCheckIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    const clean = lrnInput.trim();

    if (!clean) { setLrnError('Enter the student\'s LRN.'); return; }
    if (!isValidLRN(clean)) { setLrnError('LRN must be exactly 12 digits.'); return; }

    const student = resolveStudentByLrn(clean);
    if (!student) {
      setLrnError('No student found with that LRN. Make sure they are registered in the system.');
      return;
    }

    const result = await recordEventAttendance({
      eventId: event.id,
      studentId: student.id,
      studentName: student.name,
      studentLrn: student.lrn,
      sectionName: student.sectionName,
      method: 'qr',
      recordedBy: user?.id,
    });

    if (result.success) {
      setLrnSuccess(`✓ ${student.name} checked in successfully.`);
      setLrnInput('');
      onCheckedIn();
    } else {
      setLrnError(result.message);
    }
  }, [lrnInput, event.id, user, onCheckedIn]);

  // ── Manual override ────────────────────────────────────────────────────────

  const handleManualCheckIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    const clean = manualLrn.trim();

    if (!clean) { setManualError('Enter the student\'s LRN.'); return; }
    if (!isValidLRN(clean)) { setManualError('LRN must be exactly 12 digits.'); return; }

    const student = resolveStudentByLrn(clean);
    if (!student) {
      setManualError('No student found with that LRN.');
      return;
    }

    const result = await recordEventAttendance({
      eventId: event.id,
      studentId: student.id,
      studentName: student.name,
      studentLrn: student.lrn,
      sectionName: student.sectionName,
      method: 'manual',
      recordedBy: user?.id,
      notes: manualNotes.trim() || undefined,
    });

    if (result.success) {
      setManualSuccess(`✓ ${student.name} manually recorded.`);
      setManualLrn('');
      setManualNotes('');
      onCheckedIn();
    } else {
      setManualError(result.message);
    }
  }, [manualLrn, manualNotes, event.id, user, onCheckedIn]);

  const methodBadge = (method: string) => {
    const cfg: Record<string, { label: string; cls: string }> = {
      qr:     { label: 'QR Scan',  cls: 'text-violet-400 bg-violet-400/10' },
      face:   { label: 'Face ID',  cls: 'text-emerald-400 bg-emerald-400/10' },
      manual: { label: 'Manual',   cls: 'text-amber-400 bg-amber-400/10' },
    };
    const c = cfg[method] || { label: method, cls: 'text-slate-400 bg-slate-700' };
    return (
      <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', c.cls)}>
        {c.label}
      </span>
    );
  };

  const tabs: { id: CheckInTab; label: string; icon: React.ReactNode }[] = [
    { id: 'qr',       label: 'LRN / QR',   icon: <QrCode size={14} /> },
    { id: 'manual',   label: 'Manual',      icon: <UserPlus size={14} /> },
    { id: 'attendees',label: `Attendees (${attendees.length})`, icon: <ClipboardList size={14} /> },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Check-In: ${event.title}`}
    >
      <div className="flex flex-col gap-4" style={{ minHeight: '360px' }}>
        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-slate-900/60 rounded-xl">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); resetFeedback(); }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors',
                tab === t.id
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── QR / LRN Tab ── */}
        {tab === 'qr' && (
          <form onSubmit={handleLrnCheckIn} className="flex flex-col gap-3">
            <p className="text-xs text-slate-400">
              Student scans the event QR code (coming soon via kiosk), or staff enters the student's 12-digit LRN below.
            </p>

            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">Student LRN</span>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="event-checkin-lrn"
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  value={lrnInput}
                  onChange={e => { setLrnInput(e.target.value.replace(/\D/g, '')); resetFeedback(); }}
                  placeholder="123456789012"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                  autoFocus
                />
              </div>
            </label>

            {lrnError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle size={13} className="shrink-0" />
                {lrnError}
              </div>
            )}
            {lrnSuccess && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                <CheckCircle2 size={13} className="shrink-0" />
                {lrnSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={lrnInput.length !== 12}
              className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <ScanLine size={15} />
              Record Check-In
            </button>
          </form>
        )}

        {/* ── Manual Override Tab ── */}
        {tab === 'manual' && (
          <form onSubmit={handleManualCheckIn} className="flex flex-col gap-3">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>Manual override is logged with your staff ID. Use only when QR or Face ID is unavailable.</span>
            </div>

            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">Student LRN</span>
              <input
                id="event-manual-lrn"
                type="text"
                inputMode="numeric"
                maxLength={12}
                value={manualLrn}
                onChange={e => { setManualLrn(e.target.value.replace(/\D/g, '')); resetFeedback(); }}
                placeholder="123456789012"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
              />
            </label>

            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">Notes (optional)</span>
              <input
                type="text"
                value={manualNotes}
                onChange={e => setManualNotes(e.target.value)}
                placeholder="e.g. Arrived late due to health reason"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
              />
            </label>

            {manualError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle size={13} className="shrink-0" />
                {manualError}
              </div>
            )}
            {manualSuccess && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                <CheckCircle2 size={13} className="shrink-0" />
                {manualSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={manualLrn.length !== 12}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <UserPlus size={15} />
              Manual Override
            </button>
          </form>
        )}

        {/* ── Attendees Tab ── */}
        {tab === 'attendees' && (
          <div className="flex flex-col gap-2">
            {attendees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Users size={32} className="mb-3 opacity-30" />
                <p className="text-sm">No check-ins yet for this event.</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-72 space-y-1.5 pr-1">
                {attendees.map((a, idx) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400 font-mono shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm text-white font-medium leading-tight">
                          {a.student_name || a.student_lrn || a.student_id}
                        </p>
                        <p className="text-xs text-slate-500">
                          {a.section_name && <span className="mr-2">{a.section_name}</span>}
                          {new Date(a.checked_in_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                          {a.notes && <span className="ml-2 italic opacity-70">{a.notes}</span>}
                        </p>
                      </div>
                    </div>
                    {methodBadge(a.method)}
                  </div>
                ))}
              </div>
            )}
            <p className="text-center text-xs text-slate-500">
              {attendees.length} student{attendees.length !== 1 ? 's' : ''} checked in
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
