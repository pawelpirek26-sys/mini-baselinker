# 🚛 Mini Baselinker – Zarządzanie częściami ciężarowymi

Minimalne MVP do centralnego zarządzania częściami zamiennymi do pojazdów ciężarowych i masowego wystawiania na **Allegro**, **Otomoto** i **Autoline**.

---

## Stack technologiczny

| Warstwa | Technologie |
|---------|-------------|
| **Backend** | Node.js 20 + TypeScript + Express + Prisma ORM |
| **Baza danych** | SQLite (dev) → PostgreSQL (produkcja) |
| **Frontend** | React 18 + TypeScript + Vite + TailwindCSS |
| **State/Query** | Zustand (auth) + TanStack React Query |
| **Walidacja** | Zod (backend + frontend) + React Hook Form |
| **Pliki** | Multer (upload zdjęć) |
| **Auth** | JWT (Bearer token) |

---

## Struktura projektu

```
mini-baselinker/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        ← Schemat bazy danych
│   ├── src/
│   │   ├── index.ts             ← Entry point Express
│   │   ├── routes/
│   │   │   ├── auth.ts          ← POST /login, /register, GET /me
│   │   │   ├── parts.ts         ← CRUD części
│   │   │   ├── templates.ts     ← CRUD szablonów
│   │   │   ├── listings.ts      ← Wystawienia + bulk
│   │   │   ├── images.ts        ← Upload/usuń zdjęcia
│   │   │   └── compatibility.ts ← Kompatybilność pojazdów
│   │   ├── middleware/
│   │   │   ├── auth.ts          ← JWT middleware
│   │   │   └── errorHandler.ts  ← Globalny error handler
│   │   └── utils/
│   │       ├── prisma.ts        ← Singleton klient Prisma
│   │       ├── schemas.ts       ← Zod schemas
│   │       └── seed.ts          ← Dane demo
│   ├── uploads/                 ← Wgrane zdjęcia
│   ├── .env                     ← Konfiguracja (skopiuj z .env.example)
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    └── src/
        ├── App.tsx              ← Router + QueryClient
        ├── main.tsx
        ├── assets/globals.css   ← Tailwind + custom classes
        ├── lib/api.ts           ← Axios + Zustand auth store
        ├── types/index.ts       ← TypeScript types + stałe
        ├── hooks/
        │   ├── useParts.ts      ← React Query hooks dla części
        │   └── useTemplates.ts  ← React Query hooks dla szablonów
        ├── components/
        │   └── ui/
        │       └── Layout.tsx   ← Sidebar + nawigacja
        └── pages/
            ├── LoginPage.tsx
            ├── DashboardPage.tsx
            ├── PartsPage.tsx        ← Lista z filtrowaniem
            ├── PartFormPage.tsx     ← Formularz dodaj/edytuj
            ├── PartDetailPage.tsx   ← Szczegóły + zdjęcia + kompatybilność + wystawienia
            ├── TemplatesPage.tsx
            └── ListingsPage.tsx
```

---

## Schemat bazy danych

```
User ──────────────────────────────┐
 │                                  │
 ├─< Part                          │
 │    ├─< PartImage                 │
 │    ├─< Compatibility             │
 │    └─< Listing >─── Template ──<┤
 │                └─< ListingHistory│
 │                                  │
 └─< Template                      │
                                    │
PortalCredential (ALLEGRO/OTOMOTO/AUTOLINE)
```

### Kluczowe modele

- **Part** – część: OEM, kategoria, stan, ceny, opis techniczny, params JSON
- **Compatibility** – pojazdy kompatybilne: marka, seria, model, lata, TecDoc ID
- **Template** – szablon per portal: mapowanie pól JSON + konfiguracja portalu JSON
- **Listing** – powiązanie Part×Template ze statusem i historią
- **PortalCredential** – tokeny OAuth/API dla każdego portalu

---

## Szybki start

### Wymagania

- Node.js ≥ 20
- npm ≥ 9

### 1. Instalacja + inicjalizacja bazy + dane demo

```bash
# Sklonuj/wypakuj projekt
cd mini-baselinker

# Zainstaluj zależności obu projektów, utwórz bazę SQLite i wgraj dane demo
npm run setup
```

### 2. Uruchomienie (dev)

```bash
# Backend (port 4000) + Frontend (port 5173) równolegle
npm run dev
```

Otwórz: **http://localhost:5173**

**Dane demo:**
- Email: `demo@minibaselinker.pl`
- Hasło: `demo1234`

### 3. Prisma Studio (opcjonalnie)

```bash
npm run db:studio
```

---

## API – przegląd endpointów

