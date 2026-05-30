import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface SyncLog {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'ERROR';
  source: string;
  triggeredBy: 'MANUAL' | 'SCHEDULED';
  totalFetched: number;
  created: number;
  updated: number;
  deactivated: number;
  errors: number;
  errorDetails: string | null;
}

interface LogsResponse {
  items: SyncLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function useSyncStatus() {
  return useQuery<SyncLog | null>({
    queryKey: ['sync', 'status'],
    queryFn: () => api.get('/sync/status').then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.status === 'RUNNING' ? 3000 : false),
  });
}

export function useSyncLogs(page = 1) {
  return useQuery<LogsResponse>({
    queryKey: ['sync', 'logs', page],
    queryFn: () => api.get('/sync/logs', { params: { page, limit: 20 } }).then((r) => r.data),
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation<SyncLog>({
    mutationFn: () => api.post('/sync/run').then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync'] });
      qc.invalidateQueries({ queryKey: ['parts'] });
    },
  });
}
