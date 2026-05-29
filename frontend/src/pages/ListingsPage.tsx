import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import type { Listing, Portal, ListingStatus } from '../types';
import { PORTAL_COLORS, STATUS_COLORS } from '../types';
import clsx from 'clsx';

const STATUSES: ListingStatus[] = ['DRAFT', 'PENDING', 'PROCESSING', 'ACTIVE', 'EXPIRED', 'ENDED', 'ERROR'];

export default function ListingsPage() {
  const [portal, setPortal] = useState<Portal | ''>('');
  const [status, setStatus] = useState<ListingStatus | ''>('');

  const { data: listings, isLoading, refetch } = useQuery<Listing[]>({
    queryKey: ['listings', portal, status],
    queryFn: () => api.get('/listings', {
      params: {
        ...(portal && { portal }),
        ...(status && { status }),
      },
    }).then((r) => r.data),
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Wystawienia</h1>
          <p className="text-sm text-slate-500 mt-0.5">{listings?.length ?? 0} wystawień łącznie</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary">
          <RefreshCw size={14} /> Odśwież
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={portal} onChange={(e) => setPortal(e.target.value as Portal | '')} className="input w-40">
          <option value="">Wszystkie portale</option>
          {['ALLEGRO', 'OTOMOTO', 'AUTOLINE'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as ListingStatus | '')} className="input w-44">
          <option value="">Wszystkie statusy</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const count = listings?.filter((l) => l.status === s).length ?? 0;
          if (!count) return null;
          return (
            <button key={s} onClick={() => setStatus(status === s ? '' : s)}
                    className={clsx('badge border cursor-pointer transition-opacity', STATUS_COLORS[s], status && status !== s && 'opacity-40')}>
              {s}: {count}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3">Część</th>
              <th className="text-left px-3 py-3">Portal</th>
              <th className="text-left px-3 py-3">Szablon</th>
              <th className="text-left px-3 py-3">Status</th>
              <th className="text-left px-3 py-3">ID ogłoszenia</th>
              <th className="text-left px-3 py-3">Link</th>
              <th className="text-right px-5 py-3">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {isLoading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">Ładowanie...</td></tr>
            )}
            {!isLoading && !listings?.length && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                Brak wystawień. Przejdź do szczegółów części i wystaw je na portale.
              </td></tr>
            )}
            {listings?.map((l) => (
              <tr key={l.id} className="hover:bg-slate-900/40 transition-colors">
                <td className="px-5 py-3">
                  <a href={`/parts/${l.partId}`} className="font-medium text-slate-200 hover:text-brand-400 transition-colors text-sm">
                    {l.part?.name ?? l.partId}
                  </a>
                  {l.part?.oemNumber && (
                    <div className="text-xs text-slate-500 font-mono">{l.part.oemNumber}</div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className={`badge border ${PORTAL_COLORS[l.portal]}`}>{l.portal}</span>
                </td>
                <td className="px-3 py-3 text-xs text-slate-400">{l.template?.name ?? '–'}</td>
                <td className="px-3 py-3">
                  <span className={`badge ${STATUS_COLORS[l.status]}`}>{l.status}</span>
                  {l.errorMessage && (
                    <div className="text-xs text-red-400 mt-1 max-w-xs truncate" title={l.errorMessage}>
                      {l.errorMessage}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-slate-500 font-mono">{l.externalId ?? '–'}</td>
                <td className="px-3 py-3">
                  {l.externalUrl ? (
                    <a href={l.externalUrl} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300">
                      <ExternalLink size={11} /> Otwórz
                    </a>
                  ) : '–'}
                </td>
                <td className="px-5 py-3 text-right text-xs text-slate-500 font-mono">
                  {new Date(l.updatedAt).toLocaleDateString('pl')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
