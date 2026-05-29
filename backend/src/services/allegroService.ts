/**
 * AllegroService
 * --------------
 * Obsługuje:
 *  1. OAuth 2.0 Authorization Code + PKCE (sandbox i produkcja)
 *  2. Automatyczne odświeżanie access tokena
 *  3. Kategorie i atrybuty Allegro
 *  4. Tworzenie / aktualizację / kończenie ofert
 *  5. Upload zdjęć do Allegro Image Service
 *  6. Compatibility List (lista kompatybilności pojazdów)
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';

// ── Stałe środowiskowe ───────────────────────
const IS_SANDBOX = (process.env.ALLEGRO_ENV ?? 'sandbox') === 'sandbox';

const ALLEGRO_URLS = {
  auth:   IS_SANDBOX
    ? 'https://allegro.pl.allegrosandbox.pl'
    : 'https://allegro.pl',
  api:    IS_SANDBOX
    ? 'https://api.allegro.pl.allegrosandbox.pl'
    : 'https://api.allegro.pl',
};

const CLIENT_ID     = process.env.ALLEGRO_CLIENT_ID!;
const CLIENT_SECRET = process.env.ALLEGRO_CLIENT_SECRET!;
const REDIRECT_URI  = process.env.ALLEGRO_REDIRECT_URI!;

// ── Typy ─────────────────────────────────────
export interface AllegroTokens {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;   // sekundy
  token_type:    string;
}

export interface AllegroCategory {
  id:       string;
  name:     string;
  parent?:  { id: string };
  leaf:     boolean;
}

export interface AllegroParameter {
  id:          string;
  name:        string;
  type:        string;   // string | integer | float | dictionary | ...
  required:    boolean;
  restrictions?: {
    multipleChoices?: boolean;
    range?: { min: number; max: number };
  };
  dictionary?: Array<{ id: string; value: string }>;
  unit?: string;
}

export interface AllegroOffer {
  id:          string;
  name:        string;
  publication: { status: string; endingAt?: string };
  saleInfo:    { currentPrice: { amount: string; currency: string } };
}

// ── PKCE helpers ─────────────────────────────
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── In-memory store dla PKCE verifierów ──────
const pkceStore = new Map<string, { verifier: string; createdAt: number }>();

// ── Singleton http klient ─────────────────────
let _http: AxiosInstance | null = null;

function buildHttp(accessToken: string): AxiosInstance {
  return axios.create({
    baseURL: ALLEGRO_URLS.api,
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      Accept:         'application/vnd.allegro.public.v1+json',
      'Content-Type': 'application/vnd.allegro.public.v1+json',
    },
    timeout: 30_000,
  });
}

// ── Pobierz i odśwież token z bazy ───────────
async function getValidAccessToken(): Promise<string> {
  const cred = await prisma.portalCredential.findUnique({
    where: { portal: 'ALLEGRO' },
  });
  if (!cred || !cred.isActive) {
    throw new Error('Brak aktywnej konfiguracji Allegro – zaloguj się przez OAuth');
  }

  const cfg = JSON.parse(cred.config) as {
    access_token:  string;
    refresh_token: string;
    expires_at:    number; // unix timestamp ms
  };

  // Jeśli token wygaśnie za mniej niż 5 minut – odśwież
  if (Date.now() > cfg.expires_at - 5 * 60 * 1000) {
    const fresh = await refreshAccessToken(cfg.refresh_token);
    const newCfg = {
      access_token:  fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at:    Date.now() + fresh.expires_in * 1000,
    };
    await prisma.portalCredential.update({
      where: { portal: 'ALLEGRO' },
      data:  {
        config:    JSON.stringify(newCfg),
        expiresAt: new Date(newCfg.expires_at),
      },
    });
    return fresh.access_token;
  }

  return cfg.access_token;
}

async function refreshAccessToken(refreshToken: string): Promise<AllegroTokens> {
  const resp = await axios.post<AllegroTokens>(
    `${ALLEGRO_URLS.auth}/auth/oauth/token`,
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      redirect_uri:  REDIRECT_URI,
    }),
    {
      auth: { username: CLIENT_ID, password: CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );
  return resp.data;
}

async function http(): Promise<AxiosInstance> {
  const token = await getValidAccessToken();
  _http = buildHttp(token);
  return _http;
}

// ════════════════════════════════════════════
// PUBLICZNE METODY SERWISU
// ════════════════════════════════════════════

/** 1. Generuj URL do logowania OAuth (krok 1 PKCE) */
export function buildAuthorizationUrl(state: string): string {
  const verifier  = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  // Przechowaj verifier powiązany ze state (TTL 10 minut)
  pkceStore.set(state, { verifier, createdAt: Date.now() });
  setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             CLIENT_ID,
    redirect_uri:          REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
    state,
  });

  return `${ALLEGRO_URLS.auth}/auth/oauth/authorize?${params}`;
}

