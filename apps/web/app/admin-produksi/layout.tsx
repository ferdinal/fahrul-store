'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AdminHeader } from '@/components/layout/AdminHeader';
import { useAuthStore } from '@/store/authStore';

const navigation = [
  {
    href: '/admin-produksi',
    label: 'Planning',
  },
  {
    href: '/admin-produksi/create-order',
    label: 'Create Order',
  },
  {
    href: '/admin-produksi/assignment',
    label: 'Assignment',
  },
];

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
    <div className="min-h-dvh bg-[#070b1a] text-white">
      <AdminHeader
        title="Admin Produksi"
        subtitle="Production planning, Production Order, dan assignment Operator"
      />

      <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6 sm:pt-5 lg:px-8">
        <nav
          aria-label="Navigasi Admin Produksi"
          className="grid grid-cols-3 gap-2 rounded-2xl border border-blue-900/40 bg-[#0a1024] p-2"
        >
          {navigation.map((item) => {
            const active =
              item.href === '/admin-produksi'
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center justify-center rounded-xl px-2 py-2 text-center text-xs font-bold transition sm:text-sm ${
                  active
                    ? 'bg-gradient-to-r from-red-600 to-blue-600 text-white shadow-lg shadow-blue-950/30'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
