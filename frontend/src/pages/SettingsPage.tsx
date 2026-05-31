import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, XCircle, ExternalLink, Loader2, Download,
  PlugZap, RefreshCw, AlertTriangle, Settings, Bell, Send,
} from 'lucide-react';
import {
  useAllegroStatus,
  useAllegroConnect,
  useAllegroDisconnect,
  useAllegroShippingRates,
} from '../hooks/useAllegro';
import {
  useOtomotoStatus,
  useOtomotoConfigure,
  useOtomotoDisconnect,
} from '../hooks/useOtomoto';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

function PortalCard({
  name,
  logo,
  color,
  children,
}: {
  name: string;
  logo: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className={`h-1 ${color}`} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg font-bold">
            {logo}
          </div>
          <h2 className="text-base font-semibold text-white">{name}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
      connected
        ? 'bg-green-500/15 text-green-400'
        : 'bg-slate-700 text-slate-400',
    )}>
      {connected
        ? <><CheckCircle2 size={11} /> Połączono</>
        : <><XCircle size={11} /> Niepołączono</>}
    </span>
  );
}

// ── Allegro Panel ────────────────────────────
function AllegroPanel() {
  const { data: status, isLoading, refetch } = useAllegroStatus();
  const connect    = useAllegroConnect();
  const disconnect = useAllegroDisconnect();
  const { data: shippingRates } = useAllegroShippingRates();

  if (isLoading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={14} className="animate-spin" /> Sprawdzanie...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatusBadge connected={status?.connected ?? false} />
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary py-1 px-2">
            <RefreshCw size={12} />
          </button>
          {status?.connected ? (
            <button onClick={() => disconnect.mutate()} className="btn-danger py-1 px-3 text-xs">
              Rozłącz
            </button>
          ) : (
            <button
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="btn-primary py-1.5 px-3 text-xs"
            >
              {connect.isPending ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
              Połącz z Allegro
            </button>
          )}
        </div>
      </div>

      {status?.connected && status.user && (
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <span className="text-slate-500 w-24 shrink-0">Login:</span>
            <span className="text-slate-200 font-medium">{status.user.login}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-slate-500 w-24 shrink-0">Środowisko:</span>
            <span className={clsx(
              'badge text-xs',
              status.env === 'sandbox'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-green-500/20 text-green-400',
            )}>
              {status.env === 'sandbox' ? '🧪 Sandbox' : '🟢 Produkcja'}
            </span>
          </div>
          {status.expiresAt && (
            <div className="flex gap-2">
              <span className="text-slate-500 w-24 shrink-0">Token do:</span>
              <span className="text-slate-400 font-mono text-xs">
                {new Date(status.expiresAt).toLocaleString('pl')}
              </span>
            </div>
          )}
        </div>
      )}

      {status?.connected && shippingRates && shippingRates.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">Zestawy wysyłki ({shippingRates.length}):</p>
          <div className="flex flex-wrap gap-1.5">
            {shippingRates.map((r) => (
              <span key={r.id} className="badge bg-slate-800 text-slate-400 text-xs border border-slate-700">
                {r.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {!status?.connected && (
        <div className="bg-amber-500/10 border border-amber-800/40 rounded-lg p-3">
          <div className="flex gap-2 text-sm text-amber-400">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Wymagana konfiguracja</p>
              <p className="text-xs text-amber-400/70">
                Ustaw <code className="font-mono bg-amber-900/30 px-1 rounded">ALLEGRO_CLIENT_ID</code>
                {' '}i{' '}
                <code className="font-mono bg-amber-900/30 px-1 rounded">ALLEGRO_CLIENT_SECRET</code>
                {' '}w pliku <code className="font-mono bg-amber-900/30 px-1 rounded">backend/.env</code>
              </p>
              <a
                href="https://apps.developer.allegro.pl"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 mt-2"
              >
                <ExternalLink size={11} /> Allegro Developer Console →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Otomoto Panel ────────────────────────────
function OtomotoPanel() {
  const { data: status, isLoading, refetch } = useOtomotoStatus();
  const configure  = useOtomotoConfigure();
  const disconnect = useOtomotoDisconnect();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientId: '', clientSecret: '', advertiserId: '' });

  if (isLoading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={14} className="animate-spin" /> Sprawdzanie...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatusBadge connected={status?.connected ?? false} />
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary py-1 px-2">
            <RefreshCw size={12} />
          </button>
          {status?.connected ? (
            <button onClick={() => disconnect.mutate()} className="btn-danger py-1 px-3 text-xs">
              Rozłącz
            </button>
          ) : (
            <button onClick={() => setShowForm((v) => !v)} className="btn-primary py-1.5 px-3 text-xs">
              <PlugZap size={12} /> Konfiguruj
            </button>
          )}
        </div>
      </div>

      {status?.connected && status.advertiser && (
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <span className="text-slate-500 w-28 shrink-0">Email:</span>
            <span className="text-slate-200">{status.advertiser.email}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-slate-500 w-28 shrink-0">Advertiser ID:</span>
            <span className="text-slate-400 font-mono text-xs">{status.advertiserId}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-slate-500 w-28 shrink-0">Status konta:</span>
            <span className="badge bg-green-500/20 text-green-400 text-xs">{status.advertiser.status}</span>
          </div>
        </div>
      )}

      {showForm && !status?.connected && (
        <div className="bg-slate-800/40 rounded-lg p-4 space-y-3 border border-slate-700">
          <p className="text-xs text-slate-400 font-medium">Dane API Otomoto Business</p>
          {(['clientId', 'clientSecret', 'advertiserId'] as const).map((field) => (
            <div key={field}>
              <label className="label">{field === 'clientId' ? 'Client ID' : field === 'clientSecret' ? 'Client Secret' : 'Advertiser ID'}</label>
              <input
                type={field === 'clientSecret' ? 'password' : 'text'}
                value={form[field]}
                onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
                className="input font-mono text-xs"
                placeholder={field === 'advertiserId' ? 'np. 12345678' : ''}
              />
            </div>
          ))}
          <button
            onClick={() => configure.mutate(form)}
            disabled={!form.clientId || !form.clientSecret || !form.advertiserId || configure.isPending}
            className="btn-primary w-full justify-center text-xs"
          >
            {configure.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Zapisz konfigurację
          </button>
        </div>
      )}

      {!status?.connected && !showForm && (
        <div className="bg-blue-500/10 border border-blue-800/40 rounded-lg p-3">
          <div className="flex gap-2 text-sm text-blue-400">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Wymagane konto partnerskie</p>
              <p className="text-xs text-blue-400/70">
                Otomoto API wymaga konta Business Partner.
              </p>
              <a href="https://developer.otomoto.pl" target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 mt-2">
                <ExternalLink size={11} /> Otomoto Developer →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notifications Panel ──────────────────────
interface NotifSettings { listingError: boolean; listingActive: boolean; syncComplete: boolean; lowStock: boolean }

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-brand-600' : 'bg-slate-700',
      )}
    >
      <span className={clsx('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  );
}

function NotificationsPanel() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery<NotifSettings>({
    queryKey: ['notif-settings'],
    queryFn: () => api.get('/auth/notification-settings').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<NotifSettings>) => api.patch('/auth/notification-settings', data).then((r) => r.data),
    onSuccess: (data) => { qc.setQueryData(['notif-settings'], data); toast.success('Zapisano ustawienia'); },
    onError: () => toast.error('Błąd zapisu'),
  });

  const testMutation = useMutation({
    mutationFn: () => api.post('/auth/test-email').then((r) => r.data),
    onSuccess: (data) => toast.success(`Testowy e-mail wysłany na ${data.sentTo}`),
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Błąd wysyłki — sprawdź RESEND_API_KEY'),
  });

  if (isLoading || !settings) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={14} className="animate-spin" /> Ładowanie...</div>;
  }

  const items: { key: keyof NotifSettings; label: string; desc: string }[] = [
    { key: 'listingError',  label: 'Błąd wystawienia',       desc: 'Gdy wystawienie zmieni status na ERROR' },
    { key: 'listingActive', label: 'Wystawienie aktywne',    desc: 'Gdy wystawienie zostanie aktywowane (ACTIVE)' },
    { key: 'syncComplete',  label: 'Koniec synchronizacji',  desc: 'Po zakończeniu synchronizacji z TruckParts' },
    { key: 'lowStock',      label: 'Niski stan magazynowy',  desc: 'Gdy stock ≤ stockMin po ręcznej aktualizacji' },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {items.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-200">{label}</div>
              <div className="text-xs text-slate-500">{desc}</div>
            </div>
            <Toggle
              checked={settings[key]}
              onChange={(v) => saveMutation.mutate({ [key]: v })}
            />
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          E-mail: konto zalogowanego użytkownika.<br />
          Wymagane: <code className="font-mono bg-slate-800 px-1 rounded">RESEND_API_KEY</code> w Edge Function.
        </p>
        <button
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
          className="btn-secondary py-1.5 px-3 text-xs shrink-0"
        >
          {testMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Wyślij test
        </button>
      </div>
    </div>
  );
}

function AutolinePanel() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="badge bg-green-500/15 text-green-400 border border-green-800/40">
          ✓ Gotowe (eksport pliku)
        </span>
      </div>
      <div className="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-400">
        Autoline działa przez import pliku CSV lub XML. Nie wymaga konfiguracji API —
        generujesz plik i wgrywasz go ręcznie do panelu Autoline.
      </div>
      <a href="/autoline" className="btn-primary py-1.5 px-3 text-xs inline-flex">
        <Download size={12} /> Przejdź do eksportu →
      </a>
    </div>
  );
}

// ── Główny komponent strony ──────────────────
export default function SettingsPage() {
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (params.get('allegro_connected') === '1') {
      toast.success('Allegro połączone pomyślnie! 🎉');
      setParams({});
    }
    if (params.get('allegro_error')) {
      toast.error(`Błąd Allegro OAuth: ${params.get('allegro_error')}`);
      setParams({});
    }
  }, [params, setParams]);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings size={22} className="text-brand-400" /> Ustawienia
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Konfiguracja połączeń z portalami ogłoszeniowymi</p>
      </div>

      <div className="space-y-4">
        <PortalCard name="Allegro" logo="🛒" color="bg-orange-500">
          <AllegroPanel />
        </PortalCard>

        <PortalCard name="Otomoto" logo="🚗" color="bg-blue-500">
          <OtomotoPanel />
        </PortalCard>

        <PortalCard name="Autoline" logo="🌍" color="bg-green-500">
          <AutolinePanel />
        </PortalCard>

        <div className="card overflow-hidden">
          <div className="h-1 bg-violet-500" />
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                <Bell size={18} className="text-violet-400" />
              </div>
              <h2 className="text-base font-semibold text-white">Powiadomienia e-mail</h2>
            </div>
            <NotificationsPanel />
          </div>
        </div>
      </div>

      {/* Instrukcja */}
      <div className="card p-5 border-slate-800">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Jak skonfigurować Allegro?</h3>
        <ol className="space-y-2 text-sm text-slate-400">
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-600/30 text-brand-400 flex items-center justify-center text-xs shrink-0 font-mono">1</span>
            Zaloguj się na <a href="https://apps.developer.allegro.pl" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 underline-offset-2 underline">apps.developer.allegro.pl</a>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-600/30 text-brand-400 flex items-center justify-center text-xs shrink-0 font-mono">2</span>
            Utwórz nową aplikację, wybierz typ <strong className="text-slate-300">Web application</strong>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-600/30 text-brand-400 flex items-center justify-center text-xs shrink-0 font-mono">3</span>
            Ustaw Redirect URI: <code className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-xs text-brand-300">http://localhost:4000/api/allegro/oauth/callback</code>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-600/30 text-brand-400 flex items-center justify-center text-xs shrink-0 font-mono">4</span>
            Skopiuj <strong className="text-slate-300">Client ID</strong> i <strong className="text-slate-300">Client Secret</strong> do <code className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-xs">backend/.env</code>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-600/30 text-brand-400 flex items-center justify-center text-xs shrink-0 font-mono">5</span>
            Ustaw <code className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-xs">ALLEGRO_ENV=sandbox</code> (testowe) lub <code className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-xs">production</code>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-600/30 text-brand-400 flex items-center justify-center text-xs shrink-0 font-mono">6</span>
            Zrestartuj backend i kliknij <strong className="text-slate-300">Połącz z Allegro</strong> powyżej
          </li>
        </ol>
      </div>
    </div>
  );
}
