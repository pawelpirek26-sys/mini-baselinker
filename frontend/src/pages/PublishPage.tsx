import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, CheckCircle2, XCircle, Loader2, Clock,
  ExternalLink, RotateCcw, Package, ChevronRight,
  AlertTriangle, ShoppingCart, Car, Globe, Search,
  FileDown
} from 'lucide-react';
import { useParts } from '../hooks/useParts';
import {
  usePublishJob,
  usePublishStatus,
  type Portal,
  type PortalState,
  type PortalStatus,
} from '../hooks/usePublishJob';
import clsx from 'clsx';

// ── Stałe portali ─────────────────────────────
const PORTAL_META: Record<Portal, {
  label:     string;
  icon:      React.ReactNode;
  color:     string;
  bgColor:   string;
  borderColor: string;
}> = {
  ALLEGRO: {
    label:       'Allegro',
    icon:        <ShoppingCart size={18} />,
    color:       'text-orange-400',
    bgColor:     'bg-orange-500/10',
    borderColor: 'border-orange-800/40',
  },
  OTOMOTO: {
    label:       'Otomoto',
    icon:        <Car size={18} />,
    color:       'text-blue-400',
    bgColor:     'bg-blue-500/10',
    borderColor: 'border-blue-800/40',
  },
  AUTOLINE: {
    label:       'Autoline',
    icon:        <Globe size={18} />,
    color:       'text-green-400',
    bgColor:     'bg-green-500/10',
    borderColor: 'border-green-800/40',
  },
};

const STATUS_META: Record<PortalStatus, {
  label:  string;
  icon:   React.ReactNode;
  class:  string;
}> = {
  idle:    { label: 'Oczekuje',    icon: <Clock size={14} />,       class: 'text-slate-500' },
  pending: { label: 'W kolejce',   icon: <Clock size={14} />,       class: 'text-slate-400' },
  running: { label: 'Wystawianie…',icon: <Loader2 size={14} className="animate-spin" />, class: 'text-brand-400' },
  done:    { label: 'Wystawione',  icon: <CheckCircle2 size={14} />,class: 'text-green-400' },
  error:   { label: 'Błąd',        icon: <XCircle size={14} />,     class: 'text-red-400'   },
  skipped: { label: 'Pominięte',   icon: <AlertTriangle size={14} />,class: 'text-amber-400' },
};