/** 2. Wymień code na tokeny (krok 2 PKCE) */
export async function exchangeCodeForTokens(
  code:  string,
  state: string,
): Promise<AllegroTokens> {
  const entry = pkceStore.get(state);
  if (!entry) throw new Error('Nieprawidłowy lub wygasły state PKCE');
  pkceStore.delete(state);

  const resp = await axios.post<AllegroTokens>(
    `${ALLEGRO_URLS.auth}/auth/oauth/token`,
    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      code_verifier: entry.verifier,
    }),
    {
      auth: { username: CLIENT_ID, password: CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );

  // Zapisz tokeny w bazie
  await prisma.portalCredential.upsert({
    where: { portal: 'ALLEGRO' },
    create: {
      portal:    'ALLEGRO',
      label:     `Allegro (${IS_SANDBOX ? 'sandbox' : 'produkcja'})`,
      isActive:  true,
      config:    JSON.stringify({
        access_token:  resp.data.access_token,
        refresh_token: resp.data.refresh_token,
        expires_at:    Date.now() + resp.data.expires_in * 1000,
      }),
      expiresAt: new Date(Date.now() + resp.data.expires_in * 1000),
    },
    update: {
      isActive:  true,
      config:    JSON.stringify({
        access_token:  resp.data.access_token,
        refresh_token: resp.data.refresh_token,
        expires_at:    Date.now() + resp.data.expires_in * 1000,
      }),
      expiresAt: new Date(Date.now() + resp.data.expires_in * 1000),
    },
  });

  return resp.data;
}

/** 3. Sprawdź status połączenia */
export async function getConnectionStatus(): Promise<{
  connected: boolean;
  env: string;
  expiresAt?: string;
  user?: { login: string; id: string };
}> {
  const cred = await prisma.portalCredential.findUnique({
    where: { portal: 'ALLEGRO' },
  });
  if (!cred || !cred.isActive) return { connected: false, env: IS_SANDBOX ? 'sandbox' : 'production' };

  try {
    const client = await http();
    const resp = await client.get<{ login: string; id: string }>('/me');
    return {
      connected: true,
      env:       IS_SANDBOX ? 'sandbox' : 'production',
      expiresAt: cred.expiresAt?.toISOString(),
      user:      resp.data,
    };
  } catch {
    return { connected: false, env: IS_SANDBOX ? 'sandbox' : 'production' };
  }
}

/** 4. Pobierz drzewo kategorii */
export async function getCategories(parentId?: string): Promise<AllegroCategory[]> {
  const client = await http();
  const params: Record<string, string> = {};
  if (parentId) params['parent.id'] = parentId;
  const resp = await client.get<{ categories: AllegroCategory[] }>('/sale/categories', { params });
  return resp.data.categories;
}

/** 5. Pobierz atrybuty (parametry) kategorii */
export async function getCategoryParameters(categoryId: string): Promise<AllegroParameter[]> {
  const client = await http();
  const resp = await client.get<{ parameters: AllegroParameter[] }>(
    `/sale/categories/${categoryId}/parameters`,
  );
  return resp.data.parameters;
}

/** 6. Upload zdjęcia do Allegro Image Service */
export async function uploadImage(imageUrl: string): Promise<string> {
  const client = await http();

  // Pobierz plik z naszego serwera
  const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const base64  = Buffer.from(imgResp.data).toString('base64');
  const mime    = (imgResp.headers['content-type'] as string) ?? 'image/jpeg';

  const resp = await client.post<{ location: string }>(
    '/sale/images',
    { imageData: base64, mimeType: mime },
    { headers: { 'Content-Type': 'application/vnd.allegro.public.v1+json' } },
  );
  return resp.data.location; // URL obrazka w Allegro CDN
}

