import React from 'react';
import { GradesManager } from '@/features/grades/components/GradesManager';

export const GradesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Academic Grades & Assessment
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quarterly learning area assessment, live final rating computation, and DepEd-compliant grading.
          </p>
        </div>
      </div>

      <GradesManager />
    </div>
  );
};
