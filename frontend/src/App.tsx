import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
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
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
