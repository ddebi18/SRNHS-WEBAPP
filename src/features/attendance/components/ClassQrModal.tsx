import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '@/components/ui/Modal';
import {
  createClassQrSession,
  revokeClassQrSession,
} from '../api/classQrApi';
import { ClassQrSession } from '@/types/domain.types';
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  Users,
  Maximize2,
  Minimize2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface ClassQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectTitle: string;
  onStudentCheckedIn?: (studentName: string) => void;
}

const DEFAULT_TTL_SECONDS = 90;

export const ClassQrModal: React.FC<ClassQrModalProps> = ({
  isOpen,
  onClose,
  teacherId,
  sectionId,
  sectionName,
  subjectId,
  subjectTitle,
  onStudentCheckedIn,
}) => {
  const [session, setSession] = useState<ClassQrSession | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(DEFAULT_TTL_SECONDS);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate / Rotate session
  const rotateSession = useCallback(async () => {
    if (!teacherId || !sectionId || !subjectId) return;
    setIsLoading(true);
    try {
      const newSession = await createClassQrSession({
        teacher_id: teacherId,
        section_id: sectionId,
        subject_id: subjectId,
        ttlSeconds: DEFAULT_TTL_SECONDS,
      });
      setSession(newSession);
      setSecondsRemaining(DEFAULT_TTL_SECONDS);
    } catch (err) {
      console.warn('Failed to create QR session:', err);
    } finally {
      setIsLoading(false);
    }
  }, [teacherId, sectionId, subjectId]);

  // Start on modal open
  useEffect(() => {
    if (isOpen) {
      setAttendees([]);
      rotateSession();
    } else {
      if (session) {
        revokeClassQrSession(session.id);
      }
      setSession(null);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !session) return;

    timerRef.current = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          // Time expired: auto-rotate
          rotateSession();
          return DEFAULT_TTL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, session, rotateSession]);

  // Realtime subscription for attendee scans
  useEffect(() => {
    if (!isOpen || !supabase) return;

    const channel = supabase
      .channel(`qr_attendance_${sectionId}_${subjectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'recognition_events' },
        payload => {
          const newRow = payload.new as any;
          if (newRow.subject_id === subjectId) {
            const name = newRow.student_name || 'Enrolled Student';
            setAttendees(prev => (prev.includes(name) ? prev : [name, ...prev]));
            onStudentCheckedIn?.(name);
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [isOpen, sectionId, subjectId, onStudentCheckedIn]);

  const handleEndSession = async () => {
    if (session) {
      await revokeClassQrSession(session.id);
    }
    onClose();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const scanUrl = session
    ? `${window.location.origin}/scan?token=${encodeURIComponent(session.token)}`
    : '';

  const progressPct = ((DEFAULT_TTL_SECONDS - secondsRemaining) / DEFAULT_TTL_SECONDS) * 100;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleEndSession}
      title="Classroom Rotating QR Attendance"
      subtitle={`${sectionName} • ${subjectTitle}`}
      maxWidth="lg"
    >
      <div ref={containerRef} className="space-y-5 bg-white dark:bg-slate-900 rounded-xl p-2">
        {/* Banner Info */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Students scan this QR to automatically check into this subject.</span>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* QR Display Card */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-50/70 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="p-4 bg-white rounded-2xl shadow-md border border-slate-100 flex items-center justify-center">
            {isLoading || !session ? (
              <div className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                <span>Generating secure token...</span>
              </div>
            ) : (
              <QRCodeSVG
                value={scanUrl}
                size={220}
                level="M"
                includeMargin={false}
              />
            )}
          </div>

          {/* Countdown timer & progress bar */}
          <div className="w-full max-w-xs mt-5 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Clock className="w-3.5 h-3.5" />
                Rotating in {secondsRemaining}s
              </span>
              <button
                type="button"
                onClick={rotateSession}
                className="text-slate-500 hover:text-emerald-600 flex items-center gap-1 font-normal transition-colors"
              >
                <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
                Rotate now
              </button>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${100 - progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Live Attendee Counter */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-600" />
              Live Check-Ins ({attendees.length})
            </span>
            <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              Realtime Active
            </span>
          </div>

          {attendees.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-1">
              Waiting for students to scan the QR code...
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
              {attendees.map((name, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleEndSession}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm"
          >
            End QR Session
          </button>
        </div>
      </div>
    </Modal>
  );
};
