/**
 * SSE Broker (Server-Sent Events)
 * --------------------------------
 * Lekki pub/sub do wysyłania progress-eventów publikowania w czasie rzeczywistym.
 * Każdy klient (przeglądarka) subskrybuje swój kanał (sessionId lub jobId).
 *
 * Dlaczego SSE a nie WebSocket?
 *  - SSE to zwykły HTTP – działa przez wszystkie proxy i reverse proxy
 *  - Jednokerunkowość (server→client) wystarczy do progress reportingu
 *  - Zero dodatkowych zależności (natywne w Node.js + browser)
 */

import { Response } from 'express';

// ── Typy eventów ──────────────────────────────

export type PublishEventType =
  | 'job_started'      // Rozpoczęto job (lista portali, count)
  | 'portal_pending'   // Portal zakolejkowany
  | 'portal_started'   // Rozpoczęto wystawianie na portal
  | 'portal_done'      // Portal zakończony sukcesem
  | 'portal_error'     // Portal zakończony błędem
  | 'job_done'         // Cały job zakończony
  | 'ping';            // Keep-alive

export interface PublishEvent {
  type:        PublishEventType;
  jobId:       string;
  portal?:     string;
  listingId?:  string;
  externalId?: string;
  externalUrl?: string;
  error?:      string;
  progress?:   { done: number; total: number };
  timestamp:   string;
}

// ── Broker ────────────────────────────────────

class SseBroker {
  // jobId → lista klientów (można otworzyć w kilku zakładkach)
  private clients = new Map<string, Set<Response>>();

  /** Zarejestruj klienta SSE */
  subscribe(jobId: string, res: Response): () => void {
    if (!this.clients.has(jobId)) this.clients.set(jobId, new Set());
    this.clients.get(jobId)!.add(res);

    // Nagłówki SSE
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx: wyłącz buforowanie
    res.flushHeaders();

    // Keep-alive ping co 25s (Cloudflare timeout = 100s)
    const ping = setInterval(() => this.send(jobId, { type: 'ping', jobId, timestamp: new Date().toISOString() }), 25_000);

    // Cleanup przy zamknięciu połączenia
    const cleanup = () => {
      clearInterval(ping);
      this.clients.get(jobId)?.delete(res);
      if (this.clients.get(jobId)?.size === 0) this.clients.delete(jobId);
    };

    res.on('close',   cleanup);
    res.on('finish',  cleanup);
    res.on('error',   cleanup);

    return cleanup;
  }

  /** Wyślij event do wszystkich klientów danego jobId */
  send(jobId: string, event: PublishEvent): void {
    const subscribers = this.clients.get(jobId);
    if (!subscribers?.size) return;

    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of subscribers) {
      try {
        res.write(data);
        // Wymuszaj flush (ważne dla Node.js http)
        if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
          (res as unknown as { flush: () => void }).flush();
        }
      } catch {
        // Klient rozłączony – cleanup zadziała przez event 'close'
      }
    }
  }

  /** Sprawdź czy ktoś słucha (job aktywny) */
  hasSubscribers(jobId: string): boolean {
    return (this.clients.get(jobId)?.size ?? 0) > 0;
  }

  /** Liczba aktywnych połączeń (dla monitoringu) */
  get connectionCount(): number {
    let total = 0;
    for (const set of this.clients.values()) total += set.size;
    return total;
  }
}

// Singleton
export const sseBroker = new SseBroker();
