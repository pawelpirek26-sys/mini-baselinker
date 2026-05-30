import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSyncStatus, useSyncLogs, useTriggerSync, SyncLog } from '../hooks/useSync';

export default function SyncPage() {
  const [page, setPage] = useState(1);
  const { data: status, isLoading: statusLoading } = useSyncStatus();
  const { data: logs } = useSyncLogs(page);
  const trigger = useTriggerSync();

  async function handleSync() {
    try {
      await trigger.mutateAsync();
      toast.success('Synchronizacja zakończona');
    } catch {
      toast.error('Błąd synchronizacji');
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Synchronizacja magazynu</h1>
          <p className="text-sm text-slate-400 mt-0.5">Źródło: truckparts.vercel.app (Supabase)</p>
        </div>
        <button
          onClick={handleSync}
          disabled={trigger.isPending || status?.status === 'RUNNING'}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-white text-sm font-medium rounded-lg transition-colors"
        >
          {trigger.isPending || status?.status === 'RUNNING' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Synchronizuj teraz
        </button>
      </div>

      {/* Status ostatniej synchronizacji */}
      {!statusLoading && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-3 uppercase tracking-wider">
            Ostatnia synchronizacja
          </div>
          {status ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={status.status} />
                <span className="text-sm text-slate-400">
                  {new Date(status.createdAt).toLocaleString('pl-PL')}
                  {status.finishedAt && (
                    <span className="ml-2 text-slate-600">
                      · {duration(status.createdAt, status.finishedAt)}
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-600 ml-auto">
                  {status.triggeredBy === 'MANUAL' ? 'ręczna' : 'automatyczna'}
                </span>
              </div>
              {status.status !== 'RUNNING' && (
                <div className="grid grid-cols-4 gap-3">
                  <Stat label="Pobrano" value={status.totalFetched} />
                  <Stat label="Nowe" value={status.created} color="text-green-400" />
                  <Stat label="Zaktualizowane" value={status.updated} color="text-blue-400" />
                  <Stat label="Dezaktywowane" value={status.deactivated} color="text-amber-400" />
                </div>
              )}
              {status.errors > 0 && (
                <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                  {status.errors} błędów podczas synchronizacji
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Brak historii synchronizacji</p>
          )}
        </div>
      )}

      {/* Historia */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-medium text-slate-300">Historia synchronizacji</h2>
        </div>
        {logs?.items.length === 0 && (
          <p className="text-sm text-slate-500 p-4">Brak wpisów</p>
        )}
        <div className="divide-y divide-slate-800">
          {logs?.items.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </div>
        {logs && logs.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs text-slate-400 hover:text-white disabled:opacity-30"
            >
              ← Poprzednia
            </button>
            <span className="text-xs text-slate-500">
              {page} / {logs.pagination.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(logs.pagination.totalPages, p + 1))}
              disabled={page === logs.pagination.totalPages}
              className="text-xs text-slate-400 hover:text-white disabled:opacity-30"
            >
              Następna →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LogRow({ log }: { log: SyncLog }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 text-sm">
      <StatusBadge status={log.status} compact />
      <span className="text-slate-400 w-36 shrink-0 text-xs">
        {new Date(log.createdAt).toLocaleString('pl-PL')}
      </span>
      <span className="text-slate-500 text-xs">
        {log.triggeredBy === 'MANUAL' ? 'ręczna' : 'auto'}
      </span>
      {log.status !== 'RUNNING' && (
        <div className="flex gap-4 ml-auto text-xs text-slate-500">
          <span className="text-green-500">+{log.created}</span>
          <span className="text-blue-400">~{log.updated}</span>
          <span className="text-amber-400">−{log.deactivated}</span>
          {log.errors > 0 && <span className="text-red-400">!{log.errors}</span>}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, compact }: { status: SyncLog['status']; compact?: boolean }) {
  const cfg = {
    RUNNING:  { icon: Loader2,       cls: 'text-blue-400',  label: 'W toku',  spin: true  },
    SUCCESS:  { icon: CheckCircle2,  cls: 'text-green-400', label: 'OK',      spin: false },
    PARTIAL:  { icon: AlertCircle,   cls: 'text-amber-400', label: 'Częściowy', spin: false },
    ERROR:    { icon: XCircle,       cls: 'text-red-400',   label: 'Błąd',    spin: false },
  }[status];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-1.5 ${cfg.cls}`}>
      <Icon size={compact ? 13 : 15} className={cfg.spin ? 'animate-spin' : ''} />
      {!compact && <span className="text-sm font-medium">{cfg.label}</span>}
    </div>
  );
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-slate-800/50 rounded-lg px-3 py-2">
      <div className={`text-lg font-semibold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function duration(from: string, to: string): string {
  const s = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
