import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  id?: string;
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Accessible combobox with type-to-filter, keyboard navigation, empty state.
 * No new dependencies — built on native DOM + React.
 */
export const SearchableSelect: React.FC<Props> = ({
  id: externalId,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyText = 'No results',
  disabled = false,
  className,
}) => {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value) ?? null;

  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel?.toLowerCase().includes(query.toLowerCase()) ?? false)
      )
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setActiveIdx(-1);
    }
  }, [open]);

  const toggleOpen = () => {
    if (disabled) return;
    setOpen(v => !v);
    if (!open) setQuery('');
  };

  const select = (opt: SearchableSelectOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); return; }
    if (e.key === 'ArrowDown') {
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setActiveIdx(i => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter' && activeIdx >= 0 && filtered[activeIdx]) {
      select(filtered[activeIdx]);
      e.preventDefault();
    }
  };

  const triggerCls = cn(
    'w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border transition-shadow',
    'bg-white dark:bg-slate-800 text-left',
    disabled
      ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700'
      : 'cursor-pointer border-slate-200 dark:border-slate-700 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500',
    className
  );

  return (
    <div ref={containerRef} className="relative" onKeyDown={onKeyDown}>
      {/* Trigger button */}
      <div
        id={externalId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        tabIndex={disabled ? -1 : 0}
        className={triggerCls}
        onClick={toggleOpen}
      >
        <span className={cn('flex-1 truncate', !selected && 'text-slate-400')}>
          {selected ? (
            <span>
              {selected.label}
              {selected.sublabel && (
                <span className="ml-1.5 text-xs text-slate-400">{selected.sublabel}</span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected && !disabled && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear selection"
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Options"
          className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl shadow-slate-900/10 overflow-hidden"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
              placeholder="Type to filter…"
              className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
              aria-autocomplete="list"
              aria-controls={listboxId}
            />
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-400 text-center">{emptyText}</li>
            ) : (
              filtered.map((opt, idx) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => select(opt)}
                  className={cn(
                    'flex flex-col px-3 py-2 cursor-pointer text-sm transition-colors',
                    idx === activeIdx
                      ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50',
                    opt.value === value && 'font-semibold'
                  )}
                >
                  <span>{opt.label}</span>
                  {opt.sublabel && (
                    <span className="text-[11px] text-slate-400">{opt.sublabel}</span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
