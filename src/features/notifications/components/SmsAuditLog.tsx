import React, { useEffect, useState } from 'react';
import { SmsNotification } from '@/types/domain.types';
import { mockNotificationAdapter } from '../services/MockNotificationAdapter';
import { DataTable, Column } from '@/components/ui/DataTable';
import { SmsBadge } from '@/components/ui/StatusBadge';
import { Phone, RefreshCw } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';

export const SmsAuditLog: React.FC = () => {
  const { isAdmin } = useRole();
  const [logs, setLogs] = useState<SmsNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    const data = await mockNotificationAdapter.getSmsLogs();
    setLogs(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    const unsubscribe = mockNotificationAdapter.subscribeToSms(newSms => {
      setLogs(prev => [newSms, ...prev]);
    });
    return () => unsubscribe();
  }, []);

  if (!isAdmin) {
    return <ForbiddenState message="School-wide Parent SMS notification dispatch logs are restricted to School Administrators." />;
  }

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
      cell: log => (
        <span className="capitalize px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 font-semibold text-xs text-slate-700 dark:text-slate-300">
          {log.event_type.replace('_', ' ')}
        </span>
      ),
    },
    {
      header: 'SMS Message Dispatch Content',
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
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
            Parent SMS Notification Audit Log
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Audit trail of automated SMS notifications dispatched to student guardians upon campus entry, exit, or unexcused absence.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-card-sm self-start sm:self-auto"
          title="Refresh Log"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <DataTable
        data={logs}
        columns={columns}
        keyExtractor={log => log.id}
        isLoading={isLoading}
        emptyTitle="No SMS notifications dispatched yet"
        emptyDescription="SMS notification alerts will automatically be logged here when gate scans or unexcused absences occur."
        searchPlaceholder="Search by student or guardian phone number..."
        searchFilter={(log, q) =>
          (log.student_name || '').toLowerCase().includes(q.toLowerCase()) ||
          log.guardian_phone.includes(q)
        }
      />
    </div>
  );
};
