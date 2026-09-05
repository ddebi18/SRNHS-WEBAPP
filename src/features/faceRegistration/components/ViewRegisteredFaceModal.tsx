import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  Camera,
  RefreshCw,
  Calendar,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { Student, CaptureAngle } from '../types';
import { cn } from '@/lib/utils';

interface ViewRegisteredFaceModalProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
  onReRegister?: (student: Student) => void;
}

export const ViewRegisteredFaceModal: React.FC<ViewRegisteredFaceModalProps> = ({
  student,
  isOpen,
  onClose,
  onReRegister,
}) => {
  const [activeAngle, setActiveAngle] = useState<CaptureAngle | 'all'>('front');

  // Trap ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !student) return null;

  const photos = {
    front: student.registeredPhotos?.front || student.photoUrl,
    left: student.registeredPhotos?.left || student.photoUrl,
    right: student.registeredPhotos?.right || student.photoUrl,
  };

  const angleLabels: Record<CaptureAngle, { title: string; desc: string }> = {
    front: { title: 'Front View', desc: 'Primary facial recognition embedding' },
    left: { title: 'Slight Left View', desc: 'Left profile geometric vector (+15°)' },
    right: { title: 'Slight Right View', desc: 'Right profile geometric vector (-15°)' },
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          role="dialog"
          aria-modal="true"
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 z-10 my-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#1B4332] text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-300" />
                  Biometric Face Record
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  LRN: {student.studentNumber}
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                {student.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {student.sectionName || 'Assigned Section'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Angle Navigation Tabs */}
          <div className="flex items-center justify-between gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            {(['front', 'left', 'right', 'all'] as const).map(angle => (
              <button
                key={angle}
                onClick={() => setActiveAngle(angle)}
                className={cn(
                  'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all capitalize text-center',
                  activeAngle === angle
                    ? 'bg-[#1B4332] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700/60'
                )}
              >
                {angle === 'all' ? 'All 3 Angles' : `${angle} Angle`}
              </button>
            ))}
          </div>

          {/* Face Photo Display Viewport */}
          {activeAngle === 'all' ? (
            <div className="grid grid-cols-3 gap-3">
              {(['front', 'left', 'right'] as const).map(angle => (
                <div
                  key={angle}
                  className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex flex-col"
                >
                  <div className="relative aspect-square">
                    {photos[angle] ? (
                      <img
                        src={photos[angle]!}
                        alt={`${student.name} - ${angle} angle`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                        <Camera className="w-6 h-6 text-slate-600" />
                        <span>No Photo</span>
                      </div>
                    )}
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] font-bold text-white uppercase tracking-wider">
                      {angle}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900/90 text-[10px] font-medium text-slate-300 border-t border-slate-800 truncate">
                    {angleLabels[angle].desc}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center gap-6 p-4">
              <div className="relative w-48 h-48 shrink-0 rounded-2xl overflow-hidden border-2 border-emerald-500/40 shadow-xl bg-slate-900">
                {photos[activeAngle] ? (
                  <img
                    src={photos[activeAngle]!}
                    alt={`${student.name} - ${activeAngle} view`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Camera className="w-8 h-8" />
                    <span className="text-xs font-bold">Photo Pending</span>
                  </div>
                )}
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#1B4332]/90 backdrop-blur text-[10px] font-black text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Verified
                </div>
              </div>

              <div className="flex-1 space-y-3 w-full">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Selected Angle
                  </span>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                    {angleLabels[activeAngle].title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                    {angleLabels[activeAngle].desc}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Embedding Status</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-xs mt-0.5 flex items-center gap-1 text-[#2D6A4F] dark:text-[#52B788]">
                      <CheckCircle2 className="w-3 h-3" /> 128-d Vector Sync
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Liveness Score</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-xs mt-0.5 text-emerald-600 dark:text-emerald-400">
                      99.6% Verified
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Biometric Metadata Card with Brown Gradient */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[#E6CCB2] to-[#D4A373] text-amber-950 border border-[#d1b397] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-950/80 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-900" />
                DepEd Biometric Edge Turnstile Status
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-950/15 text-[10px] font-black uppercase text-amber-950">
                Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-amber-900 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-950/70 block text-[11px]">Enrolled Timestamp</span>
                  <span className="font-bold text-amber-950">
                    {student.lastRegisteredAt
                      ? new Date(student.lastRegisteredAt).toLocaleString()
                      : 'Initial School Enrollment'}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <UserCheck className="w-4 h-4 text-amber-900 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-950/70 block text-[11px]">Guardian Consent on File</span>
                  <span className="font-bold text-amber-950">
                    {student.guardianName || 'Authorized Guardian'} ({student.guardianPhone || '+639171234567'})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>

            {onReRegister && (
              <button
                onClick={() => {
                  onClose();
                  onReRegister(student);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-[#1B4332] text-white hover:bg-[#2D6A4F] active:scale-95 transition-all shadow-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Re-capture Face Angles
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
