/**
 * PublishJobService
 * -----------------
 * Zarządza jobbami publikowania części na wszystkie portale.
 * Każdy job ma unikalny ID i emituje eventy SSE do klientów.
 *
 * Flow:
 *  1. createJob(partId, portals) → jobId
 *  2. Klient SSE subskrybuje /api/publish/stream/:jobId
 *  3. runJob(jobId) → sekwencyjnie/równolegle wystawia na każdy portal
 *  4. Każdy krok emituje event SSE (started → done/error)
 *  5. job_done zamyka stream
 */

import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { publishListing } from './listingExecutor';
import { sseBroker, type PublishEvent } from '../utils/sseBroker';

// ── Typy ──────────────────────────────────────

export type Portal = 'ALLEGRO' | 'OTOMOTO' | 'AUTOLINE';

export interface PublishJobConfig {
  partId:     string;
  userId:     string;
  portals:    Portal[];   // które portale wystawiać
  templateIds?: Partial<Record<Portal, string>>; // opcjonalne szablony per portal
}

export interface PortalJobResult {
  portal:      Portal;
  listingId?:  string;
  status:      'ok' | 'error' | 'skipped';
  externalId?: string;
  externalUrl?: string;
  error?:      string;
}

export interface PublishJob {
  id:        string;
  partId:    string;
  userId:    string;
  portals:   Portal[];
  status:    'pending' | 'running' | 'done' | 'error';
  results:   PortalJobResult[];
  startedAt?: Date;
  doneAt?:    Date;
}

// ── In-memory job store (TTL 10 minut) ────────
const jobs = new Map<string, PublishJob>();

function cleanupOldJobs() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.doneAt && job.doneAt.getTime() < cutoff) jobs.delete(id);
  }
}
setInterval(cleanupOldJobs, 60_000);

// ── Helpers ───────────────────────────────────

function emit(jobId: string, event: Omit<PublishEvent, 'jobId' | 'timestamp'>) {
  sseBroker.send(jobId, { ...event, jobId, timestamp: new Date().toISOString() });
}

async function getOrCreateListing(
  partId:     string,
  userId:     string,
  portal:     Portal,
  templateId?: string,
): Promise<{ listingId: string } | { error: string }> {
  // Znajdź szablon
  const template = templateId
    ? await prisma.template.findFirst({ where: { id: templateId, userId } })
    : await prisma.template.findFirst({
        where: { userId, portal, isDefault: true, isActive: true },
      });

  if (!template) {
    return { error: `Brak ${templateId ? '' : 'domyślnego '}szablonu dla portalu ${portal}` };
  }

  const listing = await prisma.listing.upsert({
    where:  { partId_templateId: { partId, templateId: template.id } },
    create: {
      partId, templateId: template.id, portal,
      status: 'PENDING', userId,
    },
    update: { status: 'PENDING', errorMessage: null, errorDetails: null },
  });

  return { listingId: listing.id };
}

// ── Publiczne API ─────────────────────────────

/** Utwórz job (nie startuje jeszcze) */
export function createJob(config: PublishJobConfig): string {
  const id = crypto.randomBytes(8).toString('hex');
  jobs.set(id, {
    id,
    partId:  config.partId,
    userId:  config.userId,
    portals: config.portals,
    status:  'pending',
    results: [],
  });
  return id;
}

/** Pobierz job */
export function getJob(jobId: string): PublishJob | undefined {
  return jobs.get(jobId);
}

/**
 * Uruchom job — wystawia część na wszystkie portale sekwencyjnie,
 * emitując eventy SSE na każdym kroku.
 *
 * Sekwencyjność (nie równoległość) jest celowa:
 *  - Unikamy race conditions przy refresh tokenów
 *  - Łatwiej debugować kolejność eventów
 *  - Allegro ma rate limiting 10 req/s
 */
export async function runJob(jobId: string, config: PublishJobConfig): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} nie istnieje`);

  job.status    = 'running';
  job.startedAt = new Date();

  emit(jobId, {
    type:     'job_started',
    progress: { done: 0, total: config.portals.length },
  });

  let done = 0;

  for (const portal of config.portals) {
    // Sygnalizuj start portalu
    emit(jobId, { type: 'portal_pending', portal, progress: { done, total: config.portals.length } });

    // Utwórz / znajdź listing
    const listingResult = await getOrCreateListing(
      config.partId, config.userId, portal,
      config.templateIds?.[portal],
    );

    if ('error' in listingResult) {
      const result: PortalJobResult = { portal, status: 'skipped', error: listingResult.error };
      job.results.push(result);
      emit(jobId, {
        type:     'portal_error',
        portal,
        error:    listingResult.error,
        progress: { done: ++done, total: config.portals.length },
      });
      continue;
    }

    emit(jobId, {
      type:      'portal_started',
      portal,
      listingId: listingResult.listingId,
      progress:  { done, total: config.portals.length },
    });

    // Wywołaj executor
    const publishResult = await publishListing(listingResult.listingId);
    done++;

    const portalResult: PortalJobResult = {
      portal,
      listingId:   listingResult.listingId,
      status:      publishResult.status,
      externalId:  publishResult.externalId,
      externalUrl: publishResult.externalUrl,
      error:       publishResult.error,
    };
    job.results.push(portalResult);

    if (publishResult.status === 'ok') {
      emit(jobId, {
        type:        'portal_done',
        portal,
        listingId:   listingResult.listingId,
        externalId:  publishResult.externalId,
        externalUrl: publishResult.externalUrl,
        progress:    { done, total: config.portals.length },
      });
    } else {
      emit(jobId, {
        type:      'portal_error',
        portal,
        listingId: listingResult.listingId,
        error:     publishResult.error,
        progress:  { done, total: config.portals.length },
      });
    }

    // Krótka pauza między portalami (żeby nie przekraczać rate limitów)
    if (done < config.portals.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Finalizuj job
  const allOk = job.results.every((r) => r.status === 'ok');
  job.status = 'done';
  job.doneAt = new Date();

  emit(jobId, {
    type:     'job_done',
    progress: { done, total: config.portals.length },
    error:    allOk ? undefined : `${job.results.filter((r) => r.status !== 'ok').length} portale z błędami`,
  });
}

/** Uruchom job asynchronicznie (fire-and-forget dla SSE) */
export function startJobAsync(jobId: string, config: PublishJobConfig): void {
  runJob(jobId, config).catch((err) => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.doneAt = new Date();
    }
    emit(jobId, {
      type:  'job_done',
      error: (err as Error).message ?? 'Krytyczny błąd joba',
      progress: { done: 0, total: config.portals.length },
    });
    console.error('[PublishJob] Błąd krytyczny:', err);
  });
}
