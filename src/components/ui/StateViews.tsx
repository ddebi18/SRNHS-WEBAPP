import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'Loading data…' }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-10 h-10 border-[3px] border-slate-200 dark:border-slate-700 border-t-slate-800 dark:border-t-slate-200 rounded-full animate-spin" />
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
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center text-center py-14 px-6 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 my-4"
  >
    <div className="text-4xl mb-3">📋</div>
    <h4 className="text-base font-black text-slate-900 dark:text-slate-100 mb-1">{title}</h4>
    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-sm mb-5">{description}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="px-5 py-2.5 rounded-2xl bg-sidebar text-white text-xs font-bold hover:bg-black/80 dark:hover:bg-slate-800 transition-colors shadow-card-sm"
      >
        {actionLabel}
      </button>
    )}
  </motion.div>
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
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center text-center py-12 px-6 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border-2 border-dashed border-rose-200 dark:border-rose-900/60 my-4"
  >
    <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-300 mb-3">
      <AlertTriangle className="w-6 h-6" />
    </div>
    <h4 className="text-base font-black text-rose-900 dark:text-rose-200 mb-1">{title}</h4>
    <p className="text-sm text-rose-600 dark:text-rose-400 font-medium max-w-sm mb-5">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-5 py-2.5 rounded-2xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors shadow-card-sm"
      >
        Try Again
      </button>
    )}
  </motion.div>
);

export const ForbiddenState: React.FC<{ message?: string }> = ({
  message = 'Your faculty role does not permit viewing this section. Contact the school administrator if you believe this is an error.',
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center text-center py-14 px-6 bg-amber-50 dark:bg-amber-950/30 rounded-3xl border-2 border-dashed border-amber-200 dark:border-amber-900/60 my-6"
  >
    <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-300 mb-4">
      <ShieldAlert className="w-7 h-7" />
    </div>
    <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-2">Restricted Access</h3>
    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium max-w-md mb-5">{message}</p>
    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 shadow-card-sm">
      🔒 Enforced via Supabase Row Level Security (RLS)
    </div>
  </motion.div>
);
