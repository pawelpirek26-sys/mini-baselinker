import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Star, FileText, Plus, Eye, EyeOff } from 'lucide-react';
import { useTemplates, useDeleteTemplate } from '../hooks/useTemplates';
import { api } from '../lib/api';
import type { Portal, Template } from '../types';
import { PORTAL_COLORS } from '../types';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import clsx from 'clsx';
import toast from 'react-hot-toast';

const PORTALS: Portal[] = ['ALLEGRO', 'OTOMOTO', 'AUTOLINE'];

export default function TemplatesPage() {
  const [activePortal, setActivePortal] = useState<Portal | ''>('');
  const { data: templates } = useTemplates(activePortal || undefined);
  const deleteTemplate = useDeleteTemplate();
  const qc = useQueryClient();

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/templates/${id}`, { isActive }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: () => toast.error('Błąd aktualizacji'),
  });

  const grouped = PORTALS.reduce((acc, p) => {
    acc[p] = (templates ?? []).filter((t) => t.portal === p);
    return acc;
  }, {} as Record<Portal, Template[]>);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Szablony</h1>
          <p className="text-sm text-slate-500 mt-0.5">Konfiguracja szablonów wystawień per portal</p>
        </div>
        <Link to="/templates/new" className="btn-primary">
          <Plus size={16} /> Nowy szablon
        </Link>
      </div>

      {/* Portal filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setActivePortal('')}
          className={clsx('btn-secondary py-1 px-3', !activePortal && 'bg-slate-700 text-white')}
        >
          Wszystkie
        </button>
        {PORTALS.map((p) => (
          <button
            key={p}
            onClick={() => setActivePortal(p)}
            className={clsx('btn-secondary py-1 px-3', activePortal === p && 'bg-slate-700 text-white')}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Templates grouped by portal */}
      <div className="space-y-6">
        {(activePortal ? [activePortal] : PORTALS).map((portal) => (
          <div key={portal}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`badge border ${PORTAL_COLORS[portal]}`}>{portal}</span>
              <span className="text-xs text-slate-500">{grouped[portal]?.length ?? 0} szablonów</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped[portal]?.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className={clsx(
                    'card p-4 space-y-3 transition-all',
                    !tmpl.isActive && 'border-dashed border-slate-700',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-slate-400 shrink-0" />
                      <span className={clsx('text-sm font-medium truncate', tmpl.isActive ? 'text-slate-200' : 'text-slate-500')}>
                        {tmpl.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {tmpl.isDefault && (
                        <Star size={13} className="text-yellow-400 fill-yellow-400" />
                      )}
                      {!tmpl.isActive && (
                        <span className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">
                          Nieaktywny
                        </span>
                      )}
                    </div>
                  </div>

                  {tmpl.description && (
                    <p className="text-xs text-slate-500">{tmpl.description}</p>
                  )}

                  <Link
                    to={`/listings?portal=${tmpl.portal}`}
                    className="text-xs text-slate-500 hover:text-brand-400 transition-colors block"
                  >
                    {tmpl._count?.listings ?? 0} wystawień →
                  </Link>

                  <div className="flex gap-2 pt-1">
                    <Link
                      to={`/templates/${tmpl.id}/edit`}
                      className="btn-secondary py-1 px-2 text-xs flex-1 justify-center"
                    >
                      <Edit2 size={11} /> Edytuj
                    </Link>
                    <button
                      onClick={() => toggleActive.mutate({ id: tmpl.id, isActive: !tmpl.isActive })}
                      disabled={toggleActive.isPending}
                      className={clsx(
                        'btn-secondary py-1 px-2 text-xs',
                        tmpl.isActive ? 'text-green-400 hover:text-green-300' : 'text-slate-500',
                      )}
                      title={tmpl.isActive ? 'Dezaktywuj szablon' : 'Aktywuj szablon'}
                    >
                      {tmpl.isActive ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    <ConfirmButton
                      onConfirm={() => deleteTemplate.mutate(tmpl.id)}
                      confirmLabel="Usuń"
                      className="btn-danger py-1 px-2 text-xs"
                    />
                  </div>
                </div>
              ))}
              {!grouped[portal]?.length && (
                <div className="card p-6 text-center text-sm text-slate-500 border-dashed">
                  Brak szablonów dla {portal}.{' '}
                  <Link to="/templates/new" className="text-brand-400 hover:text-brand-300">
                    Utwórz →
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
