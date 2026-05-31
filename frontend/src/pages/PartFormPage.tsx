import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { usePart, useCreatePart, useUpdatePart } from '../hooks/useParts';
import { PART_CATEGORIES } from '../types';
import { api } from '../lib/api';

const schema = z.object({
  name: z.string().min(3, 'Min. 3 znaki'),
  oemNumber: z.string().optional(),
  catalogNumber: z.string().optional(),
  ean: z.string().optional(),
  category: z.string().min(1, 'Wybierz kategorię'),
  subcategory: z.string().optional(),
  condition: z.enum(['NEW', 'REGENERATED', 'USED']),
  priceNet: z.coerce.number().positive('Musi być > 0'),
  priceBrutto: z.coerce.number().positive('Musi być > 0'),
  vatRate: z.coerce.number().min(0).max(100),
  stock: z.coerce.number().int().min(0),
  stockMin: z.coerce.number().int().min(0),
  descriptionShort: z.string().optional(),
  descriptionLong: z.string().optional(),
  isActive: z.boolean().default(true),
});

type FormData = z.infer<typeof schema>;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export default function PartFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { data: existing } = usePart(id ?? '');
  const createPart = useCreatePart();
  const updatePart = useUpdatePart(id ?? '');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState('');
  const bruttoManualRef = useRef(false);

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        condition: 'NEW',
        vatRate: 23,
        stock: 0,
        stockMin: 1,
        category: 'inne',
        isActive: true,
      },
    });

  useEffect(() => {
    if (existing) reset({
      name: existing.name,
      oemNumber: existing.oemNumber ?? '',
      catalogNumber: existing.catalogNumber ?? '',
      ean: existing.ean ?? '',
      category: existing.category,
      subcategory: existing.subcategory ?? '',
      condition: existing.condition,
      priceNet: existing.priceNet,
      priceBrutto: existing.priceBrutto,
      vatRate: existing.vatRate,
      stock: existing.stock,
      stockMin: existing.stockMin,
      descriptionShort: existing.descriptionShort ?? '',
      descriptionLong: existing.descriptionLong ?? '',
      isActive: existing.isActive,
    });
  }, [existing, reset]);

  // Auto-calculate brutto from netto (skip if user manually edited brutto)
  const priceNet = watch('priceNet');
  const vatRate = watch('vatRate');
  useEffect(() => {
    if (!bruttoManualRef.current && priceNet && vatRate !== undefined) {
      setValue('priceBrutto', Math.round(priceNet * (1 + vatRate / 100) * 100) / 100);
    }
  }, [priceNet, vatRate, setValue]);

  async function generateAiDescription() {
    setAiError('');
    setAiLoading(true);
    try {
      const vals = getValues();
      const { data } = await api.post('/ai/description', {
        name:          vals.name,
        oemNumber:     vals.oemNumber || undefined,
        category:      vals.category,
        condition:     vals.condition,
        compatibility: existing?.compatibility,
      });
      if (data.descriptionShort) setValue('descriptionShort', data.descriptionShort);
      if (data.descriptionLong)  setValue('descriptionLong',  data.descriptionLong);
    } catch (e: any) {
      setAiError(e.response?.data?.error ?? 'Błąd generowania opisu');
    } finally {
      setAiLoading(false);
    }
  }

  async function onSubmit(data: FormData) {
    if (isEdit) {
      await updatePart.mutateAsync(data);
    } else {
      const part = await createPart.mutateAsync(data);
      navigate(`/parts/${part.id}`);
      return;
    }
    navigate(`/parts/${id}`);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to={isEdit ? `/parts/${id}` : '/parts'} className="btn-secondary py-1.5 px-2">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isEdit ? 'Edytuj część' : 'Nowa część'}
          </h1>
          {isEdit && <p className="text-sm text-slate-500 mt-0.5">{existing?.name}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Identyfikacja */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Identyfikacja</h2>
          <Field label="Nazwa części *" error={errors.name?.message}>
            <input {...register('name')} className="input" placeholder="np. Tarcza hamulcowa przednia MAN TGX" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Numer OEM" error={errors.oemNumber?.message}>
              <input {...register('oemNumber')} className="input font-mono" placeholder="81508030068" />
            </Field>
            <Field label="Nr katalogowy" error={errors.catalogNumber?.message}>
              <input {...register('catalogNumber')} className="input font-mono" placeholder="THM-001" />
            </Field>
          </div>
          <Field label="EAN / GTIN" error={errors.ean?.message}>
            <input {...register('ean')} className="input font-mono w-52" placeholder="5901234123457" />
          </Field>
        </div>

        {/* Klasyfikacja */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Klasyfikacja</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Kategoria *" error={errors.category?.message}>
              <select {...register('category')} className="input">
                {PART_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Podkategoria" error={errors.subcategory?.message}>
              <input {...register('subcategory')} className="input" placeholder="np. tarcze, klocki..." />
            </Field>
          </div>
          <Field label="Stan" error={errors.condition?.message}>
            <div className="flex gap-3">
              {(['NEW', 'REGENERATED', 'USED'] as const).map((c) => (
                <label key={c} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" {...register('condition')} value={c} className="accent-brand-500" />
                  <span className="text-sm text-slate-300">
                    {c === 'NEW' ? 'Nowa' : c === 'REGENERATED' ? 'Regenerowana' : 'Używana'}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>

        {/* Ceny */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Ceny i magazyn</h2>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Cena netto (PLN) *" error={errors.priceNet?.message}>
              <input {...register('priceNet')} type="number" step="0.01" className="input font-mono" placeholder="350.00" />
            </Field>
            <Field label="VAT (%)" error={errors.vatRate?.message}>
              <select {...register('vatRate')} className="input">
                {[0, 5, 8, 23].map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </Field>
            <Field label="Cena brutto (PLN) *" error={errors.priceBrutto?.message}>
              <input
                {...register('priceBrutto')}
                type="number" step="0.01" className="input font-mono"
                onFocus={() => { bruttoManualRef.current = true; }}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ilość w magazynie *" error={errors.stock?.message}>
              <input {...register('stock')} type="number" min="0" className="input font-mono w-32" />
            </Field>
            <Field label="Min. stan magazynowy" error={errors.stockMin?.message}>
              <input {...register('stockMin')} type="number" min="0" className="input font-mono w-32" />
            </Field>
          </div>
        </div>

        {/* Opisy */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Opisy</h2>
            <button
              type="button"
              onClick={generateAiDescription}
              disabled={aiLoading || !watch('name')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-violet-600/20 text-violet-400 border border-violet-700/40
                         hover:bg-violet-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aiLoading
                ? <Loader2 size={12} className="animate-spin" />
                : <Sparkles size={12} />}
              Generuj z AI
            </button>
          </div>
          {aiError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-800/40 rounded-lg px-3 py-2">
              <AlertCircle size={12} className="shrink-0" />
              {aiError}
            </div>
          )}
          <Field label="Krótki opis (maks. 500 znaków)" error={errors.descriptionShort?.message}>
            <textarea {...register('descriptionShort')} rows={2} className="input resize-none"
              placeholder="Krótki opis widoczny w wynikach wyszukiwania..." />
          </Field>
          <Field label="Pełny opis techniczny (HTML/Markdown)" error={errors.descriptionLong?.message}>
            <textarea {...register('descriptionLong')} rows={8} className="input resize-y font-mono text-xs"
              placeholder="<h3>Tarcza hamulcowa</h3>&#10;<p>Opis techniczny...</p>" />
          </Field>
        </div>

        {/* Aktywność */}
        <div className="card p-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" {...register('isActive')} className="accent-brand-500 w-4 h-4" />
            <div>
              <div className="text-sm font-medium text-slate-200">Część aktywna</div>
              <div className="text-xs text-slate-500">Nieaktywne części są pomijane przy wystawieniu</div>
            </div>
          </label>
        </div>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Link to={isEdit ? `/parts/${id}` : '/parts'} className="btn-secondary">
            Anuluj
          </Link>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isEdit ? 'Zapisz zmiany' : 'Dodaj część'}
          </button>
        </div>
      </form>
    </div>
  );
}
