import React from 'react';
import { Camera, CheckCircle2, AlertCircle, Clock, RefreshCw, Eye } from 'lucide-react';
import { Student } from '../types';
import { cn } from '@/lib/utils';

interface StudentRosterRowProps {
  student: Student;
  onOpenCapture: (student: Student) => void;
  onViewFace?: (student: Student) => void;
}

export const StudentRosterRow: React.FC<StudentRosterRowProps> = ({
  student,
  onOpenCapture,
  onViewFace,
}) => {
  const status = student.faceRegistrationStatus;
  const isRegisteredOrReview = status === 'registered' || status === 'needs_review';

  return (
    <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800 shadow-card-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-emerald-500/40">
      {/* Left: Student Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => isRegisteredOrReview && onViewFace && onViewFace(student)}
          disabled={!isRegisteredOrReview || !onViewFace}
          className={cn(
            'relative shrink-0 rounded-2xl group transition-transform text-left',
            isRegisteredOrReview && onViewFace ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
          )}
          title={isRegisteredOrReview ? 'Click to view registered face photos' : undefined}
        >
          {student.photoUrl ? (
            <img
              src={student.photoUrl}
              alt={student.name}
              className="w-12 h-12 rounded-2xl object-cover border border-slate-200 dark:border-slate-800 shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-black text-sm shadow-sm">
              {student.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          {isRegisteredOrReview && onViewFace && (
            <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Eye className="w-4 h-4" />
            </div>
          )}

          {status === 'registered' && (
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center border border-white dark:border-slate-900">
              <CheckCircle2 className="w-3 h-3" />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{student.name}</h4>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
            LRN: {student.studentNumber} · {student.sectionName || 'Assigned Section'}
          </div>
        </div>
      </div>

      {/* Middle & Right: Status Badge + Actions */}
      <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 flex-wrap">
        {/* Status Badge */}
        {status === 'registered' ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Registered</span>
            {student.lastRegisteredAt && (
              <span className="text-[10px] opacity-75 font-normal ml-0.5">
                ({new Date(student.lastRegisteredAt).toLocaleDateString()})
              </span>
            )}
          </div>
        ) : status === 'needs_review' ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Needs Review</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>Not Registered</span>
          </div>
        )}

        {/* View Face Photos Button (if registered) */}
        {isRegisteredOrReview && onViewFace && (
          <button
            type="button"
            onClick={() => onViewFace(student)}
            className="px-3.5 py-2 rounded-xl text-xs font-black bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            View Face
          </button>
        )}

        {/* Register / Re-register Button */}
        <button
          type="button"
          onClick={() => onOpenCapture(student)}
          className={cn(
            'px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer',
            status === 'registered'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              : status === 'needs_review'
              ? 'bg-amber-500 text-white hover:bg-amber-600 border border-amber-600 shadow-sm'
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm shadow-emerald-900/20'
          )}
        >
          {status === 'registered' ? (
            <>
              <RefreshCw className="w-3.5 h-3.5" /> Re-Register
            </>
          ) : status === 'needs_review' ? (
            <>
              <RefreshCw className="w-3.5 h-3.5" /> Recapture
            </>
          ) : (
            <>
              <Camera className="w-3.5 h-3.5" /> Register Face
            </>
          )}
        </button>
      </div>
    </div>
  );
};
