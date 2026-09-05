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

// Brown Gradient Card Palette: Golden Sand, Light Cream Beige, Toffee, and Amber Brown Gradients
const COLOR_MAP: Record<string, { light: string; dot: string; iconBg: string }> = {
  yellow:     { light: 'bg-gradient-to-br from-[#DDA15E] to-[#C68B59] text-amber-950 border-[#c28846]', dot: 'bg-amber-900', iconBg: 'bg-amber-950/20 text-amber-950 dark:text-amber-100' },
  pink:       { light: 'bg-gradient-to-br from-[#D4A373] to-[#C68B59] text-amber-950 border-[#ba8b5b]', dot: 'bg-amber-900', iconBg: 'bg-amber-950/20 text-amber-950' },
  green:      { light: 'bg-gradient-to-br from-[#E6CCB2] to-[#D4A373] text-amber-950 border-[#d1b397]', dot: 'bg-amber-800', iconBg: 'bg-amber-950/20 text-amber-950' },
  lavender:   { light: 'bg-gradient-to-br from-[#E6CCB2] to-[#DDA15E] text-amber-950 border-[#d1b397]', dot: 'bg-amber-800', iconBg: 'bg-amber-950/20 text-amber-950' },
  peach:      { light: 'bg-gradient-to-br from-[#D4A373] to-[#C68B59] text-amber-950 border-[#ba8b5b]', dot: 'bg-amber-900', iconBg: 'bg-amber-950/20 text-amber-950' },
  blue:       { light: 'bg-gradient-to-br from-[#DDA15E] to-[#C68B59] text-amber-950 border-[#c28846]', dot: 'bg-amber-900', iconBg: 'bg-amber-950/20 text-amber-950' },
  cyan:       { light: 'bg-gradient-to-br from-[#C68B59] to-[#836452] text-amber-50 border-[#806143]',  dot: 'bg-amber-100', iconBg: 'bg-white/20 text-amber-100' },
  sage:       { light: 'bg-gradient-to-br from-[#E6CCB2] to-[#D4A373] text-amber-950 border-[#d1b397]', dot: 'bg-amber-800', iconBg: 'bg-amber-950/20 text-amber-950' },
  teal:       { light: 'bg-gradient-to-br from-[#D4A373] to-[#C68B59] text-amber-950 border-[#ba8b5b]', dot: 'bg-amber-900', iconBg: 'bg-amber-950/20 text-amber-950' },
  forestGreen:{ light: 'bg-gradient-to-br from-[#DDA15E] to-[#C68B59] text-amber-950 border-[#c28846]', dot: 'bg-amber-900', iconBg: 'bg-amber-950/20 text-amber-950' },
  darkGreen:  { light: 'bg-gradient-to-br from-[#C68B59] to-[#836452] text-amber-50 border-[#806143]',  dot: 'bg-amber-100', iconBg: 'bg-white/20 text-amber-100' },
  lightBrown: { light: 'bg-gradient-to-br from-[#D4A373] to-[#C68B59] text-amber-950 border-[#ba8b5b]', dot: 'bg-amber-900', iconBg: 'bg-amber-950/20 text-amber-950' },
  creamBrown: { light: 'bg-gradient-to-br from-[#E6CCB2] to-[#D4A373] text-amber-950 border-[#d1b397]', dot: 'bg-amber-800', iconBg: 'bg-amber-950/20 text-amber-950' },
  dark:       { light: 'bg-gradient-to-br from-[#836452] to-[#6c503f] text-white border-[#6c503f]',     dot: 'bg-amber-200', iconBg: 'bg-white/10 text-white' },
};

export const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'yellow' | 'pink' | 'green' | 'lavender' | 'peach' | 'blue' | 'cyan' | 'sage' | 'teal' | 'dark';
  onClick?: () => void;
}> = ({ title, value, subtitle, icon: Icon, color = 'yellow', onClick }) => {
  const theme = COLOR_MAP[color] ?? COLOR_MAP['yellow']!;

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-3xl p-5 shadow-card border transition-all',
        'dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100',
        theme.light,
        onClick && 'cursor-pointer hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.14)] hover:-translate-y-0.5'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">{title}</div>
          <div className="text-3xl font-black leading-none text-slate-900 dark:text-slate-100">{value}</div>
          {subtitle && (
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-2 flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', theme.dot)} />
              {subtitle}
            </div>
          )}
        </div>
        <div className={cn('p-2.5 rounded-2xl backdrop-blur-sm', theme.iconBg)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
