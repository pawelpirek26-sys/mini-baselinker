export type PartCondition = 'NEW' | 'REGENERATED' | 'USED';
export type Portal = 'ALLEGRO' | 'OTOMOTO' | 'AUTOLINE';
export type ListingStatus = 'PENDING' | 'PROCESSING' | 'ACTIVE' | 'EXPIRED' | 'ENDED' | 'ERROR' | 'DRAFT';

export interface PartImage {
  id: string;
  partId: string;
  filename: string;
  url: string;
  order: number;
  isCover: boolean;
  createdAt: string;
}

export interface Compatibility {
  id: string;
  partId: string;
  brand: string;
  series?: string | null;
  model?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  engineCode?: string | null;
  vinRange?: string | null;
  tecdocId?: string | null;
  notes?: string | null;
}

export interface Part {
  id: string;
  name: string;
  oemNumber?: string | null;
  catalogNumber?: string | null;
  ean?: string | null;
  category: string;
  subcategory?: string | null;
  condition: PartCondition;
  priceNet: number;
  priceBrutto: number;
  vatRate: number;
  stock: number;
  stockMin: number;
  isActive: boolean;
  externalId?: string | null;
  externalSource?: string | null;
  descriptionShort?: string | null;
  descriptionLong?: string | null;
  technicalParams?: string | null;
  images: PartImage[];
  compatibility?: Compatibility[];
  listings?: Listing[];
  _count?: { listings: number; compatibility: number };
  createdAt: string;
  updatedAt: string;
}

export interface PartStats {
  total: number;
  active: number;
  inactive: number;
  byCategory: { category: string; count: number }[];
}

export interface Template {
  id: string;
  name: string;
  description?: string | null;
  portal: Portal;
  isDefault: boolean;
  isActive: boolean;
  fieldMapping: string;
  portalConfig: string;
  portalCategoryId?: string | null;
  portalCategoryName?: string | null;
  _count?: { listings: number };
  createdAt: string;
  updatedAt: string;
}

export interface Listing {
  id: string;
  partId: string;
  templateId: string;
  portal: Portal;
  status: ListingStatus;
  externalId?: string | null;
  externalUrl?: string | null;
  errorMessage?: string | null;
  listedAt?: string | null;
  expiresAt?: string | null;
  part?: Pick<Part, 'id' | 'name' | 'oemNumber'>;
  template?: Pick<Template, 'id' | 'name' | 'portal'>;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const PART_CATEGORIES = [
  { value: 'hamulce', label: 'Hamulce' },
  { value: 'silnik', label: 'Silnik' },
  { value: 'skrzynia', label: 'Skrzynia biegów' },
  { value: 'zawieszenie', label: 'Zawieszenie' },
  { value: 'elektryka', label: 'Elektryka' },
  { value: 'nadwozie', label: 'Nadwozie' },
  { value: 'uklad_kierowniczy', label: 'Układ kierowniczy' },
  { value: 'uklad_wydechowy', label: 'Układ wydechowy' },
  { value: 'klimatyzacja', label: 'Klimatyzacja' },
  { value: 'oswietlenie', label: 'Oświetlenie' },
  { value: 'filtry', label: 'Filtry' },
  { value: 'pasy_i_napedy', label: 'Pasy i napędy' },
  { value: 'inne', label: 'Inne' },
] as const;

export const TRUCK_BRANDS = [
  'MAN', 'Scania', 'Volvo', 'DAF', 'Mercedes-Benz', 'Iveco',
  'Renault Trucks', 'TATRA', 'Other',
];

export const CONDITION_LABELS: Record<PartCondition, string> = {
  NEW: 'Nowa',
  REGENERATED: 'Regenerowana',
  USED: 'Używana',
};

export const PORTAL_COLORS: Record<Portal, string> = {
  ALLEGRO: 'bg-orange-500/20 text-orange-400 border-orange-800/50',
  OTOMOTO: 'bg-blue-500/20 text-blue-400 border-blue-800/50',
  AUTOLINE: 'bg-green-500/20 text-green-400 border-green-800/50',
};

export const STATUS_COLORS: Record<ListingStatus, string> = {
  DRAFT: 'bg-slate-700 text-slate-300',
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  PROCESSING: 'bg-blue-500/20 text-blue-400',
  ACTIVE: 'bg-green-500/20 text-green-400',
  EXPIRED: 'bg-slate-600 text-slate-400',
  ENDED: 'bg-slate-600 text-slate-400',
  ERROR: 'bg-red-500/20 text-red-400',
};
