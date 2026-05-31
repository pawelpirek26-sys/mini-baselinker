import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useAuthStore } from './lib/api';
import Layout from './components/ui/Layout';
import LoginPage from './pages/LoginPage';
import PartsPage from './pages/PartsPage';
import PartDetailPage from './pages/PartDetailPage';
import PartFormPage from './pages/PartFormPage';
import TemplatesPage from './pages/TemplatesPage';
import ListingsPage from './pages/ListingsPage';
import SettingsPage from './pages/SettingsPage';
import DashboardPage from './pages/DashboardPage';
import AutolinePage from './pages/AutolinePage';
import PublishPage from './pages/PublishPage';
import ImportPage from './pages/ImportPage';
import TemplateEditorPage from './pages/TemplateEditorPage';
import SyncPage from './pages/SyncPage';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('React error:', error, info); }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
          <div className="bg-slate-900 border border-red-800/50 rounded-xl p-6 max-w-2xl w-full space-y-4">
            <h1 className="text-red-400 font-bold text-lg">Błąd renderowania</h1>
            <p className="text-slate-300 text-sm font-mono">{err.message}</p>
            <pre className="text-xs text-slate-500 bg-slate-950 rounded p-3 overflow-auto max-h-64">{err.stack}</pre>
            <button
              onClick={() => { this.setState({ error: null }); window.history.back(); }}
              className="px-4 py-2 bg-slate-800 text-slate-200 rounded-lg text-sm hover:bg-slate-700 transition-colors"
            >
              Wróć
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' },
          }}
        />
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="parts" element={<PartsPage />} />
              <Route path="parts/new" element={<PartFormPage />} />
              <Route path="parts/:id" element={<PartDetailPage />} />
              <Route path="parts/:id/edit" element={<PartFormPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="listings" element={<ListingsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="autoline" element={<AutolinePage />} />
              <Route path="publish" element={<PublishPage />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="templates/new" element={<TemplateEditorPage />} />
              <Route path="templates/:id/edit" element={<TemplateEditorPage />} />
              <Route path="sync" element={<SyncPage />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
