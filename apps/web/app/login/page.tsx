'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      username: string;
      email: string;
      role: string;
    };
    accessToken: string;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setLoading(true);

    try {
      const response = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
        }),
      });

      login(response.data.user, response.data.accessToken);

      // Redirect berdasarkan role
      if (response.data.user.role === 'admin') {
        router.push('/dashboard');
      } else if (response.data.user.role === 'admin-produksi') {
        router.push('/admin-produksi');
      } else if (response.data.user.role === 'operator') {
        router.push('/operator');
      } else if (response.data.user.role === 'user') {
        router.push('/my-customer-orders');
      } else {
        setError('Role user tidak dikenali.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b1a] px-4">
      {/* Background decoration */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-red-600/20 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />

      {/* Spider web style lines */}
      <div className="pointer-events-none absolute inset-0 opacity-10">
        <div className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400" />
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-400" />
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400" />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-red-600 via-red-600 to-blue-700 px-8 py-10 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-[#070b1a] shadow-xl">
              <span className="text-3xl font-black text-white">FS</span>
            </div>

            <h1 className="text-3xl font-black tracking-tight text-white">
              Fahrul Store
            </h1>

            <p className="mt-2 text-sm text-white/80">Welcome back, hero.</p>
          </div>

          {/* Form */}
          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Username
                </label>

                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {error}
                </div>
              )}

              {/* Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-red-600 to-blue-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-red-600/20 transition hover:scale-[1.01] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />

              <span className="text-xs font-medium text-gray-400">
                Secure authentication
              </span>

              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
