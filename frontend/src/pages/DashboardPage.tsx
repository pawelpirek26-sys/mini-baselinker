import { Package, FileText, Megaphone, AlertCircle, CheckCircle2, Zap,
         ShoppingCart, Car, Globe, RefreshCw, TrendingUp, XCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useParts, usePartStats } from '../hooks/useParts';
import { useTemplates } from '../hooks/useTemplates';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSyncStatus } from '../hooks/useSync';
import type { Listing } from '../types';
import { STATUS_COLORS, PORTAL_COLORS, PART_CATEGORIES } from '../types';
import { usePublishStatus } from '../hooks/usePublishJob';
import clsx from 'clsx';

function PortalStatusStrip() {
  const { data: status } = usePublishStatus();
  const portals = [
    { key: 'ALLEGRO' as const, label: 'Allegro', icon: <ShoppingCart size={13} />, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-800/40' },
    { key: 'OTOMOTO' as const, label: 'Otomoto', icon: <Car size={13} />,          color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-800/40' },
    { key: 'AUTOLINE' as const, label: 'Autoline', icon: <Globe size={13} />,      color: 'text-green-400',  bg: 'bg-green-500/10 border-green-800/40' },
  ];
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex gap-2 flex-wrap flex-1">
        {portals.map(({ key, label, icon, color, bg }) => {
          const ps = status?.portals[key];
          const active = ps?.stats.ACTIVE ?? 0;
          return (
            <div key={key} className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs', bg)}>
              <span className={color}>{icon}</span>
              <span className="text-slate-300 font-medium">{label}</span>
              <span className={clsx('w-1.5 h-1.5 rounded-full', ps?.connected || key === 'AUTOLINE' ? 'bg-green-400' : 'bg-slate-600')} />
              {active > 0 && <span className="text-slate-500">{active} aktywnych</span>}
            </div>
          );
        })}
      </div>
      <Link to="/publish" className="btn-primary py-1.5 shrink-0">
        <Zap size={13} /> Publikuj
      </Link>
    </div>
  );
}

function SyncWidget() {
  const { data: sync } = useSyncStatus();
  if (!sync) return null;

  const statusCfg = {
    RUNNING:  { icon: Loader2,      cls: 'text-blue-400',  label: 'W toku',    spin: true  },
    SUCCESS:  { icon: CheckCircle2, cls: 'text-green-400', label: 'Sukces',    spin: false },
    PARTIAL:  { icon: AlertCircle,  cls: 'text-amber-400', label: 'Częściowy', spin: false },
    ERROR:    { icon: XCircle,      cls: 'text-red-400',   label: 'Błąd',      spin: false },
  }[sync.status];
  const Icon = statusCfg.icon;

  return (
    <Link to="/sync" className="card p-4 hover:border-slate-700 transition-colors block">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 uppercase tracking-wide">Ostatnia synchronizacja</span>
        <RefreshCw size={14} className="text-slate-600" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={clsx(statusCfg.cls, statusCfg.spin && 'animate-spin')} />
        <span className={clsx('text-sm font-medium', statusCfg.cls)}>{statusCfg.label}</span>
        <span className="text-xs text-slate-500 ml-auto">
          {new Date(sync.createdAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {sync.status !== 'RUNNING' && (
        <div className="flex gap-3 text-xs">
          <span className="text-green-400">+{sync.created} nowe</span>
          <span className="text-blue-400">~{sync.updated} zaktualizowane</span>
          {sync.errors > 0 && <span className="text-red-400">!{sync.errors} błędów</span>}
        </div>
      )}
    </Link>
  );
}

function CategoryBar({ byCategory }: { byCategory: { category: string; count: number }[] }) {
  const total = byCategory.reduce((s, r) => s + r.count, 0);
  if (total === 0) return null;
  const catLabel = (val: string) => PART_CATEGORIES.find((c) => c.value === val)?.label ?? val;
  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
        <TrendingUp size={14} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Części wg kategorii</h2>
      </div>
      <div className="p-4 space-y-2">
        {byCategory.map(({ category, count }) => (
          <div key={category}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">{catLabel(category)}</span>
              <span className="text-slate-500 font-mono">{count.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full"
                style={{ width: `${Math.round((count / total) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: partStats } = usePartStats();
  const { data: parts } = useParts({ limit: 5, sortBy: 'createdAt', sortDir: 'desc' });
  const { data: templates } = useTemplates();
  const { data: listings } = useQuery<Listing[]>({
    queryKey: ['listings-recent'],
    queryFn: () => api.get('/listings').then((r) => r.data),
  });

  const activeListings = listings?.filter((l) => l.status === 'ACTIVE').length ?? 0;
  const errorListings  = listings?.filter((l) => l.status === 'ERROR').length  ?? 0;

  const stats = [
    { label: 'Wszystkie części',    value: partStats?.total      ?? '–', icon: Package,      color: 'text-brand-400',  to: '/parts' },
    { label: 'Aktywne części',      value: partStats?.active     ?? '–', icon: CheckCircle2, color: 'text-green-400',  to: '/parts?isActive=true' },
    { label: 'Nieaktywne części',   value: partStats?.inactive   ?? '–', icon: XCircle,      color: 'text-slate-500',  to: '/parts?isActive=false' },
    { label: 'Szablony',            value: templates?.length     ?? '–', icon: FileText,     color: 'text-purple-400', to: '/templates' },
    { label: 'Aktywne wystawienia', value: activeListings,               icon: Megaphone,    color: 'text-blue-400',   to: '/listings' },
    { label: 'Błędy wystawień',     value: errorListings,                icon: AlertCircle,  color: 'text-red-400',    to: '/listings' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Przegląd systemu zarządzania częściami</p>
      </div>

      <PortalStatusStrip />

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map(({ label, value, icon: Icon, color, to }) => (
          <Link key={label} to={to} className="card p-4 hover:border-slate-700 transition-colors block">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500 uppercase tracking-wide leading-tight">{label}</span>
              <Icon size={15} className={color} />
            </div>
            <div className="text-3xl font-bold text-white font-mono">{value}</div>
          </Link>
        ))}
      </div>

      {/* Sync widget */}
      <SyncWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ostatnie części */}
        <div className="card lg:col-span-2">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Package size={14} className="text-brand-400" /> Ostatnie części
            </h2>
            <Link to="/parts" className="text-xs text-brand-400 hover:text-brand-300">Zobacz wszystkie →</Link>
          </div>
          <div className="divide-y divide-slate-800">
            {parts?.items.map((part) => (
              <Link key={part.id} to={`/parts/${part.id}`}
                 className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/50 transition-colors">
                <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                  {part.images[0] ? (
                    <img src={part.images[0].url} alt="" className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <Package size={14} className="text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 truncate">{part.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{part.oemNumber ?? '–'}</div>
                </div>
                <div className="flex items-center gap-2">
                  {!part.isActive && (
                    <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">nieaktywna</span>
                  )}
                  <div className="text-sm font-medium text-white">{part.priceBrutto.toFixed(2)} zł</div>
                </div>
              </Link>
            ))}
            {!parts?.items.length && (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Brak części. <Link to="/parts/new" className="text-brand-400">Dodaj pierwszą →</Link>
              </div>
            )}
          </div>
        </div>

        {/* Category breakdown */}
        {partStats?.byCategory && partStats.byCategory.length > 0 && (
          <CategoryBar byCategory={partStats.byCategory} />
        )}
      </div>

      {/* Wystawienia */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Megaphone size={14} className="text-brand-400" /> Ostatnie wystawienia
          </h2>
          <Link to="/listings" className="text-xs text-brand-400 hover:text-brand-300">Zobacz wszystkie →</Link>
        </div>
        <div className="divide-y divide-slate-800">
          {listings?.slice(0, 6).map((listing) => (
            <div key={listing.id} className="flex items-center gap-3 px-5 py-3">
              <span className={`badge border ${PORTAL_COLORS[listing.portal]}`}>
                {listing.portal}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-300 truncate">{listing.part?.name ?? listing.partId}</div>
              </div>
              <span className={`badge ${STATUS_COLORS[listing.status]}`}>{listing.status}</span>
            </div>
          ))}
          {!listings?.length && (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              Brak wystawień. Przejdź do części i wystaw je na portale.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
