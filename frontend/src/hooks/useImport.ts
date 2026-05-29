import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export interface ImportPreviewResult {
  headers:       string[];
  columnMap:     Record<string, string>;
  valid:         number;
  invalid:       number;
  total:         number;
  previewValid:  Array<{ row: number; data: Record<string, unknown> }>;
  previewInvalid: Array<{ row: number; raw: Record<string, string>; errors: Array<{ field: string; message: string }> }>;
  truncated:     boolean;
  totalInFile:   number;
}

export interface ImportExecuteResult {
  created:  number;
  updated:  number;
  skipped:  number;
  invalid:  number;
  errors:   Array<{ row: number; error: string }>;
  total:    number;
  dryRun?:  boolean;
  wouldCreate?: number;
}

export interface ImportOptions {
  skipInvalid:    boolean;
  updateExisting: boolean;
  dryRun:         boolean;
}

// ── Podgląd pliku (bez zapisu) ────────────────
export const useImportPreview = () =>
  useMutation({
    mutationFn: async (file: File): Promise<ImportPreviewResult> => {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<ImportPreviewResult>('/import/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Błąd parsowania pliku';
      toast.error(msg);
    },
  });

// ── Wykonaj import ────────────────────────────
export const useImportExecute = () =>
  useMutation({
    mutationFn: async ({
      file,
      options,
    }: {
      file:    File;
      options: ImportOptions;
    }): Promise<ImportExecuteResult> => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('skipInvalid',    String(options.skipInvalid));
      fd.append('updateExisting', String(options.updateExisting));
      fd.append('dryRun',         String(options.dryRun));
      const { data } = await api.post<ImportExecuteResult>('/import/execute', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.dryRun) {
        toast.success(`Dry run: zaimportowałoby ${data.wouldCreate} części`);
      } else {
        toast.success(`Zaimportowano: ${data.created} nowych, ${data.updated} zaktualizowanych`);
      }
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Błąd importu';
      toast.error(msg);
    },
  });

// ── Pobierz szablon CSV ───────────────────────
export const useDownloadTemplate = () =>
  useMutation({
    mutationFn: async () => {
      const resp = await api.get('/import/template/csv', { responseType: 'blob' });
      const url  = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: 'text/csv' }));
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'mini_baselinker_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success('Szablon CSV pobrany'),
  });
