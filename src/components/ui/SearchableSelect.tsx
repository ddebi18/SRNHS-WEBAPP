import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, X, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  sublabel?: string;
}

export interface SearchableSelectProps {
  id?: string;
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  error?: string;
  isLoading?: boolean;
  className?: string;
}

/**
 * Filter utility for SearchableSelect options. Matches case-insensitively on label,
 * description, and sublabel.
 */
export function filterSelectOptions(
  options: SearchableSelectOption[],
  query: string
): SearchableSelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(o => {
    const desc = o.description || o.sublabel || '';
    return (
      o.label.toLowerCase().includes(q) ||
      desc.toLowerCase().includes(q)
    );
  });
}

/**
 * Accessible combobox with type-to-filter, keyboard navigation, empty state,
 * loading indicator, and error messaging.
 * Built with native DOM + React (zero external dependencies).
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id: externalId,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to filter…',
  emptyText = 'No results found',
  disabled = false,
  error,
  isLoading = false,
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
  const filtered = filterSelectOptions(options, query);

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

  // Focus filter input on open
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setActiveIdx(-1);
    }
  }, [open]);

  const toggleOpen = () => {
    if (disabled || isLoading) return;
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
    if (disabled || isLoading) return;

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      setQuery('');
      return;
    }

    if (e.key === 'ArrowDown') {
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setActiveIdx(i => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter' && activeIdx >= 0 && filtered[activeIdx]) {
      select(filtered[activeIdx]!);
      e.preventDefault();
    }
  };

  const triggerCls = cn(
    'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs md:text-sm rounded-xl border transition-shadow',
    'bg-white dark:bg-slate-800 text-left',
    disabled || isLoading
      ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700'
      : error
      ? 'cursor-pointer border-rose-400 dark:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500'
      : 'cursor-pointer border-slate-200 dark:border-slate-700 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500',
    className
  );

  const displayDesc = selected?.description || selected?.sublabel;

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={onKeyDown}>
      {/* Combobox Trigger */}
      <div
        id={externalId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        tabIndex={disabled || isLoading ? -1 : 0}
        className={triggerCls}
        onClick={toggleOpen}
      >
        <span className={cn('flex-1 truncate', !selected && 'text-slate-400 dark:text-slate-500')}>
          {isLoading ? (
            <span className="flex items-center gap-1.5 text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading…
            </span>
          ) : selected ? (
            <span className="flex items-baseline gap-1.5 truncate">
              <span className="font-medium text-slate-900 dark:text-slate-100">{selected.label}</span>
              {displayDesc && (
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  ({displayDesc})
                </span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {selected && !disabled && !isLoading && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear selection"
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          ) : (
            <ChevronDown
              className={cn(
                'w-4 h-4 text-slate-400 transition-transform duration-150',
                open && 'rotate-180'
              )}
            />
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-[11px] text-rose-500 dark:text-rose-400">{error}</p>
      )}

      {/* Dropdown Listbox */}
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Options"
          className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl shadow-slate-900/10 overflow-hidden"
        >
          {/* Search filter input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setActiveIdx(-1);
              }}
              placeholder={searchPlaceholder}
              className="flex-1 text-xs md:text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
              aria-autocomplete="list"
              aria-controls={listboxId}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1 divide-y divide-slate-100/60 dark:divide-slate-700/30">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500 text-center">
                {emptyText}
              </li>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isFocused = idx === activeIdx;
                const desc = opt.description || opt.sublabel;

                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => select(opt)}
                    className={cn(
                      'flex flex-col px-3 py-2 cursor-pointer text-xs md:text-sm transition-colors',
                      isFocused
                        ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                        : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50',
                      isSelected && 'font-semibold bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Selected
                        </span>
                      )}
                    </div>
                    {desc && (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {desc}
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
