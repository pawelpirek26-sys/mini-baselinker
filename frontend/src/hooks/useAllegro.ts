import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export interface AllegroStatus {
  connected: boolean;
  env: 'sandbox' | 'production';
  expiresAt?: string;
  user?: { login: string; id: string };
}

export interface AllegroCategory {
  id: string;
  name: string;
  parent?: { id: string };
  leaf: boolean;
}

export interface AllegroParameter {
  id: string;
  name: string;
  type: string;
  required: boolean;
  restrictions?: { multipleChoices?: boolean };
  dictionary?: Array<{ id: string; value: string }>;
  unit?: string;
}

// ── Status połączenia ────────────────────────
export const useAllegroStatus = () =>
  useQuery<AllegroStatus>({
    queryKey: ['allegro-status'],
    queryFn: () => api.get('/allegro/status').then((r) => r.data),
    staleTime: 30_000,
    retry: false,
  });

// ── Start OAuth ──────────────────────────────
export const useAllegroConnect = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.get<{ url: string }>('/allegro/oauth/start');
      return data.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: () => toast.error('Błąd uruchomienia OAuth Allegro'),
  });
};

// ── Rozłącz ──────────────────────────────────
export const useAllegroDisconnect = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/allegro/disconnect'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allegro-status'] });
      toast.success('Rozłączono z Allegro');
    },
  });
};

// ── Kategorie ────────────────────────────────
export const useAllegroCategories = (parentId?: string) =>
  useQuery<AllegroCategory[]>({
    queryKey: ['allegro-categories', parentId],
    queryFn: () =>
      api.get('/allegro/categories', { params: parentId ? { parentId } : {} })
        .then((r) => r.data),
    enabled: true,
    staleTime: 5 * 60_000,
  });

export const useAllegroParameters = (categoryId?: string) =>
  useQuery<AllegroParameter[]>({
    queryKey: ['allegro-parameters', categoryId],
    queryFn: () =>
      api.get(`/allegro/categories/${categoryId}/parameters`).then((r) => r.data),
    enabled: !!categoryId,
    staleTime: 5 * 60_000,
  });

// ── Shipping rates ────────────────────────────
export const useAllegroShippingRates = () =>
  useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['allegro-shipping-rates'],
    queryFn: () => api.get('/allegro/shipping-rates').then((r) => r.data),
    staleTime: 5 * 60_000,
  });

// ── Publikowanie ─────────────────────────────
export const usePublishListing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) =>
      api.post(`/listings/${listingId}/publish`).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['parts'] });
      if (data.status === 'ok') {
        toast.success('Wystawiono pomyślnie!');
      } else {
        toast.error(`Błąd: ${data.error}`);
      }
    },
    onError: () => toast.error('Błąd wystawiania'),
  });
};

export const usePublishPart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partId: string) =>
      api.post(`/allegro/publish-part/${partId}`).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      qc.invalidateQueries({ queryKey: ['listings'] });
      if (data.status === 'ok') {
        toast.success('Wystawiono na Allegro!');
      } else {
        toast.error(`Błąd Allegro: ${data.error}`);
      }
    },
    onError: () => toast.error('Błąd wystawiania na Allegro'),
  });
};

export const usePublishAll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params?: { portal?: string; partId?: string }) =>
      api.post('/listings/publish-all', params ?? {}).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['parts'] });
      const ok   = data.results?.filter((r: { status: string }) => r.status === 'ok').length ?? 0;
      const fail = data.results?.filter((r: { status: string }) => r.status === 'error').length ?? 0;
      toast.success(`Wystawiono: ${ok} ✓${fail ? `  Błędów: ${fail}` : ''}`);
    },
  });
};
