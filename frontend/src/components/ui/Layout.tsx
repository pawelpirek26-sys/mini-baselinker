import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, FileText, Megaphone,
  Truck, LogOut, ChevronRight, Settings, FileDown, Zap, Upload
} from 'lucide-react';
import { useAuthStore } from '../../lib/api';
import clsx from 'clsx';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/publish',   icon: Zap,             label: 'Publikuj' },
  { to: '/parts',     icon: Package,         label: 'Części' },
  { to: '/templates', icon: FileText,         label: 'Szablony' },
  { to: '/listings',  icon: Megaphone,        label: 'Wystawienia' },
  { to: '/autoline',  icon: FileDown,         label: 'Autoline' },
  { to: '/import',    icon: Upload,          label: 'Import' },
  { to: '/settings',  icon: Settings,         label: 'Ustawienia' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col bg-slate-900 border-r border-slate-800">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Truck size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">Mini</div>
            <div className="text-xs text-brand-400 font-mono leading-tight">Baselinker</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group',
                  isActive
                    ? 'bg-brand-600/20 text-brand-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={12} className="text-brand-500" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-slate-800">
          <div className="px-3 py-2 rounded-lg">
            <div className="text-xs font-medium text-slate-300 truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 flex items-center gap-2 px-3 py-2 w-full text-left text-xs
                       text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Wyloguj się
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-slate-950">
        <Outlet />
      </main>
    </div>
  );
}
