import { prisma } from '../utils/prisma';
import {
  fetchParts, fetchEngines, fetchGearboxes,
  resolvePhotoUrl, mapStatus,
  TpPart, TpEngine, TpGearbox, TpVehicle,
} from './truckpartsClient';

const SOURCE = 'truckparts';

type SyncStats = {
  totalFetched: number;
  created: number;
  updated: number;
  deactivated: number;
  errors: number;
  errorDetails: string[];
};

// ── Mapowanie danych ──────────────────────────────────────────────────────────

function partData(item: TpPart, userId: string) {
  const { stock, isActive } = mapStatus(item.status);
  const price = Number(item.price ?? 0);
  return {
    name: item.name,
    oemNumber: item.oem || null,
    category: normalizeCategory(item.category ?? 'Inne'),
    condition: 'USED' as const,
    priceNet: price,
    priceBrutto: Math.round(price * 1.23 * 100) / 100,
    vatRate: 23,
    stock,
    isActive,
    descriptionShort: item.note || null,
    externalId: `tp:part:${item.id}`,
    externalSource: SOURCE,
    userId,
  };
}

function engineData(item: TpEngine, userId: string) {
  const { stock, isActive } = mapStatus(item.status);
  const price = Number(item.price ?? 0);
  const params = [
    item.displacement && `Pojemność: ${item.displacement}`,
    item.power && `Moc: ${item.power} KM`,
    item.fuel && `Paliwo: ${item.fuel}`,
    item.code && `Kod: ${item.code}`,
    item.mileage && `Przebieg: ${item.mileage}`,
  ].filter(Boolean).join(' | ');
  return {
    name: `Silnik ${item.oem}`,
    oemNumber: item.oem || null,
    category: 'silnik',
    condition: 'USED' as const,
    priceNet: price,
    priceBrutto: Math.round(price * 1.23 * 100) / 100,
    vatRate: 23,
    stock,
    isActive,
    descriptionShort: item.note || null,
    descriptionLong: params || null,
    externalId: `tp:engine:${item.id}`,
    externalSource: SOURCE,
    userId,
  };
}

function gearboxData(item: TpGearbox, userId: string) {
  const { stock, isActive } = mapStatus(item.status);
  const price = Number(item.price ?? 0);
  const params = [
    item.type && `Typ: ${item.type}`,
    item.brand && `Marka: ${item.brand}`,
    item.retarder && 'Retarder: Tak',
    item.mileage && `Przebieg: ${item.mileage}`,
  ].filter(Boolean).join(' | ');
  return {
    name: `Skrzynia biegów ${item.oem}`,
    oemNumber: item.oem || null,
    category: 'skrzynia',
    condition: 'USED' as const,
    priceNet: price,
    priceBrutto: Math.round(price * 1.23 * 100) / 100,
    vatRate: 23,
    stock,
    isActive,
    descriptionShort: item.note || null,
    descriptionLong: params || null,
    externalId: `tp:gearbox:${item.id}`,
    externalSource: SOURCE,
    userId,
  };
}

function normalizeCategory(cat: string): string {
  const map: Record<string, string> = {
    'Inne': 'inne',
    'Silnik': 'silnik',
    'Skrzynia': 'skrzynia',
    'Zawieszenie': 'zawieszenie',
    'Elektryka': 'elektryka',
    'Hamulce': 'hamulce',
    'Karoseria': 'karoseria',
    'Kabina': 'kabina',
    'Chłodnica': 'chłodnica',
    'Oś': 'osie',
  };
  return map[cat] ?? cat.toLowerCase();
}

// ── Upsert jednej części ──────────────────────────────────────────────────────

async function upsertPart(
  data: ReturnType<typeof partData>,
  photos: string[],
  vehicle: TpVehicle | null | undefined,
  stats: SyncStats,
) {
  const existing = await prisma.part.findFirst({
    where: { externalId: data.externalId },
    select: { id: true },
  });

  let partId: string;

  if (existing) {
    await prisma.part.update({ where: { id: existing.id }, data });
    partId = existing.id;
    stats.updated++;
  } else {
    const created = await prisma.part.create({ data });
    partId = created.id;
    stats.created++;
  }

  // Synchronizuj zdjęcia (zastąp jeśli zmieniły się)
  if (photos.length > 0) {
    await prisma.partImage.deleteMany({ where: { partId } });
    await prisma.partImage.createMany({
      data: photos.map((url, i) => ({
        partId,
        filename: url.split('/').pop() ?? `photo_${i}`,
        url: resolvePhotoUrl(url),
        order: i,
        isCover: i === 0,
      })),
    });
  }

  // Synchronizuj kompatybilność (z pojazdu źródłowego)
  if (vehicle) {
    const compExists = await prisma.compatibility.findFirst({ where: { partId } });
    if (!compExists) {
      await prisma.compatibility.create({
        data: {
          partId,
          brand: vehicle.brand,
          model: vehicle.model,
          yearFrom: vehicle.year,
          yearTo: vehicle.year,
          vinRange: vehicle.vin || null,
        },
      });
    }
  }
}

// ── Główna funkcja sync ───────────────────────────────────────────────────────

export async function runSync(userId: string, triggeredBy: 'MANUAL' | 'SCHEDULED'): Promise<string> {
  const log = await prisma.syncLog.create({
    data: { status: 'RUNNING', triggeredBy },
  });

  const stats: SyncStats = {
    totalFetched: 0, created: 0, updated: 0, deactivated: 0, errors: 0, errorDetails: [],
  };

  const syncedExternalIds = new Set<string>();

  try {
    const [parts, engines, gearboxes] = await Promise.all([
      fetchParts(),
      fetchEngines(),
      fetchGearboxes(),
    ]);

    stats.totalFetched = parts.length + engines.length + gearboxes.length;

    for (const item of parts) {
      const externalId = `tp:part:${item.id}`;
      syncedExternalIds.add(externalId);
      try {
        await upsertPart(partData(item, userId), item.photos ?? [], item.vehicles, stats);
      } catch (err) {
        stats.errors++;
        stats.errorDetails.push(`part:${item.id} — ${(err as Error).message}`);
      }
    }

    for (const item of engines) {
      const externalId = `tp:engine:${item.id}`;
      syncedExternalIds.add(externalId);
      try {
        await upsertPart(engineData(item, userId), item.photos ?? [], item.vehicles, stats);
      } catch (err) {
        stats.errors++;
        stats.errorDetails.push(`engine:${item.id} — ${(err as Error).message}`);
      }
    }

    for (const item of gearboxes) {
      const externalId = `tp:gearbox:${item.id}`;
      syncedExternalIds.add(externalId);
      try {
        await upsertPart(gearboxData(item, userId), item.photos ?? [], item.vehicles, stats);
      } catch (err) {
        stats.errors++;
        stats.errorDetails.push(`gearbox:${item.id} — ${(err as Error).message}`);
      }
    }

    // Dezaktywuj części których już nie ma w magazynie
    const { count } = await prisma.part.updateMany({
      where: {
        externalSource: SOURCE,
        externalId: { notIn: Array.from(syncedExternalIds) },
        isActive: true,
      },
      data: { isActive: false, stock: 0 },
    });
    stats.deactivated = count;

    const status = stats.errors === 0 ? 'SUCCESS' : 'PARTIAL';
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status,
        finishedAt: new Date(),
        ...stats,
        errorDetails: stats.errorDetails.length ? JSON.stringify(stats.errorDetails) : null,
      },
    });

    return log.id;
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'ERROR',
        finishedAt: new Date(),
        errorDetails: JSON.stringify([(err as Error).message]),
      },
    });
    throw err;
  }
}
