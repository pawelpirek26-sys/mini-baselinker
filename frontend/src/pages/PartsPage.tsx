import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Filter, Package, Edit2, Trash2,
  ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import { useParts, useDeletePart } from '../hooks/useParts';
import { PART_CATEGORIES, CONDITION_LABELS, type PartCondition } from '../types';
import clsx from 'clsx';

const CONDITION_BADGE: Record<PartCondition, string> = {
  NEW: 'bg-green-500/15 text-green-400',
  REGENERATED: 'bg-yellow-500/15 text-yellow-400',
  USED: 'bg-slate-700 text-slate-400',
};

export default function PartsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [page, setPage] = useState(1);
  const deletePart = useDeletePart();

  const { data, isLoading } = useParts({
    page, limit: 20,
    search: search || undefined,
    category: category || undefined,
    condition: condition as PartCondition || undefined,
    sortBy: 'createdAt', sortDir: 'desc',
  });

  function confirmDelete(id: string, name: string) {
    if (confirm(`Usunąć część "${name}"?`)) deletePart.mutate(id);
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Części</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data?.pagination.total ?? 0} pozycji w bazie
          </p>
        </div>
        <Link to="/parts/new" className="btn-primary">
          <Plus size={16} /> Dodaj część
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Szukaj nazwy, numeru OEM..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="input w-44"
          >
            <option value="">Wszystkie kategorie</option>
            {PART_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            value={condition}
            onChange={(e) => { setCondition(e.target.value); setPage(1); }}
            className="input w-36"
          >
            <option value="">Wszystkie stany</option>
            {Object.entries(CONDITION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 w-12">&nbsp;</th>
                  <th className="text-left px-3 py-3">Nazwa</th>
                  <th className="text-left px-3 py-3">OEM</th>
                  <th className="text-left px-3 py-3">Kategoria</th>
                  <th className="text-left px-3 py-3">Stan</th>
                  <th className="text-right px-3 py-3">Cena brutto</th>
                  <th className="text-right px-3 py-3">Stock</th>
                  <th className="text-right px-3 py-3">Wystawienia</th>
                  <th className="px-5 py-3 w-20">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {data?.items.map((part) => (
                  <tr key={part.id} className="group hover:bg-slate-900/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-800 overflow-hidden">
                        {part.images[0] ? (
                          <img src={part.images[0].url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package size={14} className="text-slate-600" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/parts/${part.id}`} className="font-medium text-slate-200 hover:text-brand-400 transition-colors">
                        {part.name}
                      </Link>
                      {part.catalogNumber && (
                        <div className="text-xs text-slate-500 font-mono">{part.catalogNumber}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-400">
                      {part.oemNumber ?? '–'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-slate-400 capitalize">{part.category.replace('_', ' ')}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx('badge', CONDITION_BADGE[part.condition])}>
                        {CONDITION_LABELS[part.condition]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-200">
                      {part.priceBrutto.toFixed(2)} <span className="text-slate-500 text-xs">zł</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={clsx('font-mono text-sm', part.stock <= part.stockMin ? 'text-red-400' : 'text-slate-200')}>
                        {part.stock}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs text-slate-500">{part._count?.listings ?? 0}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link to={`/parts/${part.id}/edit`}
                              className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
                          <Edit2 size={13} />
                        </Link>
                        <button onClick={() => confirmDelete(part.id, part.name)}
                                className="p-1.5 rounded hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!data?.items.length && (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center text-slate-500">
                      Brak części. <Link to="/parts/new" className="text-brand-400 hover:text-brand-300">Dodaj pierwszą →</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {(data?.pagination.totalPages ?? 0) > 1 && (
              <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  Strona {data?.pagination.page} z {data?.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1} className="btn-secondary py-1 px-2">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setPage((p) => p + 1)} disabled={page >= (data?.pagination.totalPages ?? 1)} className="btn-secondary py-1 px-2">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
