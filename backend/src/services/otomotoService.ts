/**
 * OtomotoService
 * --------------
 * Obsługuje integrację z Otomoto Business API.
 *
 * Otomoto używa OAuth 2.0 Client Credentials (konta partnerskie)
 * lub Authorization Code dla zwykłych kont biznesowych.
 *
 * Dokumentacja: https://developer.otomoto.pl/
 *
 * Mapowanie kategorii części:
 *  - Otomoto używa hierarchii: Motoryzacja > Części > [podkategoria]
 *  - ID kategorii zależy od środowiska (sandbox vs prod)
 */

import axios, { AxiosInstance } from 'axios';
import { prisma } from '../utils/prisma';

// ── Stałe ─────────────────────────────────────
const OTOMOTO_BASE_URL = 'https://www.otomoto.pl/api/open';
const OTOMOTO_AUTH_URL = 'https://www.otomoto.pl/oauth/token';

// Kategorie części ciężarowych w Otomoto
export const OTOMOTO_TRUCK_PARTS_CATEGORIES: Record<string, { id: string; name: string }> = {
  hamulce:           { id: '30', name: 'Układ hamulcowy' },
  silnik:            { id: '31', name: 'Silnik i osprzęt' },
  skrzynia:          { id: '32', name: 'Skrzynia biegów' },
  zawieszenie:       { id: '33', name: 'Zawieszenie' },
  elektryka:         { id: '34', name: 'Elektryka' },
  nadwozie:          { id: '35', name: 'Nadwozie i karoseria' },
  uklad_kierowniczy: { id: '36', name: 'Układ kierowniczy' },
  uklad_wydechowy:   { id: '37', name: 'Układ wydechowy' },
  klimatyzacja:      { id: '38', name: 'Klimatyzacja' },
  oswietlenie:       { id: '39', name: 'Oświetlenie' },
  filtry:            { id: '40', name: 'Filtry' },
  pasy_i_napedy:     { id: '41', name: 'Pasy i napędy' },
  inne:              { id: '42', name: 'Pozostałe' },
};

// ── Typy ──────────────────────────────────────
export interface OtomotoTokens {
  access_token:  string;
  token_type:    string;
  expires_in:    number;
}

export interface OtomotoAdvertiser {
  id:     string;
  email:  string;
  status: string;
  phones: string[];
}

export interface OtomotoAd {
  id:          string;
  url:         string;
  status:      string;
  created_at:  string;
  valid_to?:   string;
  title:       string;
  price:       { value: string; currency: string };
}

export interface OtomotoAdPayload {
  advertiser_id: string;
  category:      { id: string };
  title:         string;
  description:   string;
  price:         { value: string; currency: string; negotiable?: boolean };
  location:      { city_name: string; region_name?: string };
  params:        OtomotoParam[];
  images?:       OtomotoImage[];
  contact?:      { phone: string; name?: string };
}

export interface OtomotoParam {
  key:   string;
  value: string | string[];
}

export interface OtomotoImage {
  url: string;
}

// ── Token management ──────────────────────────

async function getCredentials(): Promise<{ clientId: string; clientSecret: string; advertiserId: string } | null> {
  const cred = await prisma.portalCredential.findUnique({ where: { portal: 'OTOMOTO' } });
  if (!cred || !cred.isActive) return null;

  const cfg = JSON.parse(cred.config) as {
    clientId: string;
    clientSecret: string;
    advertiserId: string;
  };
  return cfg;
}

