import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  searchPlaceholder?: string;
  searchFilter?: (item: T, query: string) => boolean;
  pageSize?: number;
}

function LoadingRow() {
  return (
    <tr>
      <td colSpan={99} className="px-6 py-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-700 border-t-slate-800 dark:border-t-slate-200 rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Fetching records…</span>
        </div>
      </td>
    </tr>
  );
}

function EmptyRow({ title, description }: { title: string; description: string }) {
  return (
    <tr>
      <td colSpan={99} className="px-6 py-12 text-center">
        <div className="text-3xl mb-3">📋</div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">{title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">{description}</div>
      </td>
    </tr>
  );
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no records matching your query.',
  searchPlaceholder = 'Search records…',
  searchFilter,
  pageSize = 10,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = searchFilter && query.trim()
    ? data.filter(i => searchFilter(i, query.trim()))
    : data;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-4">
      {/* Search */}
      {searchFilter && (
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            placeholder={searchPlaceholder}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl font-medium
              bg-white/80 dark:bg-slate-900/80
              border border-slate-200/60 dark:border-slate-800
              text-slate-900 dark:text-slate-100
              placeholder:text-slate-400 dark:placeholder:text-slate-500
              focus:outline-none focus:ring-2 focus:ring-brand-500/50 dark:focus:ring-brand-400/50 focus:border-brand-500 dark:focus:border-brand-400
              shadow-card-sm transition-colors"
          />
        </div>
      )}

      {/* Table Card Container */}
      <div className="bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm overflow-hidden transition-all">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[600px] sm:min-w-[640px]">
            <thead className="bg-slate-50 dark:bg-slate-800/80">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-5 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300',
                      col.className
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
              {isLoading ? (
                <LoadingRow />
              ) : slice.length === 0 ? (
                <EmptyRow title={emptyTitle} description={emptyDescription} />
              ) : (
                <AnimatePresence initial={false}>
                  {slice.map((row, ri) => (
                    <motion.tr
                      key={keyExtractor(row)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: ri * 0.02 }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {columns.map((col, ci) => (
                        <td
                          key={ci}
                          className={cn(
                            'px-5 py-4 text-sm text-slate-800 dark:text-slate-200 align-middle',
                            col.className
                          )}
                        >
                          {col.cell
                            ? col.cell(row)
                            : col.accessorKey
                            ? String(row[col.accessorKey] ?? '')
                            : null}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filtered.length > pageSize && (
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
            <span>
              Showing <strong className="text-slate-900 dark:text-slate-100 font-bold">{(safePage - 1) * pageSize + 1}</strong>–
              <strong className="text-slate-900 dark:text-slate-100 font-bold">{Math.min(safePage * pageSize, filtered.length)}</strong>{' '}
              of <strong className="text-slate-900 dark:text-slate-100 font-bold">{filtered.length}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold text-slate-900 dark:text-slate-100">{safePage} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
