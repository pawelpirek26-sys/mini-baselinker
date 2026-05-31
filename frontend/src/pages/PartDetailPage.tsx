import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Edit2, Trash2, Plus, ExternalLink,
  Package, Car, Megaphone, Loader2, Upload, X, GripVertical,
} from 'lucide-react';
import type { PartImage } from '../types';
import { usePart, useDeletePart } from '../hooks/useParts';
import { useTemplates } from '../hooks/useTemplates';
import { usePublishListing, usePublishPart, useAllegroStatus } from '../hooks/useAllegro';
import { usePublishToOtomoto, useOtomotoStatus } from '../hooks/useOtomoto';
import { api } from '../lib/api';
import type { Listing, Compatibility } from '../types';
import { PORTAL_COLORS, STATUS_COLORS, STATUS_LABELS, CONDITION_LABELS, TRUCK_BRANDS } from '../types';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export default function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: part, isLoading } = usePart(id!);
  const { data: templates } = useTemplates();
  const deletePart = useDeletePart();
  const publishListing = usePublishListing();
  const publishPart = usePublishPart();
  const { data: allegroStatus } = useAllegroStatus();
  const { data: otomotoStatus } = useOtomotoStatus();
  const publishToOtomoto = usePublishToOtomoto();
  const [tab, setTab] = useState<'details' | 'compatibility' | 'listings'>('details');

  // Image upload
  const uploadImages = useMutation({
    mutationFn: (files: FileList) => {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('images', f));
      return api.post(`/images/upload/${id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['part', id] }); toast.success('Zdjęcia wgrane'); },
  });

  const deleteImage = useMutation({
    mutationFn: (imgId: string) => api.delete(`/images/${imgId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['part', id] }),
  });

  // Drag-and-drop image reorder
  const [imgOrder, setImgOrder] = useState<PartImage[]>([]);
  useEffect(() => { if (part) setImgOrder(part.images); }, [part?.images]);
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const reorderImages = useMutation({
    mutationFn: (order: string[]) => api.patch('/images/reorder', { partId: id, order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['part', id] }),
  });

  function onDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) { setDragOver(idx); return; }
    const next = [...imgOrder];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx;
    setDragOver(idx);
    setImgOrder(next);
  }

  function onDrop() {
    setDragOver(null);
    dragIdx.current = null;
    reorderImages.mutate(imgOrder.map((img) => img.id));
  }

  function onDragEnd() {
    setDragOver(null);
    dragIdx.current = null;
  }

  // Bulk listing
  const bulkList = useMutation({
    mutationFn: (templateIds: string[]) =>
      api.post('/listings/bulk', { partId: id, templateIds }).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['part', id] });
      const ok = data.summary.filter((s: { status: string }) => s.status === 'fulfilled').length;
      const fail = data.summary.filter((s: { status: string }) => s.status === 'rejected').length;
      toast.success(`Wystawiono: ${ok} ✓${fail ? `  Błędy: ${fail}` : ''}`);
    },
  });

  // Compatibility
  const [newCompat, setNewCompat] = useState<Partial<Compatibility>>({ brand: '' });
  const addCompat = useMutation({
    mutationFn: (data: Partial<Compatibility>) =>
      api.post(`/compatibility/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['part', id] });
      setNewCompat({ brand: '' });
      toast.success('Dodano pojazd');
    },
  });
  const delCompat = useMutation({
    mutationFn: (cid: string) => api.delete(`/compatibility/${cid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['part', id] }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-400" />
    </div>
  );
  if (!part) return <div className="p-6 text-slate-400">Część nie znaleziona</div>;

  const activeListings = part.listings?.filter((l) => l.status === 'ACTIVE') ?? [];
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/parts" className="btn-secondary py-1.5 px-2 mt-0.5">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{part.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {part.oemNumber && <span className="text-xs text-slate-400 font-mono">OEM: {part.oemNumber}</span>}
                {part.catalogNumber && <span className="text-xs text-slate-500 font-mono">{part.catalogNumber}</span>}
                <span className="badge bg-green-500/15 text-green-400">{CONDITION_LABELS[part.condition]}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link to={`/parts/${id}/edit`} className="btn-secondary">
                <Edit2 size={14} /> Edytuj
              </Link>
              <ConfirmButton
                onConfirm={() => { deletePart.mutate(id!); navigate('/parts'); }}
                label="Usuń część"
                confirmLabel="Na pewno usuń"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Price + stock bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Cena netto', value: `${part.priceNet.toFixed(2)} zł` },
          { label: 'Cena brutto', value: `${part.priceBrutto.toFixed(2)} zł`, highlight: true },
          { label: 'Magazyn', value: `${part.stock} szt.`, warn: part.stock <= part.stockMin },
          { label: 'Aktywne ogłoszenia', value: activeListings.length },
        ].map(({ label, value, highlight, warn }) => (
          <div key={label} className="card p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className={clsx(
              'text-lg font-bold font-mono',
              highlight ? 'text-brand-400' : warn ? 'text-red-400' : 'text-white'
            )}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {([
          ['details', Package, 'Szczegóły', null] as const,
          ['compatibility', Car, 'Kompatybilność', part.compatibility?.length ?? 0] as const,
          ['listings', Megaphone, 'Wystawienia', part.listings?.length ?? 0] as const,
        ]).map(
          ([key, Icon, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === key
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300',
              )}
            >
              <Icon size={14} />
              {label}
              {count !== null && count > 0 && (
                <span className="text-xs bg-slate-700 text-slate-400 rounded-full px-1.5 py-0.5 font-mono leading-none">
                  {count}
                </span>
              )}
            </button>
          )
        )}
      </div>

      {/* Tab: Details */}
      {tab === 'details' && (
        <div className="grid grid-cols-3 gap-5">
          {/* Images */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Zdjęcia</h3>
              <label className="btn-secondary py-1 px-2 cursor-pointer text-xs">
                <Upload size={12} /> Dodaj
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => e.target.files && uploadImages.mutate(e.target.files)} />
              </label>
            </div>

            {/* Cover preview */}
            {imgOrder[0] && (
              <img
                src={imgOrder[0].url}
                alt={part.name}
                className="w-full h-40 object-contain rounded-lg bg-slate-800"
              />
            )}

            {/* Draggable thumbnails */}
            {imgOrder.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {imgOrder.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={(e) => onDragOver(e, idx)}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    className={clsx(
                      'relative group w-16 h-16 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing select-none transition-all',
                      dragOver === idx && dragIdx.current !== idx
                        ? 'ring-2 ring-brand-500 scale-105'
                        : 'ring-1 ring-slate-700',
                      idx === 0 && 'ring-brand-600/50',
                    )}
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" />

                    {/* Okładka badge */}
                    {idx === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold uppercase
                                       bg-brand-600/80 text-white py-0.5 leading-tight">
                        okładka
                      </span>
                    )}

                    {/* Drag handle */}
                    <div className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical size={12} className="text-white drop-shadow" />
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteImage.mutate(img.id)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full
                                 flex items-center justify-center opacity-0 group-hover:opacity-100
                                 transition-opacity z-10"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {imgOrder.length > 1 && (
              <p className="text-xs text-slate-600">
                Przeciągnij miniaturę aby zmienić kolejność. Pierwsze zdjęcie = okładka.
              </p>
            )}
          </div>

          {/* Info */}
          <div className="col-span-2 space-y-4">
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Informacje</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  ['Kategoria', part.category],
                  ['Podkategoria', part.subcategory],
                  ['EAN', part.ean],
                  ['VAT', `${part.vatRate}%`],
                  ['Min. magazyn', part.stockMin],
                ].map(([k, v]) => v && (
                  <div key={k as string} className="flex gap-2">
                    <dt className="text-slate-500 shrink-0">{k}:</dt>
                    <dd className="text-slate-200 font-mono text-xs">{v as string}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {part.descriptionShort && (
              <div className="card p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Krótki opis</h3>
                <p className="text-sm text-slate-300">{part.descriptionShort}</p>
              </div>
            )}
            {part.technicalParams && (
              <div className="card p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Parametry techniczne</h3>
                <pre className="text-xs text-slate-300 font-mono overflow-auto">
                  {JSON.stringify(JSON.parse(part.technicalParams), null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Compatibility */}
      {tab === 'compatibility' && (
        <div className="space-y-4">
          {/* Add form */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dodaj pojazd kompatybilny</h3>
            <div className="grid grid-cols-5 gap-3 items-end">
              <div>
                <label className="label">Marka *</label>
                <select value={newCompat.brand} onChange={(e) => setNewCompat((p) => ({ ...p, brand: e.target.value }))}
                        className="input">
                  <option value="">Wybierz...</option>
                  {TRUCK_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Seria</label>
                <input value={newCompat.series ?? ''} onChange={(e) => setNewCompat((p) => ({ ...p, series: e.target.value }))}
                       className="input" placeholder="TGX, R-Series..." />
              </div>
              <div>
                <label className="label">Model</label>
                <input value={newCompat.model ?? ''} onChange={(e) => setNewCompat((p) => ({ ...p, model: e.target.value }))}
                       className="input" placeholder="TGX 18.400" />
              </div>
              <div className="flex gap-2">
                <div>
                  <label className="label">Od</label>
                  <input value={newCompat.yearFrom ?? ''} type="number" onChange={(e) => setNewCompat((p) => ({ ...p, yearFrom: Number(e.target.value) }))}
                         className="input w-24" placeholder="2010" />
                </div>
                <div>
                  <label className="label">Do</label>
                  <input value={newCompat.yearTo ?? ''} type="number" onChange={(e) => setNewCompat((p) => ({ ...p, yearTo: Number(e.target.value) }))}
                         className="input w-24" placeholder="2020" />
                </div>
              </div>
              <button
                onClick={() => newCompat.brand && addCompat.mutate(newCompat)}
                disabled={!newCompat.brand || addCompat.isPending}
                className="btn-primary"
              >
                <Plus size={14} /> Dodaj
              </button>
            </div>
          </div>

          {/* List */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Marka</th>
                  <th className="text-left px-3 py-3">Seria</th>
                  <th className="text-left px-3 py-3">Model</th>
                  <th className="text-left px-3 py-3">Lata</th>
                  <th className="text-left px-3 py-3">Kod silnika</th>
                  <th className="px-5 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {part.compatibility?.map((c) => (
                  <tr key={c.id} className="group hover:bg-slate-900/40">
                    <td className="px-5 py-2.5 font-medium text-slate-200">{c.brand}</td>
                    <td className="px-3 py-2.5 text-slate-400">{c.series ?? '–'}</td>
                    <td className="px-3 py-2.5 text-slate-400">{c.model ?? '–'}</td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-xs">
                      {c.yearFrom ?? '?'} – {c.yearTo ?? '?'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{c.engineCode ?? '–'}</td>
                    <td className="px-5 py-2.5">
                      <div className="opacity-0 group-hover:opacity-100 transition-all">
                        <ConfirmButton
                          onConfirm={() => delCompat.mutate(c.id)}
                          confirmLabel="Usuń"
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={13} />
                        </ConfirmButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {!part.compatibility?.length && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500 text-sm">Brak kompatybilnych pojazdów</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Listings */}
      {tab === 'listings' && (
        <div className="space-y-4">
          {/* Bulk list button */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Wystaw na portale</h3>
              <div className="flex gap-2">
                {allegroStatus?.connected && (
                  <button
                    onClick={() => publishPart.mutate(id!)}
                    disabled={publishPart.isPending}
                    className="btn-secondary text-xs py-1.5 border-orange-800/40 text-orange-400 hover:bg-orange-900/20"
                  >
                    {publishPart.isPending ? <Loader2 size={12} className="animate-spin" /> : <Megaphone size={12} />}
                    Allegro
                  </button>
                )}
                {otomotoStatus?.connected && (
                  <button
                    onClick={() => publishToOtomoto.mutate(id!)}
                    disabled={publishToOtomoto.isPending}
                    className="btn-secondary text-xs py-1.5 border-blue-800/40 text-blue-400 hover:bg-blue-900/20"
                  >
                    {publishToOtomoto.isPending ? <Loader2 size={12} className="animate-spin" /> : <Megaphone size={12} />}
                    Otomoto
                  </button>
                )}
                <button
                  onClick={() => {
                    const ids = templates?.filter((t) => t.isDefault).map((t) => t.id) ?? [];
                    if (!ids.length) { toast.error('Brak domyślnych szablonów'); return; }
                    bulkList.mutate(ids);
                  }}
                  disabled={bulkList.isPending}
                  className="btn-primary"
                >
                  {bulkList.isPending ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
                  Wszystkie portale
                </button>
              </div>
            </div>
            {(() => {
              const defaults = templates?.filter((t) => t.isDefault) ?? [];
              return (
                <p className="text-xs text-slate-500">
                  „Wszystkie portale" użyje domyślnych szablonów:{' '}
                  {defaults.length
                    ? defaults.map((t) => <span key={t.id} className="text-slate-400 font-medium">{t.name}</span>).reduce((a, b) => <>{a}, {b}</>)
                    : <span className="text-amber-400">brak domyślnych szablonów</span>
                  }
                </p>
              );
            })()}
          </div>

          {/* Per-template */}
          <div className="grid grid-cols-3 gap-3">
            {templates?.map((tmpl) => {
              const existing = part.listings?.find((l) => l.templateId === tmpl.id);
              return (
                <div key={tmpl.id} className="card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className={`badge border ${PORTAL_COLORS[tmpl.portal]}`}>{tmpl.portal}</span>
                    {tmpl.isDefault && <span className="text-xs text-slate-500">domyślny</span>}
                  </div>
                  <div className="text-sm font-medium text-slate-200 mb-3">{tmpl.name}</div>
                  {existing ? (
                    <div className="space-y-2">
                      <span className={`badge ${STATUS_COLORS[existing.status]}`}>{STATUS_LABELS[existing.status]}</span>
                      <div className="flex gap-3 flex-wrap">
                        {existing.externalUrl && (
                          <a href={existing.externalUrl} target="_blank" rel="noopener noreferrer"
                             className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300">
                            <ExternalLink size={11} /> Zobacz
                          </a>
                        )}
                        {existing.portal === 'ALLEGRO' && allegroStatus?.connected && (
                          <button
                            onClick={() => publishListing.mutate(existing.id)}
                            disabled={publishListing.isPending}
                            className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                          >
                            <Megaphone size={10} />
                            {existing.status === 'ACTIVE' ? 'Aktualizuj' : 'Wystaw'}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => bulkList.mutate([tmpl.id])}
                      className="btn-secondary w-full justify-center text-xs py-1.5"
                    >
                      <Plus size={12} /> Wystaw
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* History */}
          {!!part.listings?.length && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">Historia wystawień</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-800">
                    <th className="text-left px-5 py-2">Portal</th>
                    <th className="text-left px-3 py-2">Szablon</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Link</th>
                    <th className="text-right px-5 py-2">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {part.listings.map((l: Listing) => (
                    <tr key={l.id}>
                      <td className="px-5 py-2.5">
                        <span className={`badge border ${PORTAL_COLORS[l.portal]}`}>{l.portal}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 text-xs">{l.template?.name ?? l.templateId}</td>
                      <td className="px-3 py-2.5">
                        <span className={`badge ${STATUS_COLORS[l.status]}`}>{STATUS_LABELS[l.status]}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {l.externalUrl ? (
                          <a href={l.externalUrl} target="_blank" rel="noopener noreferrer"
                             className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                            <ExternalLink size={11} /> Otwórz
                          </a>
                        ) : '–'}
                      </td>
                      <td className="px-5 py-2.5 text-right text-xs text-slate-500 font-mono">
                        {new Date(l.updatedAt).toLocaleDateString('pl')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
