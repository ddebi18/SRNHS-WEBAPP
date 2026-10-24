import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { UserLog } from '@/types/domain.types';
import { fetchUserLogs, UserLogFilter } from '@/lib/auditLogger';
import { LoadingSpinner } from '@/components/ui/StateViews';
import { cn } from '@/lib/utils';

export const UserLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<UserLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const pageSize = 25;

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const calculateDateBounds = () => {
    if (dateRange === 'all') return { start_date: undefined, end_date: undefined };
    const now = new Date();
    if (dateRange === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { start_date: start, end_date: now.toISOString() };
    }
    if (dateRange === '7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      return { start_date: start, end_date: now.toISOString() };
    }
    if (dateRange === '30d') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return { start_date: start, end_date: now.toISOString() };
    }
    return { start_date: undefined, end_date: undefined };
  };

  const loadData = async () => {
    setLoading(true);
    const { start_date, end_date } = calculateDateBounds();
    const filter: UserLogFilter = {
      limit: pageSize,
      offset: page * pageSize,
      search: searchTerm.trim() || undefined,
      role: roleFilter !== 'all' ? roleFilter : undefined,
      entity_type: entityFilter !== 'all' ? entityFilter : undefined,
      start_date,
      end_date,
    };

    try {
      const res = await fetchUserLogs(filter);
      setLogs(res.data);
      setTotalCount(res.count);
    } catch (e) {
      console.warn('Failed to fetch user logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, roleFilter, entityFilter, dateRange]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    loadData();
  };

  const handleExportCsv = () => {
    if (logs.length === 0) return;

    const headers = ['Timestamp', 'Log ID', 'User ID', 'Role', 'Action', 'Entity Type', 'Entity ID', 'IP Address', 'Metadata'];
    const rows = logs.map(l => [
      new Date(l.created_at).toISOString(),
      l.id,
      l.user_id || '',
      l.role || '',
      l.action,
      l.entity_type,
      l.entity_id || '',
      l.ip_address || '',
      JSON.stringify(l.metadata || {}).replace(/"/g, '""'),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(r => r.map(f => `"${f}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `srnhs_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">User Logs &amp; Audit Trail</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              Append-Only
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Immutable, non-repudiable record of all system events, authentication, and record mutations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            className="p-2 rounded-xl bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by action, entity ID, or keyword..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={e => {
                setRoleFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
              <option value="guardian">Guardian</option>
              <option value="system">System</option>
            </select>

            {/* Entity Filter */}
            <select
              value={entityFilter}
              onChange={e => {
                setEntityFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Entities</option>
              <option value="user">User / Auth</option>
              <option value="student">Student</option>
              <option value="guardian">Guardian</option>
              <option value="grade">Grade</option>
              <option value="announcement">Announcement</option>
              <option value="violation">Violation</option>
            </select>

            {/* Date Range */}
            <select
              value={dateRange}
              onChange={e => {
                setDateRange(e.target.value as any);
                setPage(0);
              }}
              className="px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-12">
            <LoadingSpinner label="Querying audit trail..." />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-xs space-y-2">
            <Info className="w-8 h-8 mx-auto text-muted-foreground/60" />
            <p className="font-semibold text-foreground">No audit entries found</p>
            <p>Try adjusting your search query or broadening the date range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Actor / Role</th>
                  <th className="p-3.5">Action</th>
                  <th className="p-3.5">Entity</th>
                  <th className="p-3.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {logs.map(log => {
                  const isExpanded = expandedLogId === log.id;
                  const hasMeta = log.metadata && Object.keys(log.metadata).length > 0;

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-muted/40 transition-colors">
                        <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                                log.role === 'admin' && 'bg-amber-500/10 text-amber-500 border border-amber-500/30',
                                log.role === 'teacher' && 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30',
                                log.role === 'guardian' && 'bg-teal-500/10 text-teal-500 border border-teal-500/30',
                                (!log.role || log.role === 'system') && 'bg-muted text-muted-foreground border border-border'
                              )}
                            >
                              {log.role || 'system'}
                            </span>
                            {log.user_id && (
                              <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={log.user_id}>
                                {log.user_id.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className="font-mono font-bold text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border">
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="text-foreground font-medium">{log.entity_type}</div>
                          {log.entity_id && (
                            <span className="font-mono text-[10px] text-muted-foreground truncate block max-w-[140px]" title={log.entity_id}>
                              ID: {log.entity_id.slice(0, 10)}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {hasMeta ? (
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-primary hover:underline text-[11px] font-semibold cursor-pointer"
                            >
                              {isExpanded ? 'Hide info' : 'View payload'}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && hasMeta && (
                        <tr className="bg-muted/20">
                          <td colSpan={5} className="p-4 border-t border-border/40">
                            <div className="p-3 rounded-xl bg-background border border-border text-[11px] font-mono overflow-x-auto text-foreground">
                              <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {logs.length} of {totalCount} records
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-foreground">
              Page {page + 1} of {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page + 1 >= totalPages || loading}
              className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
