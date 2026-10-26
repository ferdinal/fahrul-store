'use client';

import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/store/authStore';

interface AdminHeaderProps {
  title: string;
  subtitle: string;
}

export function AdminHeader({ title, subtitle }: AdminHeaderProps) {
  const router = useRouter();

  const logout = useAuthStore((state) => state.logout);

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <nav className="border-b border-blue-900/40 bg-[#0a1024]/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-xl font-bold">
            <span className="text-red-500">FS</span>{' '}
            <span className="text-blue-400">{title}</span>
          </h1>

          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/dashboard')}
            className="rounded-lg border border-blue-800/50 px-3 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
          >
            Dashboard
          </button>

          <button
            onClick={handleLogout}
            className="rounded-lg border border-red-800/50 px-3 py-2 text-sm text-red-400 transition hover:bg-red-950"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
