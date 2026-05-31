import { useState } from 'react';
import {
  Download, FileText, Table2, Eye, CheckSquare,
  RefreshCw, Loader2, Package, AlertCircle, Info
} from 'lucide-react';
import { useParts } from '../hooks/useParts';
import { useTemplates } from '../hooks/useTemplates';
import {
  useAutolineStats,
  useAutolinePreview,
  useExportCsv,
  useExportXml,
  useMarkExported,
} from '../hooks/useAutoline';
import clsx from 'clsx';

type ExportFormat = 'csv' | 'xml';

export default function AutolinePage() {
  const [format,         setFormat]         = useState<ExportFormat>('csv');
  const [selectedParts,  setSelectedParts]  = useState<string[]>([]);
  const [selectedTmpl,   setSelectedTmpl]   = useState('');
  const [showPreview,    setShowPreview]     = useState(false);
  const [feedTitle,      setFeedTitle]       = useState('Mini Baselinker Export');

  const { data: stats,     refetch: refetchStats } = useAutolineStats();
  const { data: parts }    = useParts({ limit: 100, sortBy: 'name', sortDir: 'asc' });
  const { data: templates} = useTemplates('AUTOLINE');

  const preview     = useAutolinePreview({ templateId: selectedTmpl || undefined, partIds: selectedParts.length ? selectedParts : undefined });
  const exportCsv   = useExportCsv();
  const exportXml   = useExportXml();
  const markExported = useMarkExported();

  const allIds      = parts?.items.map((p) => p.id) ?? [];
  const allSelected = selectedParts.length === allIds.length && allIds.length > 0;

  function toggleAll() {
    setSelectedParts(allSelected ? [] : allIds);
  }

  function togglePart(id: string) {
    setSelectedParts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleExport() {
    const params = {
      templateId: selectedTmpl || undefined,
      partIds:    selectedParts.length ? selectedParts : undefined,
    };
    if (format === 'csv') {
      exportCsv.mutate(params);
    } else {
      exportXml.mutate({ ...params, feedTitle });
    }
  }

  async function handlePreview() {
    setShowPreview(true);
    await preview.refetch();
  }

  const previewCols = preview.data?.rows[0] ? Object.keys(preview.data.rows[0]) : [];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-green-400">🌍</span> Autoline
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Generowanie pliku importowego CSV / XML do Autoline.eu
          </p>
        </div>
        <button onClick={() => refetchStats()} className="btn-secondary py-1.5">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-green-500/10 border border-green-800/40 rounded-xl p-4 flex gap-3">
        <Info size={16} className="text-green-400 shrink-0 mt-0.5" />
        <div className="text-sm text-green-400/80">
          <p className="font-medium text-green-400 mb-1">Import pliku do Autoline.eu</p>
          <p>Autoline nie udostępnia REST API — wyeksportuj plik CSV lub XML, a następnie wgraj go
          ręcznie w panelu konta Autoline (<em>Moje konto → Import ogłoszeń</em>) lub przez FTP.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Wyeksportowane',  value: stats?.active       ?? '–', color: 'text-green-400' },
          { label: 'Łącznie listingów', value: stats?.total      ?? '–', color: 'text-slate-300' },
          { label: 'Błędy',           value: stats?.error        ?? '–', color: 'text-red-400'   },
          { label: 'Części w stanie', value: stats?.partsInStock ?? '–', color: 'text-brand-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className={clsx('text-2xl font-bold font-mono', color)}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Panel ustawień eksportu */}
        <div className="col-span-1 space-y-4">
          <div className="card p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white">Ustawienia eksportu</h3>

            {/* Format */}
            <div>
              <label className="label">Format pliku</label>
              <div className="flex gap-2">
                {(['csv', 'xml'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-all',
                      format === f
                        ? 'bg-green-600/20 text-green-400 border-green-700/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600',
                    )}
                  >
                    {f === 'csv' ? <Table2 size={14} /> : <FileText size={14} />}
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Szablon */}
            <div>
              <label className="label">Szablon Autoline</label>
              <select
                value={selectedTmpl}
                onChange={(e) => setSelectedTmpl(e.target.value)}
                className="input"
              >
                <option value="">Domyślny szablon</option>
                {templates?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.isDefault ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {!templates?.length && (
                <p className="text-xs text-amber-400 mt-1">
                  Brak szablonów Autoline. <a href="/templates" className="underline">Dodaj w Szablonach →</a>
                </p>
              )}
            </div>

            {/* Tytuł feedu (XML only) */}
            {format === 'xml' && (
              <div>
                <label className="label">Tytuł feedu XML</label>
                <input
                  type="text"
                  value={feedTitle}
                  onChange={(e) => setFeedTitle(e.target.value)}
                  className="input"
                  placeholder="Mini Baselinker Export"
                />
              </div>
            )}

            {/* Przyciski akcji */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handlePreview}
                disabled={preview.isFetching}
                className="btn-secondary w-full justify-center"
              >
                {preview.isFetching
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Eye size={14} />}
                Podgląd ({selectedParts.length || parts?.pagination.total || 0} części)
              </button>

              <button
                onClick={handleExport}
                disabled={exportCsv.isPending || exportXml.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-500
                           text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {(exportCsv.isPending || exportXml.isPending)
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Download size={14} />}
                Pobierz {format.toUpperCase()}
              </button>

              {selectedParts.length > 0 && (
                <button
                  onClick={() => markExported.mutate({
                    partIds:    selectedParts,
                    templateId: selectedTmpl || undefined,
                  })}
                  disabled={markExported.isPending}
                  className="btn-secondary w-full justify-center text-green-400 border-green-800/40"
                >
                  {markExported.isPending
                    ? <Loader2 size={14} className="animate-spin" />
                    : <CheckSquare size={14} />}
                  Oznacz jako wyeksportowane
                </button>
              )}

              {(exportCsv.isError || exportXml.isError) && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-800/40 rounded-lg text-xs text-red-400">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    {(exportCsv.error as any)?.response?.data?.error ??
                     (exportXml.error as any)?.response?.data?.error ??
                     'Błąd eksportu'}
                  </span>
                </div>
              )}
              {markExported.isError && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-800/40 rounded-lg text-xs text-red-400">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    {(markExported.error as any)?.response?.data?.error ?? 'Błąd oznaczania'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Legenda pól */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Pola eksportu</h3>
            <div className="space-y-1.5 text-xs text-slate-500">
              {[
                ['article_name', 'Nazwa części *'],
                ['price',        'Cena *'],
                ['currency',     'Waluta (PLN) *'],
                ['quantity',     'Ilość *'],
                ['country',      'Kraj (PL) *'],
                ['oem_number',   'Numer OEM'],
                ['make',         'Marka pojazdu'],
                ['model',        'Model'],
                ['year_from/to', 'Lata produkcji'],
                ['part_type',    'Kategoria Autoline'],
                ['condition',    'Stan (new/used/reg.)'],
                ['description',  'Opis'],
                ['images',       'URL-e zdjęć'],
              ].map(([field, desc]) => (
                <div key={field} className="flex gap-2">
                  <code className="text-green-400/70 w-28 shrink-0 font-mono text-xs">{field}</code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lista części do wyboru */}
        <div className="col-span-2 space-y-4">
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-green-500 w-4 h-4 cursor-pointer"
                />
                <h3 className="text-sm font-semibold text-white">
                  Części do eksportu
                </h3>
                <span className="text-xs text-slate-500">
                  {selectedParts.length > 0
                    ? `${selectedParts.length} zaznaczonych`
                    : 'wszystkie'}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {parts?.pagination.total ?? 0} w bazie
              </span>
            </div>

            <div className="divide-y divide-slate-800/50 max-h-[520px] overflow-y-auto">
              {parts?.items.map((part) => {
                const checked = selectedParts.includes(part.id);
                return (
                  <div
                    key={part.id}
                    onClick={() => togglePart(part.id)}
                    className={clsx(
                      'flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors',
                      checked ? 'bg-green-500/5' : 'hover:bg-slate-900/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="accent-green-500 w-4 h-4 pointer-events-none"
                    />
                    <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                      {part.images[0] ? (
                        <img src={part.images[0].url} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <Package size={12} className="text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">{part.name}</div>
                      <div className="flex gap-2 text-xs text-slate-500 font-mono">
                        {part.oemNumber && <span>{part.oemNumber}</span>}
                        <span className="text-slate-600">·</span>
                        <span>{part.category}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono text-slate-300">{part.priceNet.toFixed(2)} zł</div>
                      <div className={clsx(
                        'text-xs font-mono',
                        part.stock > 0 ? 'text-green-400' : 'text-red-400',
                      )}>
                        {part.stock} szt.
                      </div>
                    </div>
                  </div>
                );
              })}
              {!parts?.items.length && (
                <div className="px-5 py-12 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                  <AlertCircle size={20} className="text-slate-600" />
                  Brak części. <a href="/parts/new" className="text-brand-400">Dodaj pierwsze →</a>
                </div>
              )}
            </div>
          </div>

          {/* Podgląd tabeli */}
          {showPreview && preview.data && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Podgląd pliku — {preview.data.total} wierszy
                </h3>
                <span className="text-xs text-slate-500">{preview.data.templateName}</span>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="text-xs whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-800">
                      {previewCols.map((col) => (
                        <th key={col} className="px-3 py-2 text-left text-slate-500 font-mono uppercase tracking-wide">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {preview.data.rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-900/30">
                        {previewCols.map((col) => (
                          <td key={col} className="px-3 py-2 text-slate-400 max-w-[200px] truncate">
                            {row[col] ?? '–'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.data.total > 20 && (
                <div className="px-5 py-2 text-xs text-slate-500 border-t border-slate-800">
                  … i {preview.data.total - 20} więcej wierszy w pliku
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