async function getValidAccessToken(): Promise<string> {
  const cred = await prisma.portalCredential.findUnique({ where: { portal: 'OTOMOTO' } });
  if (!cred || !cred.isActive) {
    throw new Error('Brak aktywnej konfiguracji Otomoto – skonfiguruj dane w Ustawieniach');
  }

  const cfg = JSON.parse(cred.config) as {
    clientId:      string;
    clientSecret:  string;
    advertiserId:  string;
    access_token?: string;
    expires_at?:   number;
  };

  // Sprawdź czy token jest świeży (>5 min do wygaśnięcia)
  if (cfg.access_token && cfg.expires_at && Date.now() < cfg.expires_at - 5 * 60 * 1000) {
    return cfg.access_token;
  }

  // Pobierz nowy token (Client Credentials)
  const resp = await axios.post<OtomotoTokens>(
    OTOMOTO_AUTH_URL,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     cfg.clientId,
      client_secret: cfg.clientSecret,
      scope:         'read write',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const newCfg = {
    ...cfg,
    access_token: resp.data.access_token,
    expires_at:   Date.now() + resp.data.expires_in * 1000,
  };

  await prisma.portalCredential.update({
    where: { portal: 'OTOMOTO' },
    data:  {
      config:    JSON.stringify(newCfg),
      expiresAt: new Date(newCfg.expires_at),
    },
  });

  return resp.data.access_token;
}

async function http(): Promise<AxiosInstance> {
  const token = await getValidAccessToken();
  return axios.create({
    baseURL: OTOMOTO_BASE_URL,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    timeout: 30_000,
  });
}

// ═══════════════════════════════════════════════
// PUBLICZNE METODY
// ═══════════════════════════════════════════════

/** Zapisz dane uwierzytelniające Otomoto w bazie */
export async function saveCredentials(params: {
  clientId:     string;
  clientSecret: string;
  advertiserId: string;
}): Promise<void> {
  await prisma.portalCredential.upsert({
    where: { portal: 'OTOMOTO' },
    create: {
      portal:   'OTOMOTO',
      label:    'Otomoto Business',
      isActive: true,
      config:   JSON.stringify(params),
    },
    update: {
      isActive: true,
      config:   JSON.stringify(params),
    },
  });
}

/** Sprawdź status połączenia i pobierz profil reklamodawcy */
export async function getConnectionStatus(): Promise<{
  connected:    boolean;
  advertiser?:  OtomotoAdvertiser;
  advertiserId?: string;
}> {
  const creds = await getCredentials();
  if (!creds) return { connected: false };

  try {
    const client = await http();
    const resp = await client.get<OtomotoAdvertiser>(`/advertisers/${creds.advertiserId}`);
    return { connected: true, advertiser: resp.data, advertiserId: creds.advertiserId };
  } catch {
    return { connected: false, advertiserId: creds.advertiserId };
  }
}

/** Pobierz kategorie dla części */
export async function getCategories(parentId?: string): Promise<Array<{ id: string; name: string }>> {
  const client = await http();
  const url = parentId ? `/categories/${parentId}/children` : '/categories/342'; // 342 = Części samochodowe
  const resp = await client.get<{ data: Array<{ id: string; name: string }> }>(url);
  return resp.data.data ?? [];
}

/** Pobierz parametry kategorii */
export async function getCategoryParams(categoryId: string): Promise<Array<{
  name: string;
  key:  string;
  type: string;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
}>> {
  const client = await http();
  const resp = await client.get<{ data: unknown[] }>(`/categories/${categoryId}/parameters`);
  return resp.data.data as Array<{
    name: string; key: string; type: string; required: boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
}

/** Zbuduj payload ogłoszenia Otomoto z danych części */
export function buildAdPayload(params: {
  title:        string;
  description:  string;
  price:        number;
  categoryId:   string;
  advertiserId: string;
  city:         string;
  region?:      string;
  phone?:       string;
  oemNumber?:   string;
  condition?:   'new' | 'used' | 'regenerated';
  imageUrls?:   string[];
  brand?:       string;
  model?:       string;
  yearFrom?:    number;
  stock?:       number;
}): OtomotoAdPayload {
  const otomotoParams: OtomotoParam[] = [];

  if (params.oemNumber)  otomotoParams.push({ key: 'oem_number',     value: params.oemNumber });
  if (params.condition)  otomotoParams.push({ key: 'state',          value: params.condition });
  if (params.brand)      otomotoParams.push({ key: 'make',           value: params.brand });
  if (params.model)      otomotoParams.push({ key: 'model',          value: params.model });
  if (params.yearFrom)   otomotoParams.push({ key: 'year',           value: String(params.yearFrom) });
  if (params.stock)      otomotoParams.push({ key: 'quantity',       value: String(params.stock) });

  const payload: OtomotoAdPayload = {
    advertiser_id: params.advertiserId,
    category:      { id: params.categoryId },
    title:         params.title.slice(0, 70), // Otomoto max 70 znaków
    description:   params.description.slice(0, 9000),
    price: {
      value:      params.price.toFixed(2),
      currency:   'PLN',
      negotiable: false,
    },
    location: {
      city_name:   params.city,
      region_name: params.region,
    },
    params: otomotoParams,
  };

  if (params.imageUrls?.length) {
    payload.images = params.imageUrls.slice(0, 32).map((url) => ({ url }));
  }

  if (params.phone) {
    payload.contact = { phone: params.phone };
  }

  return payload;
}

/** Utwórz nowe ogłoszenie */
export async function createAd(payload: OtomotoAdPayload): Promise<OtomotoAd> {
  const creds = await getCredentials();
  if (!creds) throw new Error('Brak konfiguracji Otomoto');

  const client = await http();
  const resp = await client.post<{ data: OtomotoAd }>(
    `/advertisers/${creds.advertiserId}/adverts`,
    payload,
  );
  return resp.data.data;
}

/** Aktualizuj ogłoszenie */
export async function updateAd(adId: string, payload: Partial<OtomotoAdPayload>): Promise<OtomotoAd> {
  const creds = await getCredentials();
  if (!creds) throw new Error('Brak konfiguracji Otomoto');

  const client = await http();
  const resp = await client.put<{ data: OtomotoAd }>(
    `/advertisers/${creds.advertiserId}/adverts/${adId}`,
    payload,
  );
  return resp.data.data;
}

/** Usuń / zakończ ogłoszenie */
export async function deleteAd(adId: string): Promise<void> {
  const creds = await getCredentials();
  if (!creds) throw new Error('Brak konfiguracji Otomoto');

  const client = await http();
  await client.delete(`/advertisers/${creds.advertiserId}/adverts/${adId}`);
}

/** Pobierz ogłoszenia reklamodawcy */
export async function getAds(params?: {
  page?:   number;
  limit?:  number;
  status?: string;
}): Promise<{ data: OtomotoAd[]; total: number }> {
  const creds = await getCredentials();
  if (!creds) throw new Error('Brak konfiguracji Otomoto');

  const client = await http();
  const resp = await client.get<{ data: OtomotoAd[]; meta: { total: number } }>(
    `/advertisers/${creds.advertiserId}/adverts`,
    {
      params: {
        page:  params?.page  ?? 1,
        limit: params?.limit ?? 50,
        ...(params?.status && { status: params.status }),
      },
    },
  );
  return { data: resp.data.data, total: resp.data.meta?.total ?? 0 };
}

/** Mapuj condition Part → Otomoto condition */
export function mapCondition(condition: string): 'new' | 'used' | 'regenerated' {
  if (condition === 'NEW') return 'new';
  if (condition === 'REGENERATED') return 'regenerated';
  return 'used';
}

/** Mapuj kategorię Part → ID kategorii Otomoto */
export function mapCategory(partCategory: string, portalCategoryId?: string | null): string {
  if (portalCategoryId) return portalCategoryId;
  return OTOMOTO_TRUCK_PARTS_CATEGORIES[partCategory]?.id
    ?? OTOMOTO_TRUCK_PARTS_CATEGORIES.inne.id;
}
