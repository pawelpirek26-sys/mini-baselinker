import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export interface OtomotoStatus {
  connected:    boolean;
  advertiserId?: string;
  advertiser?: {
    id:     string;
    email:  string;
    status: string;
    phones: string[];
  };
}

export interface OtomotoAd {
  id:         string;
  url:        string;
  status:     string;
  created_at: string;
  valid_to?:  string;
  title:      string;
  price:      { value: string; currency: string };
}

// ── Status połączenia ────────────────────────
export const useOtomotoStatus = () =>
  useQuery<OtomotoStatus>({
    queryKey: ['otomoto-status'],
    queryFn:  () => api.get('/otomoto/status').then((r) => r.data),
    staleTime: 30_000,
    retry: false,
  });

// ── Zapisz konfigurację ──────────────────────
export const useOtomotoConfigure = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientId: string; clientSecret: string; advertiserId: string }) =>
      api.post('/otomoto/configure', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['otomoto-status'] });
      toast.success('Konfiguracja Otomoto zapisana');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Błąd zapisu konfiguracji';
      toast.error(msg);
    },
  });
};

// ── Rozłącz ──────────────────────────────────
export const useOtomotoDisconnect = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/otomoto/disconnect'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['otomoto-status'] });
      toast.success('Rozłączono z Otomoto');
    },
  });
};

// ── Ogłoszenia ────────────────────────────────
export const useOtomotoAds = (params?: { page?: number; status?: string }) =>
  useQuery<{ data: OtomotoAd[]; total: number }>({
    queryKey: ['otomoto-ads', params],
    queryFn:  () => api.get('/otomoto/ads', { params }).then((r) => r.data),
    staleTime: 60_000,
    enabled: false, // wywołuj ręcznie
  });

// ── Lokalne kategorie (bez API call) ─────────
export const useOtomotoLocalCategories = () =>
  useQuery<Array<{ partCategory: string; id: string; name: string }>>({
    queryKey: ['otomoto-categories-local'],
    queryFn:  () => api.get('/otomoto/categories/local').then((r) => r.data),
    staleTime: Infinity,
  });

// ── Publikowanie ─────────────────────────────
export const usePublishToOtomoto = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partId: string) =>
      api.post(`/otomoto/publish-part/${partId}`).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      qc.invalidateQueries({ queryKey: ['listings'] });
      if (data.status === 'ok') {
        toast.success('Wystawiono na Otomoto!');
      } else {
        toast.error(`Błąd Otomoto: ${data.error}`);
      }
    },
    onError: () => toast.error('Błąd wystawiania na Otomoto'),
  });
};

export const useEndOtomotoAd = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adId: string) => api.delete(`/otomoto/ads/${adId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['otomoto-ads'] });
      toast.success('Ogłoszenie zakończone');
    },
  });
};
