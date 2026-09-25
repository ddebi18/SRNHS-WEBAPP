import React from 'react';
import { ShieldAlert, AlertTriangle, FileText } from 'lucide-react';

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'Loading data…' }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-3">
    <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-700 border-t-primary rounded-full animate-spin" />
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
  </div>
);

export const EmptyState: React.FC<{
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({
  title = 'Nothing here yet',
  description = 'There are no records matching your current filters.',
  actionLabel,
  onAction,
}) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-slate-50/60 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 my-4">
    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
      <FileText className="w-5 h-5" />
    </div>
    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{title}</h4>
    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">{description}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-light transition-colors shadow-sm"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
}> = ({
  title = "Couldn't load data",
  message = 'Something went wrong connecting to the data service. Check your connection and try again.',
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center text-center py-10 px-6 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/40 my-4">
    <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-3">
      <AlertTriangle className="w-5 h-5" />
    </div>
    <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200 mb-1">{title}</h4>
    <p className="text-xs text-rose-600 dark:text-rose-400 max-w-sm mb-4">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors shadow-sm"
      >
        Try Again
      </button>
    )}
  </div>
);

export const ForbiddenState: React.FC<{ message?: string }> = ({
  message = 'Your faculty role does not permit viewing this section. Contact the school administrator if you believe this is an error.',
}) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/40 my-6">
    <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3">
      <ShieldAlert className="w-5 h-5" />
    </div>
    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Restricted Access</h3>
    <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mb-4">{message}</p>
    <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 shadow-sm">
      Protected by Access Control Policies
    </div>
  </div>
);
