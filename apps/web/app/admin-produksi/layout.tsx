'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function AdminProduksiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const canAccess = user?.role === 'admin' || user?.role === 'admin-produksi';

  useEffect(() => {
    if (!user) return;
    if (!canAccess) {
      router.replace(user.role === 'user' ? '/my-customer-orders' : '/login');
    }
  }, [user, canAccess, router]);

  useEffect(() => {
    if (pathname === '/admin-produksi/assignment') {
      router.replace('/admin-produksi');
    }
  }, [pathname, router]);

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#070b1a] px-4 text-sm text-gray-400">
        Memeriksa sesi pengguna...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#070b1a] px-4 text-sm text-gray-400">
        Mengalihkan halaman...
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      {children}
    </div>
  );
}