// ── Portal Card ────────────────────────────────
function PortalCard({ portalState, isConnected }: {
  portalState: PortalState;
  isConnected: boolean;
}) {
  const meta   = PORTAL_META[portalState.portal];
  const status = STATUS_META[portalState.status];

  return (
    <div className={clsx(
      'rounded-xl border p-5 transition-all duration-300',
      meta.bgColor, meta.borderColor,
      portalState.status === 'running' && 'ring-2 ring-brand-500/30',
      portalState.status === 'done'    && 'ring-1 ring-green-500/20',
      portalState.status === 'error'   && 'ring-1 ring-red-500/20',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className={meta.color}>{meta.icon}</span>
          <span className="font-semibold text-white text-sm">{meta.label}</span>
          {!isConnected && (
            <span className="badge bg-slate-700 text-slate-500 text-xs">niepołączony</span>
          )}
        </div>
        <span className={clsx('flex items-center gap-1.5 text-xs font-medium', status.class)}>
          {status.icon}
          {status.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-slate-800 mb-4 overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-700',
            portalState.status === 'running' && 'w-2/3 bg-brand-500 animate-pulse',
            portalState.status === 'done'    && 'w-full bg-green-500',
            portalState.status === 'error'   && 'w-full bg-red-500',
            portalState.status === 'skipped' && 'w-full bg-amber-500/50',
            (portalState.status === 'idle' || portalState.status === 'pending') && 'w-0',
          )}
        />
      </div>

      {/* Result */}
      {portalState.status === 'done' && (
        <div className="space-y-1">
          {portalState.externalUrl ? (
            <a
              href={portalState.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              <ExternalLink size={11} />
              Zobacz ogłoszenie
            </a>
          ) : (
            <span className="text-xs text-green-400/70">Oznaczono jako wyeksportowane</span>
          )}
          {portalState.externalId && (
            <div className="text-xs text-slate-600 font-mono">
              ID: {portalState.externalId}
            </div>
          )}
        </div>
      )}

      {(portalState.status === 'error' || portalState.status === 'skipped') && portalState.error && (
        <div className={clsx(
          'text-xs rounded-lg p-2 leading-relaxed',
          portalState.status === 'error'
            ? 'bg-red-900/20 text-red-400'
            : 'bg-amber-900/20 text-amber-400',
        )}>
          {portalState.error}
          {portalState.status === 'skipped' && (
            <Link to="/templates" className="block mt-1 text-brand-400 hover:text-brand-300">
              Dodaj szablon →
            </Link>
          )}
        </div>
      )}

      {(portalState.status === 'idle' || portalState.status === 'pending') && (
        <div className="text-xs text-slate-600">
          {isConnected ? 'Gotowy do wystawienia' : (
            <Link to="/settings" className="text-brand-400 hover:text-brand-300">
              Skonfiguruj połączenie →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Progress Summary ───────────────────────────
function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Postęp</span>
        <span className="font-mono">{done}/{total}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Główna strona ─────────────────────────────
export default function PublishPage() {
  const { state, startJob, reset } = usePublishJob();
  const { data: publishStatus }    = usePublishStatus();
  const [search,   setSearch]      = useState('');
  const [selectedPart, setSelectedPart] = useState<{ id: string; name: string; oemNumber?: string | null } | null>(null);
  const [selectedPortals, setSelectedPortals] = useState<Portal[]>(['ALLEGRO', 'OTOMOTO', 'AUTOLINE']);

  const { data: parts } = useParts({
    search: search || undefined,
    limit: 10,
    sortBy: 'name', sortDir: 'asc',
  });

  const portals = (Object.keys(PORTAL_META) as Portal[]);
  const isRunning = state.status === 'running';
  const isDone    = state.status === 'done';

  function togglePortal(p: Portal) {
    setSelectedPortals((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function handlePublish() {
    if (!selectedPart || !selectedPortals.length) return;
    await startJob(selectedPart.id, selectedPortals);
  }

  const resultCounts = {
    ok:      state.portals.filter((p) => p.status === 'done').length,
    error:   state.portals.filter((p) => p.status === 'error').length,
    skipped: state.portals.filter((p) => p.status === 'skipped').length,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <Zap size={22} className="text-brand-400" />
          Publikuj na wszystkich portalach
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Wystaw część jednocześnie na Allegro, Otomoto i Autoline jednym kliknięciem
        </p>
      </div>

      {/* Portal status pills */}
      <div className="flex gap-3 flex-wrap">
        {portals.map((p) => {
          const meta    = PORTAL_META[p];
          const pStatus = publishStatus?.portals[p];
          return (
            <div
              key={p}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium',
                meta.bgColor, meta.borderColor,
              )}
            >
              <span className={meta.color}>{meta.icon}</span>
              <span className="text-slate-300">{meta.label}</span>
              <span className={clsx(
                'w-1.5 h-1.5 rounded-full',
                pStatus?.connected ? 'bg-green-400' : 'bg-slate-600',
              )} />
              {pStatus?.stats.ACTIVE !== undefined && (
                <span className="text-slate-500">{pStatus.stats.ACTIVE} aktywnych</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* ── Lewy panel: wybór części + portali ── */}
        <div className="col-span-2 space-y-4">
          {/* Wybór części */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Package size={14} className="text-brand-400" />
              Wybierz część
            </h3>

            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szukaj nazwy lub OEM..."
                className="input pl-8 text-sm"
                disabled={isRunning}
              />
            </div>

            {/* Lista wyników */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {parts?.items.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPart({ id: p.id, name: p.name, oemNumber: p.oemNumber })}
                  disabled={isRunning}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                    selectedPart?.id === p.id
                      ? 'bg-brand-600/20 border border-brand-700/50 text-brand-300'
                      : 'hover:bg-slate-800 text-slate-300 border border-transparent',
                  )}
                >
                  <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center shrink-0">
                    {p.images[0]
                      ? <img src={p.images[0].url} alt="" className="w-7 h-7 rounded object-cover" />
                      : <Package size={11} className="text-slate-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    {p.oemNumber && (
                      <div className="text-xs text-slate-500 font-mono truncate">{p.oemNumber}</div>
                    )}
                  </div>
                  {selectedPart?.id === p.id && <ChevronRight size={12} className="text-brand-400 shrink-0" />}
                </button>
              ))}
              {!parts?.items.length && search && (
                <p className="text-xs text-slate-500 text-center py-3">Brak wyników dla „{search}"</p>
              )}
            </div>

            {selectedPart && (
              <div className="bg-brand-600/10 border border-brand-700/40 rounded-lg p-2.5 text-xs">
                <span className="text-brand-400 font-medium">Wybrano:</span>{' '}
                <span className="text-slate-300">{selectedPart.name}</span>
              </div>
            )}
          </div>

          {/* Wybór portali */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Portale</h3>
            {portals.map((p) => {
              const meta    = PORTAL_META[p];
              const checked = selectedPortals.includes(p);
              const connected = publishStatus?.portals[p]?.connected ?? p === 'AUTOLINE';
              return (
                <label
                  key={p}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all',
                    checked
                      ? `${meta.bgColor} ${meta.borderColor}`
                      : 'border-slate-800 hover:border-slate-700',
                    isRunning && 'pointer-events-none opacity-60',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePortal(p)}
                    className="accent-brand-500 w-4 h-4"
                  />
                  <span className={clsx(meta.color, 'shrink-0')}>{meta.icon}</span>
                  <span className="text-sm text-slate-200 flex-1">{meta.label}</span>
                  {p === 'AUTOLINE' && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <FileDown size={10} /> Plik
                    </span>
                  )}
                  {p !== 'AUTOLINE' && (
                    <span className={clsx(
                      'text-xs',
                      connected ? 'text-green-400' : 'text-slate-600',
                    )}>
                      {connected ? '●' : '○'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {/* Przycisk główny */}
          <div className="space-y-2">
            {!isRunning && !isDone && (
              <button
                onClick={handlePublish}
                disabled={!selectedPart || !selectedPortals.length || isRunning}
                className={clsx(
                  'w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold',
                  'text-white transition-all text-sm',
                  selectedPart && selectedPortals.length
                    ? 'bg-brand-600 hover:bg-brand-500 shadow-lg shadow-brand-600/20'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed',
                )}
              >
                <Zap size={16} />
                Wystaw na {selectedPortals.length} {selectedPortals.length === 1 ? 'portal' : selectedPortals.length < 5 ? 'portale' : 'portali'}
              </button>
            )}

            {isRunning && (
              <button disabled className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-brand-600/40 text-brand-400 text-sm font-semibold cursor-not-allowed">
                <Loader2 size={16} className="animate-spin" />
                Wystawianie w toku…
              </button>
            )}

            {isDone && (
              <div className="space-y-2">
                <div className={clsx(
                  'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold',
                  resultCounts.error > 0
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-800/40'
                    : 'bg-green-500/15 text-green-400 border border-green-800/40',
                )}>
                  {resultCounts.error > 0
                    ? <><AlertTriangle size={16} /> {resultCounts.ok} wystawiono, {resultCounts.error} błędów</>
                    : <><CheckCircle2 size={16} /> Gotowe! {resultCounts.ok} portali</>}
                </div>
                <button
                  onClick={reset}
                  className="w-full btn-secondary justify-center text-sm py-2"
                >
                  <RotateCcw size={14} /> Wystawiaj kolejną część
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Prawy panel: live status portali ── */}
        <div className="col-span-3 space-y-4">
          {/* Progress bar gdy job aktywny */}
          {(isRunning || isDone) && state.progress.total > 0 && (
            <ProgressBar done={state.progress.done} total={state.progress.total} />
          )}

          {/* Portal cards */}
          <div className="space-y-3">
            {portals.map((p) => {
              const portalState = state.portals.find((ps) => ps.portal === p) ?? {
                portal: p, status: 'idle' as const,
              };
              const connected = publishStatus?.portals[p]?.connected ?? p === 'AUTOLINE';
              const isSelected = selectedPortals.includes(p);

              return (
                <div key={p} className={clsx(!isSelected && state.status === 'idle' && 'opacity-40')}>
                  <PortalCard portalState={portalState} isConnected={connected} />
                </div>
              );
            })}
          </div>

          {/* Idle state — wskazówki */}
          {state.status === 'idle' && (
            <div className="card p-4 border-dashed">
              <h3 className="text-sm font-semibold text-slate-400 mb-3">Jak to działa?</h3>
              <div className="space-y-2.5">
                {[
                  ['1', 'Wybierz część z bazy po lewej stronie'],
                  ['2', 'Zaznacz portale na których chcesz wystawić'],
                  ['3', 'Kliknij „Wystaw" — śledź postęp na żywo'],
                  ['4', 'Kliknij link do ogłoszenia gdy status zmieni się na Wystawione'],
                ].map(([num, text]) => (
                  <div key={num} className="flex items-center gap-3 text-sm text-slate-500">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-mono shrink-0">
                      {num}
                    </span>
                    {text}
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse shrink-0" />
                Status aktualizuje się w czasie rzeczywistym przez SSE (Server-Sent Events)
              </div>
            </div>
          )}

          {/* Historia ostatnich wystawień dla wybranej części */}
          {selectedPart && isDone && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Wyniki</h3>
                <span className="text-xs text-slate-500">
                  {state.doneAt && new Date(state.doneAt).toLocaleTimeString('pl')}
                </span>
              </div>
              <div className="space-y-2">
                {state.portals.map((ps) => {
                  const meta = PORTAL_META[ps.portal];
                  return (
                    <div key={ps.portal} className="flex items-center gap-3 text-sm">
                      <span className={meta.color}>{meta.icon}</span>
                      <span className="text-slate-300 w-20">{meta.label}</span>
                      <span className={STATUS_META[ps.status].class}>
                        {STATUS_META[ps.status].label}
                      </span>
                      {ps.externalUrl && (
                        <a
                          href={ps.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                        >
                          <ExternalLink size={11} /> Otwórz
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
              <Link
                to={`/parts/${selectedPart.id}`}
                className="mt-3 flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                <ChevronRight size={12} /> Przejdź do szczegółów części
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
