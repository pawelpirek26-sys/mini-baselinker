import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit2, Trash2, Star, FileText, Plus } from 'lucide-react';
import { useTemplates, useDeleteTemplate } from '../hooks/useTemplates';
import type { Portal, Template } from '../types';
import { PORTAL_COLORS } from '../types';
import clsx from 'clsx';

const PORTALS: Portal[] = ['ALLEGRO', 'OTOMOTO', 'AUTOLINE'];

export default function TemplatesPage() {
  const [activePortal, setActivePortal] = useState<Portal | ''>('');
  const { data: templates } = useTemplates(activePortal || undefined);
  const deleteTemplate = useDeleteTemplate();
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
        <button onClick={() => setActivePortal('')}
                className={clsx('btn-secondary py-1 px-3', !activePortal && 'bg-slate-700 text-white')}>
          Wszystkie
        </button>
        {PORTALS.map((p) => (
          <button key={p} onClick={() => setActivePortal(p)}
                  className={clsx('btn-secondary py-1 px-3', activePortal === p && 'bg-slate-700 text-white')}>
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
                <div key={tmpl.id} className={clsx('card p-4 space-y-3', !tmpl.isActive && 'opacity-50')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-slate-400 shrink-0" />
                      <span className="text-sm font-medium text-slate-200">{tmpl.name}</span>
                    </div>
                    {tmpl.isDefault && (
                      <Star size={13} className="text-yellow-400 shrink-0 fill-yellow-400" />
                    )}
                  </div>
                  {tmpl.description && (
                    <p className="text-xs text-slate-500">{tmpl.description}</p>
                  )}
                  <div className="text-xs text-slate-500">
                    <span className="text-slate-400">{tmpl._count?.listings ?? 0}</span> wystawień
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Link to={`/templates/${tmpl.id}/edit`} className="btn-secondary py-1 px-2 text-xs flex-1 justify-center">
                      <Edit2 size={11} /> Edytuj
                    </Link>
                    <button
                      onClick={() => confirm('Usunąć szablon?') && deleteTemplate.mutate(tmpl.id)}
                      className="btn-danger py-1 px-2 text-xs"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
              {!grouped[portal]?.length && (
                <div className="card p-6 text-center text-sm text-slate-500 border-dashed">
                  Brak szablonów dla {portal}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
