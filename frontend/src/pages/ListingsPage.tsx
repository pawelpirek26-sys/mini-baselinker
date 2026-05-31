import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import type { Listing, Portal, ListingStatus, PaginatedResponse } from '../types';
import { PORTAL_COLORS, STATUS_COLORS, STATUS_LABELS } from '../types';
import clsx from 'clsx';

const STATUSES: ListingStatus[] = ['DRAFT', 'PENDING', 'PROCESSING', 'ACTIVE', 'EXPIRED', 'ENDED', 'ERROR'];
const LIMIT = 30;

export default function ListingsPage() {
  const [portal, setPortal] = useState<Portal | ''>('');
  const [status, setStatus] = useState<ListingStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<PaginatedResponse<Listing>>({
    queryKey: ['listings', portal, status, page],
    queryFn: () => api.get('/listings', {
      params: {
        ...(portal && { portal }),
        ...(status && { status }),
        page,
        limit: LIMIT,
      },
    }).then((r) => r.data),
  });

  const listings = data?.items ?? [];
  const pagination = data?.pagination;

  function setFilter(newStatus: ListingStatus | '') {
    setStatus(newStatus);
    setPage(1);
  }

  function setPortalFilter(p: Portal | '') {
    setPortal(p);
    setPage(1);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Wystawienia</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pagination?.total ?? 0} wystawień łącznie
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary">
          <RefreshCw size={14} /> Odśwież
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={portal} onChange={(e) => setPortalFilter(e.target.value as Portal | '')} className="input w-40">
          <option value="">Wszystkie portale</option>
          {['ALLEGRO', 'OTOMOTO', 'AUTOLINE'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={status} onChange={(e) => setFilter(e.target.value as ListingStatus | '')} className="input w-44">
          <option value="">Wszystkie statusy</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {/* Status quick-filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          if (status && status !== s) return null;
          return (
            <button
              key={s}
              onClick={() => setFilter(status === s ? '' : s)}
              className={clsx(
                'badge border cursor-pointer transition-opacity',
                STATUS_COLORS[s],
                status && status !== s && 'opacity-40',
              )}
            >
              {STATUS_LABELS[s]}
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
            {!isLoading && !listings.length && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                Brak wystawień.{' '}
                <Link to="/parts" className="text-brand-400 hover:text-brand-300">
                  Przejdź do części →
                </Link>
              </td></tr>
            )}
            {listings.map((l) => (
              <tr key={l.id} className="hover:bg-slate-900/40 transition-colors">
                <td className="px-5 py-3">
                  <Link to={`/parts/${l.partId}`} className="font-medium text-slate-200 hover:text-brand-400 transition-colors text-sm">
                    {l.part?.name ?? l.partId}
                  </Link>
                  {l.part?.oemNumber && (
                    <div className="text-xs text-slate-500 font-mono">{l.part.oemNumber}</div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className={`badge border ${PORTAL_COLORS[l.portal]}`}>{l.portal}</span>
                </td>
                <td className="px-3 py-3 text-xs text-slate-400">{l.template?.name ?? '–'}</td>
                <td className="px-3 py-3">
                  <span className={`badge ${STATUS_COLORS[l.status]}`}>{STATUS_LABELS[l.status]}</span>
                  {l.errorMessage && (
                    <details className="mt-1">
                      <summary className="text-xs text-red-400 cursor-pointer hover:text-red-300 transition-colors">
                        Pokaż błąd
                      </summary>
                      <p className="text-xs text-red-400/80 mt-1 max-w-xs break-words leading-relaxed">
                        {l.errorMessage}
                      </p>
                    </details>
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
                  {new Date(l.updatedAt).toLocaleString('pl-PL', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {(pagination?.totalPages ?? 0) > 1 && (
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Strona {pagination?.page} z {pagination?.totalPages}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1} className="btn-secondary py-1 px-2">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= (pagination?.totalPages ?? 1)} className="btn-secondary py-1 px-2">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
