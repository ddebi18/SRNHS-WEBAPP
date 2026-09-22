import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className }) => (
  <div className={cn('bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-card overflow-hidden transition-colors', className)}>
    {children}
  </div>
);

export const CardHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, description, action, className }) => (
  <div className={cn(
    'px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4',
    className
  )}>
    <div>
      <h3 className="text-base font-black text-slate-900 dark:text-slate-100">{title}</h3>
      {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

// Professional glassmorphic accent palette — harmonizes with green sidebar brand
const COLOR_MAP: Record<string, { lightBg: string; darkBg: string; border: string; glow: string; dot: string; iconBg: string; iconColor: string }> = {
  emerald:    { lightBg: 'bg-white/80', darkBg: 'dark:bg-emerald-950/30', border: 'border-emerald-200/60 dark:border-emerald-700/40', glow: 'glow-emerald', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  sky:        { lightBg: 'bg-white/80', darkBg: 'dark:bg-sky-950/30',     border: 'border-sky-200/60 dark:border-sky-700/40',     glow: 'glow-sky',     dot: 'bg-sky-500',     iconBg: 'bg-sky-100 dark:bg-sky-900/50',     iconColor: 'text-sky-600 dark:text-sky-400' },
  violet:     { lightBg: 'bg-white/80', darkBg: 'dark:bg-violet-950/30',  border: 'border-violet-200/60 dark:border-violet-700/40', glow: 'glow-violet', dot: 'bg-violet-500', iconBg: 'bg-violet-100 dark:bg-violet-900/50', iconColor: 'text-violet-600 dark:text-violet-400' },
  amber:      { lightBg: 'bg-white/80', darkBg: 'dark:bg-amber-950/30',   border: 'border-amber-200/60 dark:border-amber-700/40',   glow: 'glow-amber',  dot: 'bg-amber-500',  iconBg: 'bg-amber-100 dark:bg-amber-900/50',  iconColor: 'text-amber-600 dark:text-amber-400' },
  rose:       { lightBg: 'bg-white/80', darkBg: 'dark:bg-rose-950/30',    border: 'border-rose-200/60 dark:border-rose-700/40',     glow: 'glow-emerald', dot: 'bg-rose-500',  iconBg: 'bg-rose-100 dark:bg-rose-900/50',    iconColor: 'text-rose-600 dark:text-rose-400' },
  // Legacy aliases — map old names to the new accent system
  yellow:     { lightBg: 'bg-white/80', darkBg: 'dark:bg-amber-950/30',   border: 'border-amber-200/60 dark:border-amber-700/40',   glow: 'glow-amber',  dot: 'bg-amber-500',  iconBg: 'bg-amber-100 dark:bg-amber-900/50',  iconColor: 'text-amber-600 dark:text-amber-400' },
  pink:       { lightBg: 'bg-white/80', darkBg: 'dark:bg-rose-950/30',    border: 'border-rose-200/60 dark:border-rose-700/40',     glow: 'glow-emerald', dot: 'bg-rose-500',  iconBg: 'bg-rose-100 dark:bg-rose-900/50',    iconColor: 'text-rose-600 dark:text-rose-400' },
  green:      { lightBg: 'bg-white/80', darkBg: 'dark:bg-emerald-950/30', border: 'border-emerald-200/60 dark:border-emerald-700/40', glow: 'glow-emerald', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  blue:       { lightBg: 'bg-white/80', darkBg: 'dark:bg-sky-950/30',     border: 'border-sky-200/60 dark:border-sky-700/40',     glow: 'glow-sky',     dot: 'bg-sky-500',     iconBg: 'bg-sky-100 dark:bg-sky-900/50',     iconColor: 'text-sky-600 dark:text-sky-400' },
  cyan:       { lightBg: 'bg-white/80', darkBg: 'dark:bg-sky-950/30',     border: 'border-sky-200/60 dark:border-sky-700/40',     glow: 'glow-sky',     dot: 'bg-sky-500',     iconBg: 'bg-sky-100 dark:bg-sky-900/50',     iconColor: 'text-sky-600 dark:text-sky-400' },
  lavender:   { lightBg: 'bg-white/80', darkBg: 'dark:bg-violet-950/30',  border: 'border-violet-200/60 dark:border-violet-700/40', glow: 'glow-violet', dot: 'bg-violet-500', iconBg: 'bg-violet-100 dark:bg-violet-900/50', iconColor: 'text-violet-600 dark:text-violet-400' },
  peach:      { lightBg: 'bg-white/80', darkBg: 'dark:bg-amber-950/30',   border: 'border-amber-200/60 dark:border-amber-700/40',   glow: 'glow-amber',  dot: 'bg-amber-500',  iconBg: 'bg-amber-100 dark:bg-amber-900/50',  iconColor: 'text-amber-600 dark:text-amber-400' },
  sage:       { lightBg: 'bg-white/80', darkBg: 'dark:bg-emerald-950/30', border: 'border-emerald-200/60 dark:border-emerald-700/40', glow: 'glow-emerald', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  teal:       { lightBg: 'bg-white/80', darkBg: 'dark:bg-sky-950/30',     border: 'border-sky-200/60 dark:border-sky-700/40',     glow: 'glow-sky',     dot: 'bg-sky-500',     iconBg: 'bg-sky-100 dark:bg-sky-900/50',     iconColor: 'text-sky-600 dark:text-sky-400' },
  forestGreen:{ lightBg: 'bg-white/80', darkBg: 'dark:bg-emerald-950/30', border: 'border-emerald-200/60 dark:border-emerald-700/40', glow: 'glow-emerald', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  darkGreen:  { lightBg: 'bg-white/80', darkBg: 'dark:bg-emerald-950/30', border: 'border-emerald-200/60 dark:border-emerald-700/40', glow: 'glow-emerald', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  lightBrown: { lightBg: 'bg-white/80', darkBg: 'dark:bg-amber-950/30',   border: 'border-amber-200/60 dark:border-amber-700/40',   glow: 'glow-amber',  dot: 'bg-amber-500',  iconBg: 'bg-amber-100 dark:bg-amber-900/50',  iconColor: 'text-amber-600 dark:text-amber-400' },
  creamBrown: { lightBg: 'bg-white/80', darkBg: 'dark:bg-amber-950/30',   border: 'border-amber-200/60 dark:border-amber-700/40',   glow: 'glow-amber',  dot: 'bg-amber-500',  iconBg: 'bg-amber-100 dark:bg-amber-900/50',  iconColor: 'text-amber-600 dark:text-amber-400' },
  dark:       { lightBg: 'bg-white/80', darkBg: 'dark:bg-slate-950/40',    border: 'border-slate-200/60 dark:border-slate-700/40',    glow: '',            dot: 'bg-slate-500',  iconBg: 'bg-slate-100 dark:bg-slate-800',      iconColor: 'text-slate-600 dark:text-slate-400' },
};

export const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: keyof typeof COLOR_MAP;
  onClick?: () => void;
}> = ({ title, value, subtitle, icon: Icon, color = 'emerald', onClick }) => {
  const theme = COLOR_MAP[color] ?? COLOR_MAP['emerald']!;

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-3xl p-5 border transition-all backdrop-blur-sm',
        theme.lightBg, theme.darkBg, theme.glow, theme.border,
        onClick && 'cursor-pointer hover:-translate-y-1 hover:scale-[1.02]'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 mb-2">{title}</div>
          <div className="text-3xl font-black leading-none text-slate-900 dark:text-slate-50">{value}</div>
          {subtitle && (
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-2.5 flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', theme.dot)} />
              {subtitle}
            </div>
          )}
        </div>
        <div className={cn('p-3 rounded-2xl', theme.iconBg)}>
          <Icon className={cn('w-5 h-5', theme.iconColor)} />
        </div>
      </div>
    </div>
  );
};
