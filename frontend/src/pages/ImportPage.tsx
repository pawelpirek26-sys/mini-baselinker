import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, FileText, Table2, CheckCircle2, XCircle,
  AlertTriangle, Download, Play, RotateCcw,
  ChevronRight, Loader2, Info, Package
} from 'lucide-react';
import {
  useImportPreview,
  useImportExecute,
  useDownloadTemplate,
  type ImportPreviewResult,
  type ImportExecuteResult,
  type ImportOptions,
} from '../hooks/useImport';
import clsx from 'clsx';

// ── Typy kroków ───────────────────────────────
type Step = 'upload' | 'preview' | 'options' | 'done';

// ── Drag-and-drop zone ────────────────────────
function DropZone({
  onFile,
  loading,
}: {
  onFile:  (f: File) => void;
  loading: boolean;
}) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={clsx(
        'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all',
        dragging
          ? 'border-brand-500 bg-brand-500/5'
          : 'border-slate-700 hover:border-slate-600 hover:bg-slate-900/40',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-brand-400" />
          <p className="text-sm text-slate-400">Parsowanie pliku…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center">
            <Upload size={24} className="text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">Przeciągnij plik lub kliknij aby wybrać</p>
            <p className="text-xs text-slate-500 mt-1">Obsługiwane formaty: CSV, XLSX, XLS • Max 10 MB</p>
          </div>
          <div className="flex gap-3 text-xs text-slate-600 mt-1">
            <span className="flex items-center gap-1"><Table2 size={11} /> CSV</span>
            <span className="flex items-center gap-1"><FileText size={11} /> Excel</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mapowanie kolumn ──────────────────────────
const FIELD_LABELS: Record<string, string> = {
  name: 'Nazwa *', oemNumber: 'Nr OEM', catalogNumber: 'Nr katalog.', ean: 'EAN',
  category: 'Kategoria', subcategory: 'Podkategoria', condition: 'Stan',
  priceNet: 'Cena netto *', priceBrutto: 'Cena brutto', vatRate: 'VAT%',
  stock: 'Ilość', stockMin: 'Min. stan',
  descriptionShort: 'Krótki opis', descriptionLong: 'Pełny opis',
  brand: 'Marka', model: 'Model', yearFrom: 'Rok od', yearTo: 'Rok do',
};

function ColumnMapTable({ headers, columnMap }: { headers: string[]; columnMap: Record<string, string> }) {
  const mapped   = headers.filter((h) => columnMap[h]);
  const unmapped = headers.filter((h) => !columnMap[h]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Automatycznie wykryto {mapped.length} z {headers.length} kolumn:
      </p>
      <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
        {mapped.map((h) => (
          <div key={h} className="flex items-center gap-2 text-xs px-2 py-1 bg-green-500/10 rounded border border-green-800/40">
            <CheckCircle2 size={10} className="text-green-400 shrink-0" />
            <span className="text-slate-400 font-mono truncate">{h}</span>
            <ChevronRight size={10} className="text-slate-600 shrink-0" />
            <span className="text-green-400 font-medium">{FIELD_LABELS[columnMap[h]] ?? columnMap[h]}</span>
          </div>
        ))}
        {unmapped.map((h) => (
          <div key={h} className="flex items-center gap-2 text-xs px-2 py-1 bg-slate-800/50 rounded border border-slate-700/50">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700 shrink-0" />
            <span className="text-slate-600 font-mono truncate">{h}</span>
            <span className="text-slate-700 ml-auto text-xs">pominięta</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Podgląd wierszy ───────────────────────────
function PreviewTable({ data }: { data: ImportPreviewResult }) {
  const [tab, setTab] = useState<'valid' | 'invalid'>('valid');

  const cols = ['name', 'oemNumber', 'category', 'condition', 'priceNet', 'stock', 'brand', 'model'];

  return (
    <div className="card overflow-hidden">
      <div className="flex border-b border-slate-800">
        {(['valid', 'invalid'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px',
              tab === t ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-500',
            )}
          >
            {t === 'valid'
              ? <><CheckCircle2 size={12} className="text-green-400" /> Poprawne ({data.valid})</>
              : <><XCircle size={12} className="text-red-400" /> Błędne ({data.invalid})</>}
          </button>
        ))}
        {data.truncated && (
          <div className="ml-auto flex items-center gap-1 px-4 text-xs text-amber-400">
            <AlertTriangle size={11} /> Podgląd ograniczony do 500 wierszy
          </div>
        )}
      </div>

      {tab === 'valid' && (
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40">
                <th className="text-left px-3 py-2 text-slate-500 font-mono">Wiersz</th>
                {cols.map((c) => (
                  <th key={c} className="text-left px-3 py-2 text-slate-500 uppercase tracking-wide">
                    {FIELD_LABELS[c]?.replace(' *', '') ?? c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {data.previewValid.map(({ row, data: d }) => (
                <tr key={row} className="hover:bg-slate-900/20">
                  <td className="px-3 py-1.5 text-slate-600 font-mono">{row}</td>
                  {cols.map((c) => (
                    <td key={c} className="px-3 py-1.5 text-slate-300 max-w-[140px] truncate">
                      {String(d?.[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.valid > 20 && (
            <p className="px-3 py-2 text-xs text-slate-600 border-t border-slate-800">
              … i {data.valid - 20} więcej poprawnych wierszy
            </p>
          )}
        </div>
      )}

      {tab === 'invalid' && (
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/40">
          {data.previewInvalid.length === 0 && (
            <p className="px-4 py-6 text-sm text-center text-slate-500">Brak błędnych wierszy 🎉</p>
          )}
          {data.previewInvalid.map(({ row, raw, errors }) => (
            <div key={row} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 font-mono">Wiersz {row}</span>
                <span className="text-xs text-red-400 font-medium">{raw.name || raw.article_name || '—'}</span>
              </div>
              {errors?.map((e, i) => (
                <div key={i} className="flex gap-2 text-xs text-red-400/80">
                  <span className="text-red-600 font-mono shrink-0">{e.field}:</span>
                  <span>{e.message}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Opcje importu ─────────────────────────────
function OptionsPanel({
  options,
  onChange,
}: {
  options:  ImportOptions;
  onChange: (o: ImportOptions) => void;
}) {
  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Opcje importu</h3>
      {[
        {
          key: 'skipInvalid' as const,
          label: 'Pomiń błędne wiersze',
          desc: 'Importuj tylko poprawne wiersze, zignoruj błędne',
        },
        {
          key: 'updateExisting' as const,
          label: 'Aktualizuj istniejące części',
          desc: 'Jeśli OEM już istnieje w bazie — zaktualizuj dane',
        },
        {
          key: 'dryRun' as const,
          label: 'Tryb testowy (dry run)',
          desc: 'Sprawdź bez zapisu do bazy — pokaże co by się zaimportowało',
        },
      ].map(({ key, label, desc }) => (
        <label key={key} className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={options[key]}
            onChange={(e) => onChange({ ...options, [key]: e.target.checked })}
            className="accent-brand-500 w-4 h-4 mt-0.5 shrink-0"
          />
          <div>
            <div className="text-sm text-slate-200 group-hover:text-white transition-colors">{label}</div>
            <div className="text-xs text-slate-500">{desc}</div>
          </div>
        </label>
      ))}
    </div>
  );
}

// ── Wynik importu ─────────────────────────────
function ResultPanel({ result }: { result: ImportExecuteResult }) {
  const stats = result.dryRun
    ? [
        { label: 'Zaimportowałoby',  value: result.wouldCreate ?? 0, color: 'text-brand-400' },
        { label: 'Błędnych wierszy', value: result.invalid,          color: 'text-red-400'   },
        { label: 'Łącznie',          value: result.total,            color: 'text-slate-300'  },
      ]
    : [
        { label: 'Dodane',      value: result.created, color: 'text-green-400'  },
        { label: 'Zaktualizowane', value: result.updated, color: 'text-brand-400' },
        { label: 'Pominięte',   value: result.skipped, color: 'text-slate-500'  },
        { label: 'Błędne',      value: result.invalid, color: 'text-red-400'   },
      ];

  return (
    <div className="space-y-4">
      {result.dryRun && (
        <div className="bg-amber-500/10 border border-amber-800/40 rounded-xl p-4 flex gap-2 text-sm text-amber-400">
          <Info size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Tryb testowy — nic nie zapisano</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Odznacz „Tryb testowy" i uruchom ponownie aby zapisać do bazy.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="card p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className={clsx('text-2xl font-bold font-mono', color)}>{value}</div>
          </div>
        ))}
      </div>

      {result.errors.length > 0 && (
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-3">
            Błędy zapisu ({result.errors.length})
          </h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {result.errors.map(({ row, error }) => (
              <div key={row} className="flex gap-2 text-xs">
                <span className="text-slate-600 font-mono shrink-0">Wiersz {row}:</span>
                <span className="text-red-400">{error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Główna strona ─────────────────────────────
export default function ImportPage() {
  const qc              = useQueryClient();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result,  setResult]  = useState<ImportExecuteResult | null>(null);
  const [options, setOptions] = useState<ImportOptions>({
    skipInvalid: true, updateExisting: false, dryRun: false,
  });

  const importPreview  = useImportPreview();
  const importExecute  = useImportExecute();
  const downloadTmpl   = useDownloadTemplate();

  async function handleFile(f: File) {
    setFile(f);
    const data = await importPreview.mutateAsync(f);
    setPreview(data);
    setStep('preview');
  }

  async function handleExecute() {
    if (!file) return;
    const data = await importExecute.mutateAsync({ file, options });
    setResult(data);
    setStep('done');
    if (!options.dryRun) {
      qc.invalidateQueries({ queryKey: ['parts'] });
    }
  }

  function handleReset() {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
    setOptions({ skipInvalid: true, updateExisting: false, dryRun: false });
  }

  // Stepper
  const STEPS = [
    { key: 'upload',  label: 'Wybierz plik' },
    { key: 'preview', label: 'Podgląd' },
    { key: 'options', label: 'Opcje' },
    { key: 'done',    label: 'Wynik' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Package size={22} className="text-brand-400" />
            Import części
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Masowy import z pliku CSV lub Excel
          </p>
        </div>
        <button
          onClick={() => downloadTmpl.mutate()}
          disabled={downloadTmpl.isPending}
          className="btn-secondary text-xs"
        >
          {downloadTmpl.isPending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Pobierz szablon CSV
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const stepOrder = ['upload', 'preview', 'options', 'done'];
          const current   = stepOrder.indexOf(step);
          const mine      = stepOrder.indexOf(s.key);
          const done      = mine < current;
          const active    = mine === current;
          return (
            <div key={s.key} className="flex items-center flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                  active ? 'bg-brand-600 text-white'
                    : done  ? 'bg-green-600 text-white'
                    : 'bg-slate-800 text-slate-500',
                )}>
                  {done ? <CheckCircle2 size={13} /> : i + 1}
                </div>
                <span className={clsx(
                  'text-xs font-medium transition-colors hidden sm:block',
                  active ? 'text-white' : done ? 'text-green-400' : 'text-slate-600',
                )}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={clsx(
                  'flex-1 h-px mx-3 transition-colors',
                  done ? 'bg-green-700' : 'bg-slate-800',
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Krok 1: Upload ── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <DropZone onFile={handleFile} loading={importPreview.isPending} />

          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Wymagania pliku
            </h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-500">
              <div>• Pierwsza linia — nagłówki kolumn</div>
              <div>• Separatory: przecinek, średnik lub tabulator</div>
              <div>• Kodowanie: UTF-8 lub UTF-8 BOM</div>
              <div>• Max 10 MB / ~10 000 wierszy</div>
              <div>• Wymagane kolumny: <code className="text-slate-400">name</code>, <code className="text-slate-400">priceNet</code></div>
              <div>• Dozwolone aliasy nazw kolumn (PL i EN)</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Krok 2: Podgląd ── */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          {/* Plik info */}
          <div className="card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand-600/20 flex items-center justify-center shrink-0">
              {file?.name.endsWith('.xlsx') || file?.name.endsWith('.xls')
                ? <Table2 size={18} className="text-brand-400" />
                : <FileText size={18} className="text-brand-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-200 truncate">{file?.name}</div>
              <div className="text-xs text-slate-500">
                {(file?.size ?? 0 / 1024).toFixed(1)} KB
                {' · '}
                {preview.totalInFile} wierszy
                {preview.truncated && <span className="text-amber-400"> (podgląd: 500)</span>}
              </div>
            </div>
            <div className="flex gap-3 text-sm shrink-0">
              <span className="flex items-center gap-1.5 text-green-400">
                <CheckCircle2 size={14} /> {preview.valid} poprawnych
              </span>
              {preview.invalid > 0 && (
                <span className="flex items-center gap-1.5 text-red-400">
                  <XCircle size={14} /> {preview.invalid} błędnych
                </span>
              )}
            </div>
          </div>

          <ColumnMapTable headers={preview.headers} columnMap={preview.columnMap} />
          <PreviewTable data={preview} />

          <div className="flex justify-between">
            <button onClick={handleReset} className="btn-secondary">
              <RotateCcw size={14} /> Zmień plik
            </button>
            <button
              onClick={() => setStep('options')}
              disabled={preview.valid === 0}
              className="btn-primary"
            >
              Dalej <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Krok 3: Opcje + start ── */}
      {step === 'options' && preview && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center gap-4 border-brand-800/30">
            <div className="flex-1 grid grid-cols-3 gap-4 text-center">
              {[
                { label: 'Poprawne', value: preview.valid, color: 'text-green-400' },
                { label: 'Błędne',   value: preview.invalid, color: 'text-red-400' },
                { label: 'Razem',    value: preview.total, color: 'text-slate-300' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className={clsx('text-2xl font-bold font-mono', color)}>{value}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <OptionsPanel options={options} onChange={setOptions} />

          <div className="flex justify-between">
            <button onClick={() => setStep('preview')} className="btn-secondary">
              ← Wstecz
            </button>
            <button
              onClick={handleExecute}
              disabled={importExecute.isPending || preview.valid === 0}
              className={clsx(
                'flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm transition-all',
                options.dryRun
                  ? 'bg-amber-600/20 text-amber-400 border border-amber-700/50 hover:bg-amber-600/30'
                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/20',
              )}
            >
              {importExecute.isPending
                ? <Loader2 size={15} className="animate-spin" />
                : <Play size={15} />}
              {options.dryRun ? 'Uruchom test' : `Importuj ${preview.valid} części`}
            </button>
          </div>
        </div>
      )}

      {/* ── Krok 4: Wynik ── */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <ResultPanel result={result} />
          <div className="flex gap-3">
            <button onClick={handleReset} className="btn-secondary flex-1 justify-center">
              <RotateCcw size={14} /> Importuj kolejny plik
            </button>
            <a href="/parts" className="btn-primary flex-1 justify-center">
              <Package size={14} /> Przejdź do listy części
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
