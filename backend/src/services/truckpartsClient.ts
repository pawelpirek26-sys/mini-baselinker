import axios from 'axios';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://chibbgzhnqsdipepmmbz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

const PAGE_SIZE = 1000;

const client = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  },
});

// ── Typy Supabase ─────────────────────────────────────────────────────────────

export interface TpVehicle {
  id: number;
  brand: string;
  model: string;
  year: number;
  vin?: string;
  registration_number?: string;
  engineOem?: string;
  gearboxOem?: string;
}

export interface TpPart {
  id: number;
  vehicle_id?: number;
  oem: string;
  name: string;
  category?: string;
  status: 'dostępna' | 'zarezerwowana' | 'sprzedana' | 'uszkodzona';
  price?: number;
  location?: string;
  note?: string;
  photos?: string[];
  created_at?: string;
  updated_at?: string;
  vehicles?: TpVehicle | null;
}

export interface TpEngine {
  id: number;
  vehicle_id?: number;
  oem: string;
  displacement?: string;
  power?: string;
  fuel?: string;
  code?: string;
  mileage?: string;
  status: 'dostępna' | 'zarezerwowana' | 'sprzedana' | 'uszkodzona';
  price?: number;
  location?: string;
  note?: string;
  photos?: string[];
  created_at?: string;
  updated_at?: string;
  vehicles?: TpVehicle | null;
}

export interface TpGearbox {
  id: number;
  vehicle_id?: number;
  oem: string;
  brand?: string;
  type?: string;
  retarder?: boolean;
  mileage?: string;
  status: 'dostępna' | 'zarezerwowana' | 'sprzedana' | 'uszkodzona';
  price?: number;
  location?: string;
  note?: string;
  photos?: string[];
  created_at?: string;
  updated_at?: string;
  vehicles?: TpVehicle | null;
}

// ── Helper: pobiera wszystkie strony ─────────────────────────────────────────

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;

  while (true) {
    const { data } = await client.get<T[]>(`/${table}`, {
      params: { select, limit: PAGE_SIZE, offset },
      headers: { Prefer: 'count=exact' },
    });

    results.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}

const VEHICLE_SELECT = 'brand,model,year,vin,registration_number';

export async function fetchParts(): Promise<TpPart[]> {
  return fetchAll<TpPart>('parts', `*,vehicles!vehicle_id(${VEHICLE_SELECT})`);
}

export async function fetchEngines(): Promise<TpEngine[]> {
  return fetchAll<TpEngine>('engines', `*,vehicles!vehicle_id(${VEHICLE_SELECT})`);
}

export async function fetchGearboxes(): Promise<TpGearbox[]> {
  return fetchAll<TpGearbox>('gearboxes', `*,vehicles!vehicle_id(${VEHICLE_SELECT})`);
}

// ── Pomocnicze ────────────────────────────────────────────────────────────────

export function resolvePhotoUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
}

export function mapStatus(status: string): { stock: number; isActive: boolean } {
  switch (status) {
    case 'dostępna':      return { stock: 1, isActive: true };
    case 'zarezerwowana': return { stock: 0, isActive: true };
    default:              return { stock: 0, isActive: false };
  }
}
