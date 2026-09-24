import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';

const LORDICON_SRC = 'https://cdn.lordicon.com/lordicon.js';

let scriptPromise: Promise<void> | null = null;

function loadLordIconScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (customElements.get('lord-icon')) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise(resolve => {
    const existing = document.querySelector(`script[src="${LORDICON_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      if (customElements.get('lord-icon')) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = LORDICON_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export const LORD_ICONS = {
  school: 'https://cdn.lordicon.com/nocovwne.json',
  book: 'https://cdn.lordicon.com/hursldrn.json',
  graduate: 'https://cdn.lordicon.com/oezixobx.json',
  student: 'https://cdn.lordicon.com/dxoycpzg.json',
  login: 'https://cdn.lordicon.com/rhvddzym.json',
  bell: 'https://cdn.lordicon.com/lupuorrc.json',
  users: 'https://cdn.lordicon.com/bhfjfgqz.json',
  camera: 'https://cdn.lordicon.com/wrprwmwt.json',
  message: 'https://cdn.lordicon.com/fdxqrdfe.json',
  shield: 'https://cdn.lordicon.com/gqdnbnwt.json',
} as const;

interface LordIconProps {
  src: string;
  size?: number;
  trigger?: 'hover' | 'loop' | 'loop-on-hover' | 'click' | 'morph' | 'boomerang';
  className?: string;
  colors?: string;
}

export const LordIcon: React.FC<LordIconProps> = ({
  src,
  size = 48,
  trigger = 'loop',
  className,
  colors = 'primary:#006937,secondary:#d4a373',
}) => {
  useEffect(() => {
    loadLordIconScript();
  }, []);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-hidden>
      <lord-icon
        src={src}
        trigger={reducedMotion ? 'morph' : trigger}
        colors={colors}
        style={{ width: `${size}px`, height: `${size}px` }}
      />
    </span>
  );
};
