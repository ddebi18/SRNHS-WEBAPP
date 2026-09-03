import React from 'react';
import { FileCheck } from 'lucide-react';
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
    <div className={cn(
      'p-4 rounded-2xl border transition-all space-y-2.5',
      checked
        ? 'bg-[#D4A373]/20 border-[#C68B59]'
        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
    )}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={`consent-check-${student.id}`}
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="mt-1 w-4 h-4 rounded text-[#2D6A4F] focus:ring-[#2D6A4F] border-slate-300 dark:border-slate-700 cursor-pointer disabled:opacity-50"
        />
        <label
          htmlFor={`consent-check-${student.id}`}
          className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer select-none leading-relaxed"
        >
          Guardian Biometric Data Consent On File
          <span className="block text-[11px] font-normal text-slate-600 dark:text-slate-400 mt-0.5">
            I confirm that signed guardian consent for {student.name} is verified and archived in DepEd school records.
          </span>
        </label>
      </div>

      {student.guardianName && (
        <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
          <span className="flex items-center gap-1">
            <FileCheck className="w-3.5 h-3.5 text-[#2D6A4F]" /> Guardian: <strong>{student.guardianName}</strong>
          </span>
          {student.guardianPhone && (
            <span>Phone: {student.guardianPhone}</span>
          )}
        </div>
      )}
    </div>
  );
};
