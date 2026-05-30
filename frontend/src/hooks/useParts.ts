import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Part, PartStats, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

interface PartsFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  condition?: string;
  isActive?: 'true' | 'false';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export const useParts = (filters: PartsFilters = {}) =>
  useQuery<PaginatedResponse<Part>>({
    queryKey: ['parts', filters],
    queryFn: () => api.get('/parts', { params: filters }).then((r) => r.data),
  });

export const usePartStats = () =>
  useQuery<PartStats>({
    queryKey: ['parts', 'stats'],
    queryFn: () => api.get('/parts/stats').then((r) => r.data),
    staleTime: 60_000,
  });

export const usePart = (id: string) =>
  useQuery<Part>({
    queryKey: ['part', id],
    queryFn: () => api.get(`/parts/${id}`).then((r) => r.data),
    enabled: !!id,
  });

export const useCreatePart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Part>) => api.post('/parts', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Część dodana');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Błąd zapisu';
      toast.error(msg);
    },
  });
};

export const useUpdatePart = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Part>) => api.patch(`/parts/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      qc.invalidateQueries({ queryKey: ['part', id] });
      toast.success('Część zaktualizowana');
    },
    onError: () => toast.error('Błąd aktualizacji'),
  });
};

export const useDeletePart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/parts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Część usunięta');
    },
    onError: () => toast.error('Błąd usuwania'),
  });
};

export const useBulkParts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'activate' | 'deactivate' | 'delete' }) =>
      api.patch('/parts/bulk', { ids, action }).then((r) => r.data),
    onSuccess: (_data, { action }) => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      const msg = action === 'delete' ? 'Usunięto' : action === 'activate' ? 'Aktywowano' : 'Dezaktywowano';
      toast.success(msg);
    },
    onError: () => toast.error('Błąd operacji'),
  });
};
