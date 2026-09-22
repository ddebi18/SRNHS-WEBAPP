import React, { useEffect, useState } from 'react';
import { SmsNotification } from '@/types/domain.types';
import { mockNotificationAdapter } from '../services/MockNotificationAdapter';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DataTable, Column } from '@/components/ui/DataTable';
import { SmsBadge } from '@/components/ui/StatusBadge';
import { Phone, RefreshCw } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';

export const SmsAuditLog: React.FC = () => {
  const { isAdmin } = useRole();
  const [logs, setLogs] = useState<SmsNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>('all');

  const fetchLogs = async () => {
    setIsLoading(true);
    const localLogs = await mockNotificationAdapter.getSmsLogs();

    if (!supabase || !isSupabaseConfigured) {
      setLogs(localLogs);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('sms_notifications')
        .select(`
          id, student_id, guardian_phone, message, event_type, status, sent_at,
          students ( first_name, last_name )
        `)
        .order('sent_at', { ascending: false })
        .limit(100);

      if (error) {
        console.warn('[SmsAuditLog] Supabase fetch note:', error.message);
        setLogs(localLogs);
        setIsLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const cloudLogs: SmsNotification[] = data.map((row: any) => ({
          id: row.id,
          student_id: row.student_id,
          student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : 'Student',
          guardian_phone: row.guardian_phone,
          message: row.message,
          event_type: row.event_type,
          status: row.status,
          sent_at: row.sent_at,
        }));

        // Merge cloud and local logs, deduplicated by id
        const map = new Map<string, SmsNotification>();
        localLogs.forEach(l => map.set(l.id, l));
        cloudLogs.forEach(l => map.set(l.id, l));

        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
        );
        setLogs(merged);
      } else {
        setLogs(localLogs);
      }
    } catch (err) {
      console.warn('[SmsAuditLog] Network error:', err);
      setLogs(localLogs);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // 1. Subscribe to local mock dispatches
    const unsubLocal = mockNotificationAdapter.subscribeToSms(newSms => {
      setLogs(prev => [newSms, ...prev.filter(l => l.id !== newSms.id)]);
    });

    // 2. Subscribe to Supabase Realtime inserts
    let channel: any = null;
    if (supabase && isSupabaseConfigured) {
      channel = supabase
        .channel('sms_audit_realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sms_notifications' },
          _payload => {
            fetchLogs();
          }
        )
        .subscribe();
    }

    return () => {
      unsubLocal();
      if (supabase && channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, []);

  if (!isAdmin) {
    return <ForbiddenState message="School-wide Parent SMS notification dispatch logs are restricted to School Administrators." />;
  }

  const filteredLogs = eventFilter === 'all'
    ? logs
    : logs.filter(l => l.event_type === eventFilter);

  const columns: Column<SmsNotification>[] = [
    {
      header: 'Student Name',
      accessorKey: 'student_name',
      cell: log => <span className="font-bold text-slate-900 dark:text-slate-100">{log.student_name}</span>,
    },
    {
      header: 'Guardian Contact',
      cell: log => (
        <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-300">
          <Phone className="w-3.5 h-3.5 text-brand-500" />
          <span>{log.guardian_phone}</span>
        </div>
      ),
    },
    {
      header: 'Trigger Event',
      cell: log => {
        const type = log.event_type || '';
        const color =
          type.includes('entry') ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' :
          type.includes('exit') ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300' :
          type.includes('absence') ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300' :
          'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300';
        return (
          <span className={`capitalize px-2.5 py-0.5 rounded-full font-semibold text-xs border border-transparent ${color}`}>
            {log.event_type.replace('_', ' ')}
          </span>
        );
      },
    },
    {
      header: 'SMS Dispatch Content',
      cell: log => (
        <div className="max-w-md bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-[11px] text-slate-700 dark:text-slate-300">
          {log.message}
        </div>
      ),
    },
    {
      header: 'Delivery Status',
      cell: log => <SmsBadge status={log.status} />,
    },
    {
      header: 'Timestamp',
      cell: log => (
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
          {new Date(log.sent_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
              Parent SMS Notification Audit Log
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50 text-[11px] font-black">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Gateway Dispatch
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Real-time audit trail of automated SMS notifications dispatched to student guardians upon gate entry/exit, absence, or tardiness.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={eventFilter}
            onChange={e => setEventFilter(e.target.value)}
            className="px-3 py-2 text-xs font-bold rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none shadow-card-sm"
          >
            <option value="all">All Event Triggers</option>
            <option value="gate_entry">Gate Entry (Time-In)</option>
            <option value="gate_exit">Gate Exit (Time-Out)</option>
            <option value="unexcused_absence">Unexcused Absence</option>
            <option value="tardiness">Tardiness</option>
          </select>

          <button
            onClick={fetchLogs}
            className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-card-sm"
            title="Refresh Log"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <DataTable
        data={filteredLogs}
        columns={columns}
        keyExtractor={log => log.id}
        isLoading={isLoading}
        emptyTitle="No SMS notifications dispatched yet"
        emptyDescription="SMS notification alerts will automatically be logged here in real-time when gate scans or classroom events occur."
        searchPlaceholder="Search by student or guardian phone number..."
        searchFilter={(log, q) =>
          (log.student_name || '').toLowerCase().includes(q.toLowerCase()) ||
          log.guardian_phone.includes(q) ||
          (log.message || '').toLowerCase().includes(q.toLowerCase())
        }
      />
    </div>
  );
};
