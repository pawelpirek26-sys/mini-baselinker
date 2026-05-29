/**
 * ListingExecutorService
 * ----------------------
 * Orkiestruje wystawianie części na portale.
 * Każdy portal ma własną metodę `publish*`.
 * Wynik zapisuje do tabeli Listing + ListingHistory.
 */

import { prisma } from '../utils/prisma';
import * as allegro from './allegroService';
import * as otomoto from './otomotoService';
import { applyFieldMapping, buildHtmlDescription, mapConditionToAllegro } from './mappingService';
import type { Part, Compatibility, PartImage, Template, Listing } from '../utils/types';

type PartFull = Part & { images: PartImage[]; compatibility: Compatibility[] };

// ── Helpers ───────────────────────────────────

async function setListingStatus(
  listingId: string,
  status:    Listing['status'],
  extra?: {
    externalId?:  string;
    externalUrl?: string;
    errorMessage?: string;
    errorDetails?: string;
    externalData?: string;
  },
) {
  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listingId },
      data:  {
        status,
        listedAt:     status === 'ACTIVE' ? new Date() : undefined,
        ...extra,
      },
    }),
    prisma.listingHistory.create({
      data: {
        listingId,
        status,
        message: extra?.errorMessage ?? `Status → ${status}`,
        details: extra?.errorDetails ?? extra?.externalData,
      },
    }),
  ]);
}

// ═══════════════════════════════════════════════
// ALLEGRO
// ═══════════════════════════════════════════════

async function publishToAllegro(
  listing:  Listing,
  part:     PartFull,
  template: Template,
): Promise<void> {
  await setListingStatus(listing.id, 'PROCESSING');

  try {
    const fieldMapping  = JSON.parse(template.fieldMapping) as Record<string, unknown>;
    const portalConfig  = JSON.parse(template.portalConfig) as Record<string, unknown>;
    const mapped        = applyFieldMapping(part, fieldMapping);

    const categoryId = template.portalCategoryId
      ?? (portalConfig.categoryId as string | undefined)
      ?? '257517'; // domyślna kategoria "Części samochodowe"

    const payload = await allegro.buildOfferPayload({
      name:        String(mapped.title ?? mapped.name ?? part.name),
      categoryId,
      description: buildHtmlDescription(part),
      price:       Number(mapped.price ?? part.priceBrutto),
      stock:       Number(mapped.quantity ?? mapped.stock ?? part.stock),
      ean:         part.ean ?? undefined,
      condition:   mapConditionToAllegro(part.condition),
      imageUrls:   part.images.map((i: PartImage) => i.url),

      parameters: portalConfig.parameters as allegro.BuildOfferParams['parameters'],

      compatibility: part.compatibility.map((c: Compatibility) => ({
        tecdocId: c.tecdocId ?? undefined,
        brand:    c.brand,
        model:    [c.series, c.model].filter(Boolean).join(' '),
        year:     c.yearFrom ?? undefined,
      })),

      location: portalConfig.location as allegro.BuildOfferParams['location'],
      deliveryShippingRates:
        portalConfig.deliveryShippingRates as string | undefined,
      duration: Number(portalConfig.duration ?? 30),
    });

    let offer: allegro.AllegroOffer;

    if (listing.externalId) {
      // Aktualizuj istniejącą ofertę
      offer = await allegro.updateOffer(listing.externalId, payload);
    } else {
      // Utwórz nową
      offer = await allegro.createOffer(payload);
    }

    const externalUrl = IS_SANDBOX
      ? `https://allegro.pl.allegrosandbox.pl/oferta/${offer.id}`
      : `https://allegro.pl/oferta/${offer.id}`;

    await setListingStatus(listing.id, 'ACTIVE', {
      externalId:   offer.id,
      externalUrl,
      externalData: JSON.stringify(offer),
    });
  } catch (err: unknown) {
    const error   = err as { message?: string; response?: { data?: unknown } };
    const message = error.message ?? 'Nieznany błąd Allegro';
    const details = error.response?.data
      ? JSON.stringify(error.response.data)
      : undefined;

    await setListingStatus(listing.id, 'ERROR', {
      errorMessage: message,
      errorDetails: details,
    });

    throw err; // re-throw żeby executor mógł zliczać błędy
  }
}

const IS_SANDBOX = (process.env.ALLEGRO_ENV ?? 'sandbox') === 'sandbox';

// ═══════════════════════════════════════════════
// OTOMOTO
// ═══════════════════════════════════════════════

