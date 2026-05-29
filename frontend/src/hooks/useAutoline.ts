import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export interface AutolineStats {
  total:        number;
  active:       number;
  error:        number;
  partsInStock: number;
}

export interface AutolinePreviewRow {
  article_name: string;
  price:        string;
  currency:     string;
  quantity:     string;
  country:      string;
  oem_number?:  string;
  make?:        string;
  model?:       string;
  part_type?:   string;
  condition?:   string;
  [key: string]: string | undefined;
}

// ── Statystyki ────────────────────────────────
export const useAutolineStats = () =>
  useQuery<AutolineStats>({
    queryKey: ['autoline-stats'],
    queryFn:  () => api.get('/autoline/stats').then((r) => r.data),
    staleTime: 30_000,
  });

// ── Podgląd eksportu ──────────────────────────
export const useAutolinePreview = (params?: { templateId?: string; partIds?: string[] }) =>
  useQuery<{ rows: AutolinePreviewRow[]; total: number; templateName: string }>({
    queryKey: ['autoline-preview', params],
    queryFn:  () => api.post('/autoline/preview', params ?? {}).then((r) => r.data),
    enabled:  false, // wywołuj ręcznie przez refetch()
  });

// ── Eksport CSV ───────────────────────────────
export const useExportCsv = () =>
  useMutation({
    mutationFn: async (params?: { templateId?: string; partIds?: string[] }) => {
      const resp = await api.post('/autoline/export/csv', params ?? {}, {
        responseType: 'blob',
      });
      // Pobierz plik
      const url  = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `autoline_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success('Plik CSV pobrany'),
    onError:   () => toast.error('Błąd generowania CSV'),
  });

// ── Eksport XML ───────────────────────────────
export const useExportXml = () =>
  useMutation({
    mutationFn: async (params?: { templateId?: string; partIds?: string[]; feedTitle?: string }) => {
      const resp = await api.post('/autoline/export/xml', params ?? {}, {
        responseType: 'blob',
      });
      const url  = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: 'application/xml' }));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `autoline_${new Date().toISOString().slice(0, 10)}.xml`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success('Plik XML pobrany'),
    onError:   () => toast.error('Błąd generowania XML'),
  });

// ── Oznacz jako wyeksportowane ────────────────
export const useMarkExported = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { partIds: string[]; templateId?: string }) =>
      api.post('/autoline/mark-exported', params).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['autoline-stats'] });
      qc.invalidateQueries({ queryKey: ['parts'] });
      toast.success(`Oznaczono: ${data.ok} części`);
    },
    onError: () => toast.error('Błąd oznaczania'),
  });
};