// ── Typ dla budowania oferty ─────────────────
export interface BuildOfferParams {
  name:         string;
  categoryId:   string;
  description:  string;        // HTML
  price:        number;
  stock:        number;
  ean?:         string;
  parameters?:  Array<{ id: string; values?: string[]; valuesIds?: string[]; rangeValue?: { from: string; to: string } }>;
  imageUrls?:   string[];      // nasze URL-e zdjęć → będą uploadowane
  compatibility?: Array<{      // lista kompatybilności
    tecdocId?: string;
    brand: string; model: string; year?: number;
  }>;
  deliveryShippingRates?: string; // ID zestawu wysyłki
  location?: { city: string; countryCode: string; postCode: string };
  duration?: number;           // dni (domyślnie 30)
  condition?: 'NEW' | 'USED';
}

/** 7. Zbuduj obiekt oferty Allegro z parametrów */
export async function buildOfferPayload(params: BuildOfferParams): Promise<Record<string, unknown>> {
  // Upload zdjęć → pobierz URL-e Allegro CDN
  const allegroImages: Array<{ url: string }> = [];
  if (params.imageUrls?.length) {
    const appUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:4000';
    for (const url of params.imageUrls.slice(0, 16)) {
      try {
        const fullUrl = url.startsWith('http') ? url : `${appUrl}${url}`;
        const allegroUrl = await uploadImage(fullUrl);
        allegroImages.push({ url: allegroUrl });
      } catch (e) {
        console.warn('[Allegro] Upload zdjęcia nieudany:', url, e);
      }
    }
  }

  const offer: Record<string, unknown> = {
    name: params.name,
    category: { id: params.categoryId },
    description: {
      sections: [{
        items: [{ type: 'TEXT', content: params.description }],
      }],
    },
    sellingMode: {
      format: 'BUY_NOW',
      price: { amount: params.price.toFixed(2), currency: 'PLN' },
    },
    stock: { available: params.stock, unit: 'UNIT' },
    publication: {
      duration: `PT${(params.duration ?? 30) * 24}H`,
      status: 'ACTIVE',
    },
    condition: params.condition === 'USED' ? 'USED' : 'NEW',
  };

  if (allegroImages.length) offer.images = allegroImages;

  if (params.ean) {
    offer.external = { id: params.ean };
  }

  if (params.parameters?.length) {
    offer.parameters = params.parameters;
  }

  if (params.location) {
    offer.location = {
      city:        params.location.city,
      countryCode: params.location.countryCode,
      postCode:    params.location.postCode,
    };
  }

  if (params.deliveryShippingRates) {
    offer.delivery = { shippingRates: { id: params.deliveryShippingRates } };
  }

  // Compatibility List
  if (params.compatibility?.length) {
    offer.compatibilityList = {
      items: params.compatibility.map((c) => ({
        ...(c.tecdocId ? { tecdocId: c.tecdocId } : {
          text: [c.brand, c.model, c.year].filter(Boolean).join(' '),
        }),
      })),
    };
  }

  return offer;
}

/** 8. Utwórz nową ofertę */
export async function createOffer(payload: Record<string, unknown>): Promise<AllegroOffer> {
  const client = await http();
  const resp = await client.post<AllegroOffer>('/sale/product-offers', payload);
  return resp.data;
}

/** 9. Aktualizuj istniejącą ofertę */
export async function updateOffer(
  offerId: string,
  payload: Record<string, unknown>,
): Promise<AllegroOffer> {
  const client = await http();
  const resp = await client.patch<AllegroOffer>(`/sale/product-offers/${offerId}`, payload);
  return resp.data;
}

/** 10. Zakończ ofertę */
export async function endOffer(offerId: string): Promise<void> {
  const client = await http();
  await client.delete(`/sale/offers/${offerId}`);
}

/** 11. Pobierz ofertę */
export async function getOffer(offerId: string): Promise<AllegroOffer> {
  const client = await http();
  const resp = await client.get<AllegroOffer>(`/sale/product-offers/${offerId}`);
  return resp.data;
}

/** 12. Pobierz listę shipping rates (zestawów wysyłki) */
export async function getShippingRates(): Promise<Array<{ id: string; name: string }>> {
  const client = await http();
  const resp = await client.get<{ shippingRates: Array<{ id: string; name: string }> }>(
    '/sale/shipping-rates',
  );
  return resp.data.shippingRates;
}

/** 13. Pobierz billing points (lokalizacje) */
export async function getBillingAddress(): Promise<unknown> {
  const client = await http();
  const resp = await client.get('/sale/points-of-service');
  return resp.data;
}
