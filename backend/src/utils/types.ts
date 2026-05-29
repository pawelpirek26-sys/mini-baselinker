// Lokalne typy zastępujące @prisma/client gdy klient nie jest jeszcze wygenerowany

export interface PartImage {
  id: string;
  partId: string;
  filename: string;
  url: string;
  order: number;
  isCover: boolean;
  createdAt: Date;
}

export interface Compatibility {
  id: string;
  partId: string;
  brand: string;
  series: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  engineCode: string | null;
  vinRange: string | null;
  tecdocId: string | null;
  notes: string | null;
}

export interface Part {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  oemNumber: string | null;
  catalogNumber: string | null;
  ean: string | null;
  category: string;
  subcategory: string | null;
  condition: 'NEW' | 'REGENERATED' | 'USED';
  priceNet: number;
  priceBrutto: number;
  vatRate: number;
  stock: number;
  stockMin: number;
  descriptionShort: string | null;
  descriptionLong: string | null;
  technicalParams: string | null;
  userId: string;
}

export interface Template {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  description: string | null;
  portal: 'ALLEGRO' | 'OTOMOTO' | 'AUTOLINE';
  isDefault: boolean;
  isActive: boolean;
  fieldMapping: string;
  portalConfig: string;
  portalCategoryId: string | null;
  portalCategoryName: string | null;
  userId: string;
}

export interface Listing {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  partId: string;
  templateId: string;
  userId: string;
  portal: 'ALLEGRO' | 'OTOMOTO' | 'AUTOLINE';
  status: 'PENDING' | 'PROCESSING' | 'ACTIVE' | 'EXPIRED' | 'ENDED' | 'ERROR' | 'DRAFT';
  externalId: string | null;
  externalUrl: string | null;
  externalData: string | null;
  errorMessage: string | null;
  errorDetails: string | null;
  listedAt: Date | null;
  expiresAt: Date | null;
}
