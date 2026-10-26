'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { AdminHeader } from '@/components/layout/AdminHeader';

import { getProductionOrder } from '@/lib/api/productionOrders';

import { productionOrderKeys } from '@/lib/api/productionOrderKeys';

interface ProductionOrderDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

function formatStatus(
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled',
) {
  switch (status) {
    case 'planned':
      return 'Planned';

    case 'in_progress':
      return 'In Progress';

    case 'completed':
      return 'Completed';

    case 'cancelled':
      return 'Cancelled';

    default:
      return status;
  }
}

function getStatusClass(
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled',
) {
  switch (status) {
    case 'planned':
      return 'border-blue-800/50 bg-blue-950/40 text-blue-300';

    case 'in_progress':
      return 'border-yellow-800/50 bg-yellow-950/40 text-yellow-300';

    case 'completed':
      return 'border-green-800/50 bg-green-950/40 text-green-300';

    case 'cancelled':
      return 'border-red-800/50 bg-red-950/40 text-red-300';

    default:
      return 'border-gray-800 bg-gray-900 text-gray-400';
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function ProductionOrderDetailPage({
  params,
}: ProductionOrderDetailPageProps) {
  const router = useRouter();
  const { id } = use(params);

  const orderQuery = useQuery({
    queryKey: productionOrderKeys.detail(id),
    queryFn: () => getProductionOrder(id),
    refetchInterval: 5000,
  });

  if (orderQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Production Order"
          subtitle="Production order detail"
        />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] px-6 py-12 text-center text-sm text-gray-500">
            Loading production order...
          </div>
        </main>
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Production Order"
          subtitle="Production order detail"
        />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-red-900/40 bg-[#0a1024] px-6 py-12 text-center">
            <p className="text-sm text-red-400">
              {orderQuery.error?.message ?? 'Production order tidak ditemukan.'}
            </p>

            <button
              type="button"
              onClick={() => router.push('/production-orders')}
              className="mt-4 rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
            >
              Back to Production Orders
            </button>
          </div>
        </main>
      </div>
    );
  }

  const order = orderQuery.data;

  const sortedSteps = order.steps
    .slice()
    .sort((a, b) => a.sequence - b.sequence);

  // Ringkasan hasil tahap terakhir. Tidak menjumlahkan unit yang sama
  // berulang kali pada beberapa tahap produksi.
  const finalStep = sortedSteps.at(-1);
  const finalProcessed = Number(finalStep?.quantityProcessed ?? 0);
  const finalGood = Number(finalStep?.quantityGood ?? 0);
  const finalScrap = Number(finalStep?.quantityScrap ?? 0);

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Production Order"
        subtitle="Production order detail"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">Production Order</p>

            <h2 className="mt-1 text-2xl font-bold text-white">
              {order.orderNumber}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => router.push('/production-orders')}
            className="rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
          >
            ← Back
          </button>
        </div>

        {/* Order Information */}
        <section className="mb-8 rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-blue-300">
              Order Information
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Production order information.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-600">
                Order Number
              </p>

              <p className="mt-2 font-semibold text-white">
                {order.orderNumber}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-600">
                Batch
              </p>

              <p className="mt-2 font-semibold text-white">
                {order.batch?.batchNumber ?? '-'}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-600">
                Quantity
              </p>

              <p className="mt-2 font-semibold text-white">{order.quantity}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-600">
                Status
              </p>

              <div className="mt-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClass(
                    order.status,
                  )}`}
                >
                  {formatStatus(order.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-blue-900/30 pt-6">
            <p className="text-xs uppercase tracking-wider text-gray-600">
              Product
            </p>

            <p className="mt-2 text-lg font-semibold text-white">
              {order.product?.name ?? '-'}
            </p>

            {order.product && (
              <p className="mt-1 text-sm text-gray-500">
                Version {order.product.version} · {order.product.body}
              </p>
            )}
          </div>

          {order.notes && (
            <div className="mt-6 border-t border-blue-900/30 pt-6">
              <p className="text-xs uppercase tracking-wider text-gray-600">
                Notes
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-400">
                {order.notes}
              </p>
            </div>
          )}
        </section>

        <section className="mb-8 rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-blue-300">
              Ringkasan Hasil Produksi
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Ringkasan memakai tahap terakhir
              {finalStep ? ` (${finalStep.processName})` : ''}; rincian setiap
              tahap tersedia di bawah. Pencatatan Finished Goods tidak diubah.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-blue-900/30 bg-[#070b1a] p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500">
                Target PO
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {Number(order.quantity ?? 0).toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-xs text-gray-500">unit</p>
            </div>
            <div className="rounded-lg border border-blue-900/30 bg-[#070b1a] p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500">
                Diproses tahap terakhir
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-300">
                {finalProcessed.toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-xs text-gray-500">unit</p>
            </div>
            <div className="rounded-lg border border-green-900/30 bg-green-950/20 p-4">
              <p className="text-xs uppercase tracking-wider text-green-400">
                Barang baik tahap terakhir
              </p>
              <p className="mt-2 text-2xl font-bold text-green-300">
                {finalGood.toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-xs text-gray-500">unit</p>
            </div>
            <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-4">
              <p className="text-xs uppercase tracking-wider text-red-400">
                Barang rusak tahap terakhir
              </p>
              <p className="mt-2 text-2xl font-bold text-red-300">
                {finalScrap.toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-xs text-gray-500">unit</p>
            </div>
          </div>
        </section>

        {/* Production Steps */}
        <section className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-blue-300">
              Production Steps
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Status proses diperbarui melalui aktivitas operator.
            </p>
          </div>

          {sortedSteps.length === 0 ? (
            <div className="rounded-lg border border-blue-900/30 bg-[#070b1a] px-6 py-10 text-center">
              <p className="text-sm text-gray-500">
                No production steps available.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedSteps.map((step, index) => (
                <div key={step._id} className="relative">
                  {index < sortedSteps.length - 1 && (
                    <div className="absolute left-6 top-14 h-[calc(100%+1rem)] w-px bg-blue-900/40" />
                  )}

                  <div className="relative flex gap-4 rounded-xl border border-blue-900/30 bg-[#070b1a] p-5">
                    {/* Sequence */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-lg font-bold text-blue-300">
                      {step.sequence}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-base font-semibold text-white">
                            {step.processName}
                          </h4>

                          <p className="mt-1 text-xs text-gray-500">
                            {step.processCode}
                          </p>
                        </div>

                        <span
                          className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium ${getStatusClass(
                            step.status,
                          )}`}
                        >
                          {formatStatus(step.status)}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-lg border border-blue-900/20 bg-[#0a1024] p-3">
                          <p className="text-xs text-gray-500">Urutan proses</p>
                          <p className="mt-1 text-sm font-medium text-white">
                            Step {step.sequence}
                          </p>
                        </div>
                        <div className="rounded-lg border border-blue-900/20 bg-[#0a1024] p-3">
                          <p className="text-xs text-gray-500">Waktu mulai</p>
                          <p className="mt-1 text-sm text-gray-300">
                            {formatDate(step.startedAt)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-blue-900/20 bg-[#0a1024] p-3">
                          <p className="text-xs text-gray-500">Waktu selesai</p>
                          <p className="mt-1 text-sm text-gray-300">
                            {formatDate(step.completedAt)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg border border-blue-900/20 bg-[#0a1024] p-3">
                          <p className="text-xs text-gray-500">
                            Total diproses
                          </p>
                          <p className="mt-1 text-lg font-semibold text-blue-300">
                            {Number(step.quantityProcessed ?? 0).toLocaleString(
                              'id-ID',
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg border border-green-900/30 bg-green-950/20 p-3">
                          <p className="text-xs text-green-400">Barang baik</p>
                          <p className="mt-1 text-lg font-semibold text-green-300">
                            {Number(step.quantityGood ?? 0).toLocaleString(
                              'id-ID',
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {Number(step.quantityProcessed ?? 0) > 0
                              ? `${((Number(step.quantityGood ?? 0) / Number(step.quantityProcessed ?? 1)) * 100).toFixed(1)}% hasil baik`
                              : 'Belum ada hasil'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3">
                          <p className="text-xs text-red-400">Barang rusak</p>
                          <p className="mt-1 text-lg font-semibold text-red-300">
                            {Number(step.quantityScrap ?? 0).toLocaleString(
                              'id-ID',
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {Number(step.quantityProcessed ?? 0) > 0
                              ? `${((Number(step.quantityScrap ?? 0) / Number(step.quantityProcessed ?? 1)) * 100).toFixed(1)}% tingkat kerusakan`
                              : 'Belum ada hasil'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-blue-900/20 bg-[#0a1024] p-3">
                          <p className="text-xs text-gray-500">
                            Validasi kuantitas
                          </p>
                          <p
                            className={`mt-1 text-sm font-semibold ${Number(step.quantityProcessed ?? 0) === Number(step.quantityGood ?? 0) + Number(step.quantityScrap ?? 0) ? 'text-green-300' : 'text-yellow-300'}`}
                          >
                            {Number(step.quantityProcessed ?? 0) ===
                            Number(step.quantityGood ?? 0) +
                              Number(step.quantityScrap ?? 0)
                              ? 'Seimbang'
                              : 'Perlu diperiksa'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Diproses = baik + rusak
                          </p>
                        </div>
                      </div>

                      {/* Notes */}
                      {step.notes && (
                        <div className="mt-4 rounded-lg border border-blue-900/20 bg-[#0a1024] p-3">
                          <p className="text-xs text-gray-600">Notes</p>

                          <p className="mt-1 text-sm text-gray-400">
                            {step.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