async function publishToOtomoto(
  listing:  Listing,
  part:     PartFull,
  template: Template,
): Promise<void> {
  await setListingStatus(listing.id, 'PROCESSING');

  try {
    const fieldMapping = JSON.parse(template.fieldMapping) as Record<string, unknown>;
    const portalConfig = JSON.parse(template.portalConfig) as Record<string, unknown>;
    const mapped       = applyFieldMapping(part, fieldMapping);

    // Pobierz advertiserId z konfiguracji
    const status = await otomoto.getConnectionStatus();
    if (!status.connected || !status.advertiserId) {
      throw new Error('Brak połączenia z Otomoto – skonfiguruj dane w Ustawieniach');
    }

    const title = String(mapped.title ?? mapped.name ?? part.name);
    const price = Number(mapped.price ?? part.priceNet);

    // Zbuduj opis tekstowy (Otomoto nie obsługuje HTML)
    const descParts: string[] = [];
    if (part.descriptionShort) descParts.push(part.descriptionShort);
    if (part.descriptionLong)  descParts.push(part.descriptionLong.replace(/<[^>]+>/g, ''));
    if (part.technicalParams) {
      const params = JSON.parse(part.technicalParams) as Record<string, string>;
      descParts.push('\nParametry techniczne:');
      for (const [k, v] of Object.entries(params)) {
        descParts.push(`${k}: ${v}`);
      }
    }
    if (part.compatibility.length) {
      descParts.push('\nKompatybilne pojazdy:');
      for (const c of part.compatibility) {
        descParts.push(
          [c.brand, c.series, c.model, c.yearFrom, c.yearTo ? `– ${c.yearTo}` : '']
            .filter(Boolean).join(' ')
        );
      }
    }
    const description = descParts.join('\n').slice(0, 9000);

    // Pierwsze pojazdy z kompatybilności jako wskazówka marki/modelu
    const firstCompat = part.compatibility[0];

    const payload = otomoto.buildAdPayload({
      title,
      description,
      price,
      categoryId:   otomoto.mapCategory(part.category, template.portalCategoryId),
      advertiserId: status.advertiserId,
      city:         String(portalConfig.city  ?? mapped.city  ?? 'Warszawa'),
      region:       String(portalConfig.region ?? mapped.region ?? 'mazowieckie'),
      phone:        portalConfig.phone as string | undefined,
      oemNumber:    part.oemNumber ?? undefined,
      condition:    otomoto.mapCondition(part.condition),
      imageUrls:    part.images.map((i) => i.url),
      brand:        firstCompat?.brand ?? portalConfig.brand as string | undefined,
      model:        firstCompat?.model ?? portalConfig.model as string | undefined,
      yearFrom:     firstCompat?.yearFrom ?? undefined,
      stock:        part.stock,
    });

    let ad: otomoto.OtomotoAd;

    if (listing.externalId) {
      ad = await otomoto.updateAd(listing.externalId, payload);
    } else {
      ad = await otomoto.createAd(payload);
    }

    await setListingStatus(listing.id, 'ACTIVE', {
      externalId:   ad.id,
      externalUrl:  ad.url ?? `https://www.otomoto.pl/oferta/${ad.id}`,
      externalData: JSON.stringify(ad),
    });

  } catch (err: unknown) {
    const error   = err as { message?: string; response?: { data?: unknown } };
    const message = error.message ?? 'Nieznany błąd Otomoto';
    const details = error.response?.data ? JSON.stringify(error.response.data) : undefined;

    await setListingStatus(listing.id, 'ERROR', {
      errorMessage: message,
      errorDetails: details,
    });

    throw err;
  }
}

// ═══════════════════════════════════════════════
// AUTOLINE — eksport przez plik (nie ma REST API)
// ═══════════════════════════════════════════════

async function publishToAutoline(
  listing:  Listing,
  part:     PartFull,
  template: Template,
): Promise<void> {
  // Autoline nie ma REST API – „wystawienie" = oznaczenie że część
  // została umieszczona w pliku eksportu.
  // Faktyczny eksport pliku CSV/XML jest w /api/autoline/export/*.
  // Tutaj tylko ustawiamy status ACTIVE z informacją o metodzie.

  const { buildAutolineRow, previewRow } = await import('./autolineService');
  const appBaseUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:4000';

  try {
    const row = buildAutolineRow(part, template, appBaseUrl);
    await setListingStatus(listing.id, 'ACTIVE', {
      externalData: JSON.stringify({
        method:     'file_export',
        row:        previewRow(row),
        exportedAt: new Date().toISOString(),
        note:       'Pobierz plik CSV/XML z /api/autoline/export/csv',
      }),
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    await setListingStatus(listing.id, 'ERROR', {
      errorMessage: e.message ?? 'Błąd generowania wiersza Autoline',
    });
    throw err;
  }
}

// ═══════════════════════════════════════════════
// GŁÓWNA METODA: publishListing
// ═══════════════════════════════════════════════

export interface PublishResult {
  listingId:   string;
  portal:      string;
  status:      'ok' | 'error';
  externalId?: string;
  externalUrl?: string;
  error?:      string;
}

export async function publishListing(listingId: string): Promise<PublishResult> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      part: {
        include: { images: { orderBy: { order: 'asc' } }, compatibility: true },
      },
      template: true,
    },
  });

  if (!listing) throw new Error(`Listing ${listingId} nie istnieje`);
  if (!listing.part) throw new Error('Brak powiązanej części');
  if (!listing.template) throw new Error('Brak powiązanego szablonu');

  const part     = listing.part as PartFull;
  const template = listing.template;

  try {
    switch (listing.portal) {
      case 'ALLEGRO':
        await publishToAllegro(listing, part, template);
        break;
      case 'OTOMOTO':
        await publishToOtomoto(listing, part, template);
        break;
      case 'AUTOLINE':
        await publishToAutoline(listing, part, template);
        break;
    }

    const updated = await prisma.listing.findUnique({ where: { id: listingId } });
    return {
      listingId,
      portal:      listing.portal,
      status:      'ok',
      externalId:  updated?.externalId ?? undefined,
      externalUrl: updated?.externalUrl ?? undefined,
    };
  } catch (err: unknown) {
    const e = err as Error;
    return {
      listingId,
      portal: listing.portal,
      status: 'error',
      error:  e.message,
    };
  }
}

/** Wystaw wiele listingów równolegle (max 5 jednocześnie) */
export async function publishMany(listingIds: string[]): Promise<PublishResult[]> {
  const CONCURRENCY = 5;
  const results: PublishResult[] = [];

  for (let i = 0; i < listingIds.length; i += CONCURRENCY) {
    const batch = listingIds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((id) => publishListing(id)),
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value);
      else results.push({ listingId: '?', portal: '?', status: 'error', error: r.reason?.message });
    }
  }

  return results;
}