Wszystkie endpointy (poza `/auth`) wymagają nagłówka:
```
Authorization: Bearer <token>
```

### Autoryzacja
| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/api/auth/register` | Rejestracja |
| POST | `/api/auth/login` | Logowanie → zwraca token |
| GET | `/api/auth/me` | Dane zalogowanego użytkownika |

### Części
| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/parts` | Lista z filtrowaniem i paginacją |
| GET | `/api/parts/:id` | Szczegóły (z zdjęciami, kompatybilnością, wystawieniami) |
| POST | `/api/parts` | Utwórz część |
| PATCH | `/api/parts/:id` | Aktualizuj część (częściowa) |
| DELETE | `/api/parts/:id` | Usuń część |

### Szablony
| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/templates?portal=ALLEGRO` | Lista szablonów |
| POST | `/api/templates` | Utwórz szablon |
| PATCH | `/api/templates/:id` | Aktualizuj |
| DELETE | `/api/templates/:id` | Usuń (blokada jeśli są wystawienia) |

### Wystawienia
| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/listings?portal=&status=` | Lista wystawień |
| POST | `/api/listings` | Utwórz wystawienie (DRAFT) |
| POST | `/api/listings/bulk` | **Wystaw na wiele portali jednym żądaniem** |
| PATCH | `/api/listings/:id/status` | Zmień status (+ dodaje do historii) |
| DELETE | `/api/listings/:id` | Usuń wystawienie |

### Zdjęcia
| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/api/images/upload/:partId` | Upload (multipart, max 20 plików) |
| PATCH | `/api/images/reorder` | Zmień kolejność |
| DELETE | `/api/images/:id` | Usuń zdjęcie |

### Kompatybilność
| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/compatibility/:partId` | Lista pojazdów |
| POST | `/api/compatibility/:partId` | Dodaj pojazd |
| POST | `/api/compatibility/:partId/bulk` | Dodaj wiele naraz |
| PATCH | `/api/compatibility/:id` | Edytuj |
| DELETE | `/api/compatibility/:id` | Usuń |

---

## Mapowanie szablonów

Pole `fieldMapping` w szablonie to JSON z regułami mapowania:

```json
{
  "title":       "{{name}} OEM:{{oemNumber}} – {{condition}}",
  "description": "{{descriptionLong}}",
  "price":       "priceBrutto",
  "quantity":    "stock",
  "ean":         "ean"
}
```

- `{{pole}}` → interpolacja wartości z Part
- `"pole"` → bezpośrednia referencja do pola Part

Pole `portalConfig` to ustawienia specyficzne dla portalu:

```json
{
  "categoryId":      "257517",
  "deliveryOptions": ["INPOST", "DPD"],
  "duration":        30,
  "location":        "Warszawa"
}
```

---

## Roadmap – następne kroki

### Etap 2 – Integracja Allegro
- [ ] OAuth 2.0 (PKCE) – logowanie przez konto Allegro
- [ ] Oferty REST API – tworzenie/aktualizacja ofert
- [ ] Compatibility List + TecDoc integration
- [ ] Kategorie i atrybuty Allegro

### Etap 3 – Integracja Otomoto
- [ ] API dla kont biznesowych
- [ ] Mapowanie kategorii ogłoszeń
- [ ] Synchronizacja statusów

### Etap 4 – Autoline
- [ ] Generator pliku CSV/XML importu
- [ ] Pobieranie/aktualizacja stanów

### Etap 5 – Funkcja „Wystaw na wszystkie portale"
- [ ] Jeden klik → wystawienie na wszystkich skonfigurowanych portalach
- [ ] Dashboard statusów w czasie rzeczywistym (WebSocket lub polling)
- [ ] Automatyczne odnawianie wygasłych ogłoszeń

### Etap 6 – Zaawansowane
- [ ] Edytor mapowania szablonów (visual field mapper)
- [ ] Bulk import części z CSV/Excel
- [ ] Powiadomienia email/webhook o zmianach statusów
- [ ] Raporty sprzedaży z portali
- [ ] Multi-tenant (wiele kont/firm)

---

## Zmienne środowiskowe (backend/.env)

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="super-secret-change-in-production-min32chars!!"
JWT_EXPIRES_IN="7d"
PORT=4000
FRONTEND_URL="http://localhost:5173"
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=10485760   # 10 MB
```

---

## Produkcja – migracja na PostgreSQL

1. Zmień `provider` w `schema.prisma` z `sqlite` na `postgresql`
2. Zaktualizuj `DATABASE_URL` na connection string PostgreSQL
3. Uruchom `npm run db:migrate`

---

*Projekt zbudowany jako MVP – gotowy do iteracyjnego rozbudowywania o integracje z portalami.*
