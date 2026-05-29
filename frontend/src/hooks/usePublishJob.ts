/**
 * usePublishJob
 * -------------
 * Hook zarządzający job-em publikowania na wszystkie portale.
 *
 * Przepływ:
 *  1. startJob(partId, portals) → POST /api/publish/start → jobId
 *  2. Otwiera EventSource na /api/publish/stream/:jobId
 *  3. Każdy SSE event aktualizuje stan (portal pending → done/error)
 *  4. Po job_done zamyka EventSource
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export type Portal = 'ALLEGRO' | 'OTOMOTO' | 'AUTOLINE';

export type PortalStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'done'
  | 'error'
  | 'skipped';

export interface PortalState {
  portal:      Portal;
  status:      PortalStatus;
  externalId?: string;
  externalUrl?: string;
  error?:      string;
  listingId?:  string;
}

export interface JobState {
  jobId?:     string;
  status:     'idle' | 'running' | 'done' | 'error';
  portals:    PortalState[];
  progress:   { done: number; total: number };
  startedAt?: Date;
  doneAt?:    Date;
}

const INITIAL_STATE: JobState = {
  status:   'idle',
  portals:  [],
  progress: { done: 0, total: 0 },
};

export interface PublishPortalStatus {
  connected: boolean;
  stats:     Record<string, number>;
}

export interface GlobalPublishStatus {
  portals: Record<Portal, PublishPortalStatus>;
  partsInStock: number;
  sseConnections: number;
}

export function usePublishJob() {
  const [state, setState] = useState<JobState>(INITIAL_STATE);
  const esRef  = useRef<EventSource | null>(null);

  // Cleanup EventSource
  const closeStream = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  useEffect(() => () => closeStream(), [closeStream]);

  /** Otwórz SSE stream dla danego jobId */
  const openStream = useCallback((jobId: string, totalPortals: number) => {
    closeStream();

    // EventSource nie obsługuje nagłówków — jobId jako token wystarczy
    const es = new EventSource(`/api/publish/stream/${jobId}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent) => {
      const event = JSON.parse(e.data as string) as {
        type: string;
        portal?: Portal;
        listingId?: string;
        externalId?: string;
        externalUrl?: string;
        error?: string;
        progress?: { done: number; total: number };
      };

      if (event.type === 'ping') return;

      setState((prev) => {
        const next = { ...prev };

        if (event.progress) {
          next.progress = event.progress;
        }

        switch (event.type) {
          case 'job_started':
            next.status   = 'running';
            next.startedAt = new Date();
            break;

          case 'portal_pending':
            if (event.portal) {
              next.portals = upsertPortal(next.portals, event.portal, { status: 'pending' });
            }
            break;

          case 'portal_started':
            if (event.portal) {
              next.portals = upsertPortal(next.portals, event.portal, {
                status:    'running',
                listingId: event.listingId,
              });
            }
            break;

          case 'portal_done':
            if (event.portal) {
              next.portals = upsertPortal(next.portals, event.portal, {
                status:      'done',
                externalId:  event.externalId,
                externalUrl: event.externalUrl,
              });
            }
            break;

          case 'portal_error':
            if (event.portal) {
              next.portals = upsertPortal(next.portals, event.portal, {
                status: event.error?.includes('szablon') ? 'skipped' : 'error',
                error:  event.error,
              });
            }
            break;

          case 'job_done':
            next.status = 'done';
            next.doneAt = new Date();
            next.progress = event.progress ?? { done: totalPortals, total: totalPortals };
            closeStream();
            break;
        }

        return next;
      });
    };

    es.onerror = () => {
      setState((prev) => ({ ...prev, status: 'error' }));
      closeStream();
      toast.error('Utracono połączenie SSE — sprawdź status jobów');
    };
  }, [closeStream]);

  /** Start job publikowania */
  const startJob = useCallback(async (
    partId:  string,
    portals: Portal[],
    templateIds?: Partial<Record<Portal, string>>,
  ) => {
    setState({
      status:   'running',
      jobId:    undefined,
      portals:  portals.map((p) => ({ portal: p, status: 'pending' })),
      progress: { done: 0, total: portals.length },
      startedAt: new Date(),
    });

    try {
      const { data } = await api.post<{ jobId: string }>('/publish/start', {
        partId, portals, templateIds,
      });

      setState((prev) => ({ ...prev, jobId: data.jobId }));
      openStream(data.jobId, portals.length);

      return data.jobId;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Błąd uruchamiania publikowania';
      setState((prev) => ({ ...prev, status: 'error' }));
      toast.error(msg);
      return null;
    }
  }, [openStream]);

  /** Reset do stanu idle */
  const reset = useCallback(() => {
    closeStream();
    setState(INITIAL_STATE);
  }, [closeStream]);

  return { state, startJob, reset };
}

// ── Util ───────────────────────────────────────
function upsertPortal(
  portals: PortalState[],
  portal:  Portal,
  update:  Partial<PortalState>,
): PortalState[] {
  const existing = portals.find((p) => p.portal === portal);
  if (existing) {
    return portals.map((p) => p.portal === portal ? { ...p, ...update } : p);
  }
  return [...portals, { portal, status: 'idle', ...update }];
}

// ── Global publish status hook ─────────────────
import { useQuery } from '@tanstack/react-query';

export const usePublishStatus = () =>
  useQuery<GlobalPublishStatus>({
    queryKey: ['publish-status'],
    queryFn:  () => api.get('/publish/status').then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

export const usePublishHistory = (partId?: string) =>
  useQuery({
    queryKey: ['publish-history', partId],
    queryFn:  () => api.get(`/publish/history/${partId}`).then((r) => r.data),
    enabled:  !!partId,
    staleTime: 10_000,
  });
