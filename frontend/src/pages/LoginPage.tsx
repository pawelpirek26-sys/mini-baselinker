import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api, useAuthStore } from '../lib/api';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('demo@minibaselinker.pl');
  const [password, setPassword] = useState('demo1234');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.token, data.user);
      navigate('/dashboard');
    } catch {
      toast.error('Nieprawidłowy email lub hasło');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(84,97,245,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(84,97,245,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/30 mb-4">
            <Truck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Mini Baselinker</h1>
          <p className="text-sm text-slate-500 mt-1">Zarządzanie częściami ciężarowymi</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="demo@minibaselinker.pl"
              required
            />
          </div>
          <div>
            <label className="label">Hasło</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-10"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Zaloguj się
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-4">
          Demo: demo@minibaselinker.pl / demo1234
        </p>
      </div>
    </div>
  );
}
