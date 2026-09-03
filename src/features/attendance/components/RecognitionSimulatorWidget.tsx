import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Zap, CheckCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { EventType } from '@/types/domain.types';
import { mockRecognitionAdapter } from '../services/MockRecognitionAdapter';
import { mockNotificationAdapter } from '@/features/notifications/services/MockNotificationAdapter';
import { cn } from '@/lib/utils';

interface Props { isOpen: boolean; onClose: () => void; }

const SAMPLE_STUDENTS = [
  { id: 'std-101', name: 'Juan Carlos Garcia', lrn: '109823456701', section: 'Grade 10 – Sampaguita', photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80', phone: '+639171234567' },
  { id: 'std-102', name: 'Sophia Nicole Reyes', lrn: '109823456702', section: 'Grade 10 – Sampaguita', photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', phone: '+639189876543' },
  { id: 'std-103', name: 'Angelo Gabriel Mendoza', lrn: '109823456703', section: 'Grade 11 – STEM A', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', phone: '+639194443322' },
  { id: 'std-104', name: 'Samantha Claire Santos', lrn: '109823456704', section: 'Grade 11 – STEM A', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', phone: '+639178889900' },
  { id: 'std-105', name: 'Mark Anthony Ramos', lrn: '109823456705', section: 'Grade 10 – Sampaguita', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', phone: '+639195551212' },
];

export const RecognitionSimulatorWidget: React.FC<Props> = ({ isOpen, onClose }) => {
  const [selectedStudentId, setSelectedStudentId] = useState(SAMPLE_STUDENTS[0]!.id);
  const [eventType, setEventType] = useState<EventType>('entry');
  const [roomName, setRoomName] = useState('Main Gate Turnstile 01');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const handleSimulate = async () => {
    const student = SAMPLE_STUDENTS.find(s => s.id === selectedStudentId) ?? SAMPLE_STUDENTS[0]!;
    setScanning(true);
    setTimeout(async () => {
      const evt = await mockRecognitionAdapter.simulateScan({
        student_id: student.id,
        student_name: student.name,
        student_lrn: student.lrn,
        student_photo: student.photo,
        section_name: student.section,
        event_type: eventType,
        room_name: roomName,
      });

      const eventMsg =
        eventType === 'entry'
          ? `[SRNHS Alert] ${student.name} entered campus via ${roomName} at ${new Date(evt.captured_at).toLocaleTimeString()}.`
          : eventType === 'exit'
          ? `[SRNHS Alert] ${student.name} exited campus via ${roomName} at ${new Date(evt.captured_at).toLocaleTimeString()}.`
          : `[SRNHS Alert] ${student.name} checked into ${roomName} at ${new Date(evt.captured_at).toLocaleTimeString()}.`;

      await mockNotificationAdapter.sendAlert({
        student_id: student.id,
        student_name: student.name,
        guardian_phone: student.phone,
        message: eventMsg,
        event_type: eventType === 'entry' ? 'gate_entry' : eventType === 'exit' ? 'gate_exit' : 'unexcused_absence',
      });

      setLastScanned(`${student.name} — ${eventType.toUpperCase()} @ ${new Date().toLocaleTimeString()}`);
      setScanning(false);
      setTimeout(() => setLastScanned(null), 5000);
    }, 800);
  };

  const selectedStudent = SAMPLE_STUDENTS.find(s => s.id === selectedStudentId) ?? SAMPLE_STUDENTS[0]!;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Camera Recognition Simulator"
      subtitle="Simulate live turnstile facial recognition events for local testing and defence demonstration"
    >
      <div className="space-y-5">
        {/* Camera viewport */}
        <div className="bg-sidebar rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-mono text-white/30 mb-3">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
              CAMERA_01 · LIVE · 1080p
            </span>
            <span>CONFIDENCE_THRESHOLD: 0.95</span>
          </div>

          {/* Viewfinder */}
          <div className="relative h-36 bg-black/40 rounded-xl flex items-center justify-center overflow-hidden border border-white/10">
            {/* Selected student preview */}
            <img
              src={selectedStudent.photo}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-30"
            />
            {/* Scan overlay */}
            <div className={cn(
              'relative z-10 flex flex-col items-center gap-2',
              scanning && 'animate-pulse'
            )}>
              <div className={cn(
                'w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center transition-colors',
                scanning ? 'border-emerald-400' : 'border-white/40'
              )}>
                <Camera className={cn('w-6 h-6', scanning ? 'text-emerald-400' : 'text-white/50')} />
              </div>
              {scanning && (
                <span className="text-[11px] font-bold text-emerald-400">Matching biometrics…</span>
              )}
            </div>
            {/* Bottom info */}
            <div className="absolute bottom-2 right-2 text-[10px] font-mono text-white/30">
              {selectedStudent.name} · {selectedStudent.section}
            </div>
          </div>

          {/* Success flash */}
          {lastScanned && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-emerald-900/80 border border-emerald-700 text-emerald-300 text-xs font-bold"
            >
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              {lastScanned}
            </motion.div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Select Student</label>
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {SAMPLE_STUDENTS.map(s => (
                <option key={s.id} value={s.id} className="dark:bg-slate-800">{s.name} — {s.section}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Event Type</label>
              <select
                value={eventType}
                onChange={e => setEventType(e.target.value as EventType)}
                className="w-full px-3 py-2.5 text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="entry" className="dark:bg-slate-800">Gate Entry</option>
                <option value="exit" className="dark:bg-slate-800">Gate Exit</option>
                <option value="classroom_checkin" className="dark:bg-slate-800">Classroom Check-in</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Camera / Room</label>
              <input
                type="text"
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors">
            Close
          </button>
          <motion.button
            onClick={handleSimulate}
            disabled={scanning}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-sidebar text-white text-sm font-black hover:bg-black/80 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors shadow-card"
          >
            <Zap className="w-4 h-4 fill-white" />
            {scanning ? 'Scanning…' : 'Trigger Scan Event'}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
};
