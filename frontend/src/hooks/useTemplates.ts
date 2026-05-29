import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Template, Portal } from '../types';
import toast from 'react-hot-toast';

export const useTemplates = (portal?: Portal) =>
  useQuery<Template[]>({
    queryKey: ['templates', portal],
    queryFn: () => api.get('/templates', { params: portal ? { portal } : {} }).then((r) => r.data),
  });

export const useTemplate = (id: string) =>
  useQuery<Template>({
    queryKey: ['template', id],
    queryFn: () => api.get(`/templates/${id}`).then((r) => r.data),
    enabled: !!id,
  });

export const useCreateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Template>) => api.post('/templates', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Szablon utworzony');
    },
    onError: () => toast.error('Błąd tworzenia szablonu'),
  });
};

export const useUpdateTemplate = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Template>) => api.patch(`/templates/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      qc.invalidateQueries({ queryKey: ['template', id] });
      toast.success('Szablon zaktualizowany');
    },
    onError: () => toast.error('Błąd aktualizacji'),
  });
};

export const useDeleteTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Szablon usunięty');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Błąd usuwania';
      toast.error(msg);
    },
  });
};
