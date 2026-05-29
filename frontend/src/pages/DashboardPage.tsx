import { Package, FileText, Megaphone, AlertCircle, CheckCircle2, Zap, ShoppingCart, Car, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useParts } from '../hooks/useParts';
import { useTemplates } from '../hooks/useTemplates';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Listing } from '../types';
import { STATUS_COLORS, PORTAL_COLORS } from '../types';
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

export default function DashboardPage() {
  const { data: parts } = useParts({ limit: 5, sortBy: 'createdAt', sortDir: 'desc' });
  const { data: templates } = useTemplates();
  const { data: listings } = useQuery<Listing[]>({
    queryKey: ['listings-recent'],
    queryFn: () => api.get('/listings').then((r) => r.data),
  });

  const activeListings = listings?.filter((l) => l.status === 'ACTIVE').length ?? 0;
  const errorListings = listings?.filter((l) => l.status === 'ERROR').length ?? 0;

  const stats = [
    { label: 'Części w bazie', value: parts?.pagination.total ?? '–', icon: Package, color: 'text-brand-400' },
    { label: 'Szablony', value: templates?.length ?? '–', icon: FileText, color: 'text-purple-400' },
    { label: 'Aktywne wystawienia', value: activeListings, icon: CheckCircle2, color: 'text-green-400' },
    { label: 'Błędy wystawień', value: errorListings, icon: AlertCircle, color: 'text-red-400' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Przegląd systemu zarządzania częściami</p>
      </div>

      {/* Portal Status Strip */}
      <PortalStatusStrip />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <div className="text-3xl font-bold text-white font-mono">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ostatnie części */}
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Package size={14} className="text-brand-400" /> Ostatnie części
            </h2>
            <a href="/parts" className="text-xs text-brand-400 hover:text-brand-300">Zobacz wszystkie →</a>
          </div>
          <div className="divide-y divide-slate-800">
            {parts?.items.map((part) => (
              <a key={part.id} href={`/parts/${part.id}`}
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
                <div className="text-sm font-medium text-white">{part.priceBrutto.toFixed(2)} zł</div>
              </a>
            ))}
            {!parts?.items.length && (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Brak części. <a href="/parts/new" className="text-brand-400">Dodaj pierwszą →</a>
              </div>
            )}
          </div>
        </div>

        {/* Wystawienia */}
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Megaphone size={14} className="text-brand-400" /> Ostatnie wystawienia
            </h2>
            <a href="/listings" className="text-xs text-brand-400 hover:text-brand-300">Zobacz wszystkie →</a>
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
    </div>
  );
}
