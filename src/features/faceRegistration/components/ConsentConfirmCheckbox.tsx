import React from 'react';
import { FileCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Student } from '../types';
import { cn } from '@/lib/utils';

interface ConsentConfirmCheckboxProps {
  student: Student;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const ConsentConfirmCheckbox: React.FC<ConsentConfirmCheckboxProps> = ({
  student,
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={cn(
        'p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 space-y-2.5 cursor-pointer select-none',
        checked
          ? 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/50 dark:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.12)]'
          : 'bg-amber-500/10 dark:bg-amber-950/30 border-amber-400 dark:border-amber-500/80 shadow-[0_0_18px_rgba(245,158,11,0.18)] ring-1 ring-amber-400/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id={`consent-check-${student.id}`}
            checked={checked}
            disabled={disabled}
            onChange={e => {
              e.stopPropagation();
              onChange(e.target.checked);
            }}
            className={cn(
              'mt-1 w-4 h-4 rounded cursor-pointer disabled:opacity-50 transition-colors',
              checked
                ? 'text-[#2D6A4F] focus:ring-[#2D6A4F] border-emerald-500'
                : 'text-amber-600 focus:ring-amber-500 border-amber-400 ring-2 ring-amber-400/30'
            )}
          />
          <label
            htmlFor={`consent-check-${student.id}`}
            className="text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer select-none leading-relaxed"
          >
            Guardian Biometric Data Consent On File
            <span className="block text-[11px] font-normal text-slate-600 dark:text-slate-400 mt-0.5">
              I confirm that signed guardian consent for {student.name} is verified and archived in DepEd school records.
            </span>
          </label>
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          {checked ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Required
            </span>
          )}
        </div>
      </div>

      {student.guardianName && (
        <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
          <span className="flex items-center gap-1">
            <FileCheck className={cn('w-3.5 h-3.5', checked ? 'text-[#2D6A4F]' : 'text-amber-600 dark:text-amber-400')} />
            Guardian: <strong>{student.guardianName}</strong>
          </span>
          {student.guardianPhone && (
            <span>Phone: {student.guardianPhone}</span>
          )}
        </div>
      )}
    </div>
  );
};
