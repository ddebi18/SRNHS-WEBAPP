import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, onClick, hoverable }) => (
  <div
    onClick={onClick}
    className={cn(
      'bg-white dark:bg-[#0A2016] border border-emerald-950/10 dark:border-emerald-800/40 rounded-lg shadow-sm overflow-hidden transition-colors duration-200',
      hoverable && 'hover:border-primary/30 dark:hover:border-emerald-600/50 cursor-pointer',
      onClick && 'cursor-pointer',
      className
    )}
  >
    {children}
  </div>
);

export const CardHeader: React.FC<{
  title: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, description, badge, action, className }) => (
  <div className={cn(
    'px-5 py-4 border-b border-emerald-950/5 dark:border-emerald-800/30 flex items-center justify-between gap-3',
    className
  )}>
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-emerald-50 tracking-tight">{title}</h3>
        {badge}
      </div>
      {description && <p className="text-xs text-slate-500 dark:text-emerald-400/80 mt-0.5">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export type MetricVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'gold';

const VARIANT_ACCENTS: Record<MetricVariant, {
  bar: string;
  iconBg: string;
  iconColor: string;
  tagBg: string;
  tagColor: string;
}> = {
  success: {
    bar: 'bg-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    iconColor: 'text-emerald-700 dark:text-emerald-300',
    tagBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    tagColor: 'text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-950/60',
    iconColor: 'text-amber-700 dark:text-amber-300',
    tagBg: 'bg-amber-50 dark:bg-amber-950/50',
    tagColor: 'text-amber-700 dark:text-amber-300',
  },
  danger: {
    bar: 'bg-rose-500',
    iconBg: 'bg-rose-50 dark:bg-rose-950/60',
    iconColor: 'text-rose-700 dark:text-rose-300',
    tagBg: 'bg-rose-50 dark:bg-rose-950/50',
    tagColor: 'text-rose-700 dark:text-rose-300',
  },
  info: {
    bar: 'bg-blue-500',
    iconBg: 'bg-blue-50 dark:bg-blue-950/60',
    iconColor: 'text-blue-700 dark:text-blue-300',
    tagBg: 'bg-blue-50 dark:bg-blue-950/50',
    tagColor: 'text-blue-700 dark:text-blue-300',
  },
  gold: {
    bar: 'bg-amber-400',
    iconBg: 'bg-amber-100/60 dark:bg-amber-950/60',
    iconColor: 'text-amber-800 dark:text-amber-200',
    tagBg: 'bg-amber-50 dark:bg-amber-950/50',
    tagColor: 'text-amber-800 dark:text-amber-200',
  },
  neutral: {
    bar: 'bg-slate-400',
    iconBg: 'bg-slate-100 dark:bg-slate-800/80',
    iconColor: 'text-slate-600 dark:text-emerald-300',
    tagBg: 'bg-slate-100 dark:bg-slate-800',
    tagColor: 'text-slate-600 dark:text-slate-300',
  },
};

function resolveVariant(color?: string): MetricVariant {
  if (!color) return 'success';
  if (['emerald', 'green', 'sage', 'forestGreen', 'darkGreen', 'teal'].includes(color)) return 'success';
  if (['amber', 'yellow', 'lightBrown', 'creamBrown', 'peach'].includes(color)) return 'warning';
  if (['gold'].includes(color)) return 'gold';
  if (['rose', 'pink', 'red'].includes(color)) return 'danger';
  if (['sky', 'blue', 'violet', 'cyan', 'lavender'].includes(color)) return 'info';
  return 'neutral';
}

export const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: string;
  variant?: MetricVariant;
  trend?: string;
  onClick?: () => void;
  className?: string;
}> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  variant,
  trend,
  onClick,
  className,
}) => {
  const v = variant || resolveVariant(color);
  const theme = VARIANT_ACCENTS[v];

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-emerald-950/10 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 dark:hover:border-emerald-500/60 transition-colors duration-200 overflow-hidden flex flex-col justify-between',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Decorative top accent line with gradient fade */}
      <div className={cn('absolute top-0 left-0 right-0 h-[3px]', theme.bar)} />

      {/* Top row: Label & Icon */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-emerald-400/90 truncate">
          {title}
        </span>
        <div className={cn('p-2 rounded-md shrink-0', theme.iconBg)}>
          <Icon className={cn('w-4 h-4', theme.iconColor)} />
        </div>
      </div>

      {/* Value & Trend */}
      <div>
        <div className="flex items-baseline gap-2.5">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-emerald-50 font-sans">
            {value}
          </div>
          {trend && (
            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md border border-black/5 dark:border-white/5', theme.tagBg, theme.tagColor)}>
              {trend}
            </span>
          )}
        </div>

        {subtitle && (
          <p className="text-[11px] text-slate-400 dark:text-emerald-400/70 mt-1.5 leading-snug line-clamp-1">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
