'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import {
  panelClass,
  type ApiResponse,
  type ProductionRequirement,
} from './types';

const number = (value: number) => (value ?? 0).toLocaleString('id-ID');

export default function AdminProduksiPlanningPage() {
  const query = useQuery<ApiResponse<ProductionRequirement[]>, Error>({
    queryKey: ['production-requirements'],
    queryFn: () =>
      apiFetch<ApiResponse<ProductionRequirement[]>>(
        '/api/production-requirements',
      ),
  });

  const requirements = query.data?.data ?? [];

  const totalNeed = requirements.reduce(
    (sum, item) => sum + (item.productionNeed ?? 0),
    0,
  );

  const totalDemand = requirements.reduce(
    (sum, item) => sum + (item.demandQuantity ?? 0),
    0,
  );

  const totalAvailable = requirements.reduce(
    (sum, item) => sum + (item.inventory?.availableQuantity ?? 0),
    0,
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/30 via-[#0a1024] to-blue-950/30 p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
          Production control
        </p>

        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
          Production Planning
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
          Pantau kebutuhan produksi berdasarkan Customer Order, stok finished
          goods, dan produksi yang sudah direncanakan atau sedang berjalan.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href="/admin-produksi/create-order"
            className="flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r from-red-600 to-blue-600 px-4 py-3 text-sm font-bold transition hover:brightness-110"
          >
            + Create Production Order
          </Link>

          <Link
            href="/admin-produksi/assignment"
            className="flex min-h-12 items-center justify-center rounded-xl border border-blue-700/50 px-4 py-3 text-sm font-bold text-blue-200 transition hover:bg-blue-950/50"
          >
            Buka Assignment →
          </Link>
        </div>
      </section>

      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200"
        >
          {query.error.message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Produk',
            value: number(requirements.length),
            hint: 'Produk terdaftar',
          },
          {
            label: 'Total kebutuhan',
            value: number(totalNeed),
            hint: 'Unit tambahan yang dibutuhkan',
          },
          {
            label: 'Stok tersedia',
            value: number(totalAvailable),
            hint: `Demand total ${number(totalDemand)} unit`,
          },
        ].map((item) => (
          <div key={item.label} className={`${panelClass} min-w-0 p-4 sm:p-5`}>
            <p className="text-sm text-gray-500">{item.label}</p>

            <p className="mt-2 break-words text-2xl font-black sm:text-3xl">
              {item.value}
            </p>

            <p className="mt-1 text-xs leading-5 text-gray-600">{item.hint}</p>
          </div>
        ))}
      </section>

      <section className={`${panelClass} min-w-0 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-blue-900/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="font-bold">Ringkasan kebutuhan per produk</h2>

            <p className="mt-1 text-xs leading-5 text-gray-500">
              Qty produksi tambahan tidak dibatasi oleh angka kebutuhan di
              halaman Create Order.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="min-h-11 w-full rounded-xl border border-blue-700/50 px-4 py-2 text-sm font-semibold text-blue-200 transition hover:bg-blue-950/50 disabled:opacity-50 sm:w-auto"
          >
            {query.isFetching ? 'Memuat...' : 'Refresh data'}
          </button>
        </div>

        {query.isLoading ? (
          <p className="p-8 text-center text-sm text-gray-500">
            Memuat production requirement...
          </p>
        ) : requirements.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">
            Belum ada data kebutuhan produksi.
          </p>
        ) : (
          <div className="divide-y divide-blue-900/30">
            {requirements.map((item) => (
              <article key={item.product._id} className="min-w-0 p-4 sm:p-5">
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="break-words font-bold">
                      {item.product.name}
                    </h3>

                    {(item.product.version || item.product.body) && (
                      <p className="mt-1 break-words text-xs text-gray-500">
                        {[item.product.version, item.product.body]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>

                  <span
                    className={`mt-2 w-fit rounded-full border px-3 py-1 text-xs font-bold sm:mt-0 ${
                      item.productionNeed > 0
                        ? 'border-red-500/30 bg-red-950/30 text-red-200'
                        : 'border-green-500/30 bg-green-950/20 text-green-200'
                    }`}
                  >
                    {item.productionNeed > 0
                      ? `Butuh ${number(item.productionNeed)} unit`
                      : 'Kebutuhan terpenuhi'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Demand', item.demandQuantity],
                    ['Stok tersedia', item.inventory.availableQuantity],
                    ['Produksi berjalan', item.production.inProgressQuantity],
                    ['Produksi direncanakan', item.production.plannedQuantity],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="min-w-0 rounded-xl border border-blue-900/30 bg-[#070b1a] p-3"
                    >
                      <p className="text-xs text-gray-500">{label}</p>

                      <p className="mt-1 break-words font-bold">
                        {number(Number(value))}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
