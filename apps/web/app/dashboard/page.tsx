'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/store/authStore';

export default function DashboardPage() {
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!user) {
      router.replace('/login');
    }
  }, [hasHydrated, user, router]);

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  if (!hasHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070b1a]">
        <div className="text-sm font-medium text-white">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070b1a] text-white">
      {/* Navbar */}
      <header className="border-b border-white/10 bg-[#0b1024]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-blue-600 font-black">
              FS
            </div>

            <div>
              <h1 className="font-bold">Fahrul Store</h1>
              <p className="text-xs text-gray-400">Admin Dashboard</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <section className="relative overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-red-600/10 blur-3xl" />

        <div className="absolute -right-40 top-20 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-10">
          {/* Welcome */}
          <div className="mb-8">
            <p className="text-sm font-medium text-red-400">Welcome back</p>

            <h2 className="mt-1 text-3xl font-black">
              Hello, {user.username}! 🕷️
            </h2>

            <p className="mt-2 text-gray-400">
              Manage your Fahrul Store from here.
            </p>
          </div>

          {/* Stats */}
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm text-gray-400">Username</p>

              <p className="mt-2 text-xl font-bold">{user.username}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm text-gray-400">Email</p>

              <p className="mt-2 break-all text-xl font-bold">{user.email}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm text-gray-400">Role</p>

              <p className="mt-2 inline-flex rounded-full bg-gradient-to-r from-red-600 to-blue-600 px-4 py-1 text-sm font-bold uppercase">
                {user.role}
              </p>
            </div>
          </div>

          {/* Management */}
          {/* Management */}
          <div className="mt-8">
            <h3 className="mb-4 text-lg font-bold">Management</h3>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <button
                onClick={() => router.push('/users')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-red-500/50 hover:bg-red-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-600/20 text-2xl">
                  👥
                </div>

                <h4 className="font-bold">User Management</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Manage users, roles, and accounts.
                </p>
              </button>

              <button
                onClick={() => router.push('/products')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-blue-500/50 hover:bg-blue-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 text-2xl">
                  📦
                </div>

                <h4 className="font-bold">Products</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Manage products and miniature models.
                </p>
              </button>

              <button
                onClick={() => router.push('/production-processes')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-purple-500/50 hover:bg-purple-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/20 text-2xl">
                  ⚙️
                </div>

                <h4 className="font-bold">Production Processes</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Manage production process definitions.
                </p>
              </button>

              <button
                onClick={() => router.push('/production-batches')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-blue-500/50 hover:bg-blue-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 text-2xl">
                  📦
                </div>

                <h4 className="font-bold">Production Batches</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Manage production batches and schedules.
                </p>
              </button>

              <button
                onClick={() => router.push('/production-orders')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-red-500/50 hover:bg-red-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-600/20 text-2xl">
                  🏭
                </div>

                <h4 className="font-bold">Production Orders</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Manage production orders and quantities.
                </p>
              </button>

              <button
                onClick={() => router.push('/inventory')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-green-500/50 hover:bg-green-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-600/20 text-2xl">
                  📦
                </div>

                <h4 className="font-bold">Finished Goods Inventory</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Monitor finished goods stock.
                </p>
              </button>

              <button
                onClick={() => router.push('/customer-orders')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-purple-500/50 hover:bg-purple-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/20 text-2xl">
                  🛒
                </div>

                <h4 className="font-bold">Customer Orders</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Manage customer orders and fulfillment.
                </p>
              </button>

              <button
                onClick={() => router.push('/customer-order-details')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-purple-500/50 hover:bg-purple-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/20 text-2xl">
                  🛒
                </div>

                <h4 className="font-bold">Customer Order details</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Manage customer orders and fulfillment.
                </p>
              </button>

              {/* Production Planning */}
              <button
                onClick={() => router.push('/production-planning')}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition hover:-translate-y-1 hover:border-orange-500/50 hover:bg-orange-500/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-600/20 text-2xl">
                  📋
                </div>

                <h4 className="font-bold">Production Planning</h4>

                <p className="mt-2 text-sm text-gray-400">
                  Calculate production requirements and plan production.
                </p>
              </button>

              {/* <div className="rounded-2xl border border-white/10 bg-white/5 p-6 opacity-60">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-600/20 text-2xl">
                  🛒
                </div>

                <h4 className="font-bold">Orders</h4>

                <p className="mt-2 text-sm text-gray-400">Coming soon.</p>
              </div> */}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
