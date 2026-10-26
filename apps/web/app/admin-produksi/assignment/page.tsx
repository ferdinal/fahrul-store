'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

type Operator = {
  _id: string;
  username: string;
  email?: string;
  role: string;
};

type Assignment = {
  assignedOperator: string | null;
  quantity: number;
  assignedAt?: string | null;
};

type ProductionOrder = {
  _id: string;
  orderNumber: string;
  quantity: number;
  assignedQuantity: number;
  remainingQuantity: number;
  status: string;
  product?: {
    _id?: string;
    name?: string;
    version?: string;
  } | null;
  batch?: {
    _id?: string;
    batchNumber?: string;
  } | null;
  assignments: Assignment[];
  step: {
    _id: string;
    process?: unknown;
    processName: string;
    processCode: string;
    status: string;
  };
};

type ListFilter = 'all' | 'assigned' | 'unassigned';

const panelClass =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6';

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Terjadi kesalahan. Silakan coba lagi.';
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

function validQuantity(value: string): number {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export default function ProductionAssignmentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [selectedOperatorsByOrder, setSelectedOperatorsByOrder] = useState<
    Record<string, string[]>
  >({});
  const [assigningOrderId, setAssigningOrderId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const canAccess = user?.role === 'admin' || user?.role === 'admin-produksi';

  useEffect(() => {
    if (!user) return;
    if (!canAccess) {
      router.replace(user.role === 'user' ? '/my-customer-orders' : '/login');
    }
  }, [user, canAccess, router]);

  const operatorsQuery = useQuery<ApiResponse<Operator[]>, Error>({
    queryKey: ['production-planning-operators'],
    queryFn: () =>
      apiFetch<ApiResponse<Operator[]>>('/api/production-planning/operators'),
    enabled: Boolean(canAccess),
  });

  const ordersQuery = useQuery<ApiResponse<ProductionOrder[]>, Error>({
    queryKey: ['production-planning-unassigned-orders'],
    queryFn: () =>
      apiFetch<ApiResponse<ProductionOrder[]>>(
        '/api/production-planning/unassigned-orders',
      ),
    enabled: Boolean(canAccess),
    refetchInterval: 15000,
  });

  const operators = Array.isArray(operatorsQuery.data?.data)
    ? operatorsQuery.data.data
    : [];
  const orders = Array.isArray(ordersQuery.data?.data)
    ? ordersQuery.data.data
    : [];

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id-ID');

    return orders.filter((order) => {
      const searchableText = [
        order.orderNumber,
        order.product?.name,
        order.product?.version,
        order.batch?.batchNumber,
        order.step?.processName,
        order.step?.processCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('id-ID');

      const matchesSearch =
        keyword.length === 0 || searchableText.includes(keyword);
      const isAssigned = Number(order.assignedQuantity ?? 0) > 0;

      const matchesFilter =
        listFilter === 'all' ||
        (listFilter === 'assigned' && isAssigned) ||
        (listFilter === 'unassigned' && !isAssigned);

      return matchesSearch && matchesFilter;
    });
  }, [orders, search, listFilter]);

  const totalTargetQuantity = orders.reduce(
    (total, order) => total + Number(order.quantity ?? 0),
    0,
  );
  const totalAssignedQuantity = orders.reduce(
    (total, order) => total + Number(order.assignedQuantity ?? 0),
    0,
  );
  const totalRemainingQuantity = orders.reduce(
    (total, order) => total + Number(order.remainingQuantity ?? 0),
    0,
  );
  const partiallyAssignedCount = orders.filter(
    (order) => Number(order.assignedQuantity ?? 0) > 0,
  ).length;

  function getSelectedIds(orderId: string): string[] {
    return selectedOperatorsByOrder[orderId] ?? [];
  }

  async function assignOperator(order: ProductionOrder) {
    setErrorMessage('');
    setNotice('');

    const selectedIds = getSelectedIds(order._id);
    if (selectedIds.length === 0) {
      setErrorMessage(
        `Pilih minimal satu Operator untuk Production Order ${order.orderNumber}.`,
      );
      return;
    }

    const teamQuantity = Number(order.remainingQuantity ?? 0);
    if (!Number.isSafeInteger(teamQuantity) || teamQuantity < 1) {
      setErrorMessage(
        `Tidak ada kuantitas PO yang tersisa untuk ${order.orderNumber}.`,
      );
      return;
    }

    // Setiap operator adalah anggota tim yang sama; jangan menjumlahkan
    // kuantitas per anggota sebagai kuantitas PO yang berbeda.
    const requestedAssignments = selectedIds.map((operatorId) => ({
      operatorId,
      quantity: teamQuantity,
    }));
    const totalRequested = teamQuantity;

    setAssigningOrderId(order._id);

    try {
      const response = await apiFetch<ApiResponse<unknown>>(
        `/api/production-planning/orders/${order._id}/assignments`,
        {
          method: 'POST',
          body: JSON.stringify({
            stepId: order.step._id,
            assignments: requestedAssignments,
          }),
        },
      );

      if (!response.success) {
        throw new Error(response.message ?? 'Gagal membuat assignment.');
      }

      const selectedNames = operators
        .filter((operator) => selectedIds.includes(operator._id))
        .map((operator) => {
          const assignment = requestedAssignments.find(
            (item) => item.operatorId === operator._id,
          );
          return operator.username;
        });

      setNotice(
        `${order.orderNumber} berhasil ditugaskan kepada tim ${selectedNames.join(', ')} untuk seluruh ${formatNumber(totalRequested)} unit PO.`,
      );

      setSelectedOperatorsByOrder((current) => {
        const next = { ...current };
        delete next[order._id];
        return next;
      });

      await queryClient.invalidateQueries({
        queryKey: ['production-planning-unassigned-orders'],
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setAssigningOrderId('');
    }
  }

  async function refreshData() {
    setErrorMessage('');
    await Promise.all([operatorsQuery.refetch(), ordersQuery.refetch()]);
  }

  if (!user || !canAccess) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 text-sm text-slate-500">
        Memeriksa akses pengguna...
      </main>
    );
  }

  const loading = operatorsQuery.isLoading || ordersQuery.isLoading;
  const queryError = operatorsQuery.error ?? ordersQuery.error;

  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-red-700 via-red-600 to-blue-800 p-5 text-white shadow-lg sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-red-100">ADMIN PRODUKSI</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                Production Assignment
              </h1>
              <p className="mt-2 max-w-xl text-sm text-red-50">
                Tugaskan jumlah unit ke satu atau beberapa Operator. Assignment
                menggunakan kuantitas, bukan rentang nomor unit.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin-produksi"
                className="inline-flex items-center justify-center rounded-xl border border-white/40 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10"
              >
                Production Planning
              </Link>
              <button
                type="button"
                onClick={() => void refreshData()}
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                Refresh
              </button>
            </div>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {notice}
          </div>
        )}

        {(errorMessage || queryError) && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {errorMessage || getErrorMessage(queryError)}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={panelClass}>
            <p className="text-sm text-slate-500">Production Order</p>
            <p className="mt-2 text-2xl font-bold">
              {formatNumber(orders.length)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Menunggu assignment awal
            </p>
          </div>
          <div className={panelClass}>
            <p className="text-sm text-slate-500">Target Unit</p>
            <p className="mt-2 text-2xl font-bold text-blue-700">
              {formatNumber(totalTargetQuantity)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Total target semua PO</p>
          </div>
          <div className={panelClass}>
            <p className="text-sm text-slate-500">Unit Ditugaskan</p>
            <p className="mt-2 text-2xl font-bold text-green-700">
              {formatNumber(totalAssignedQuantity)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Kuantitas tim dihitung satu kali
            </p>
          </div>
          <div className={panelClass}>
            <p className="text-sm text-slate-500">Unit Tersisa</p>
            <p className="mt-2 text-2xl font-bold text-red-700">
              {formatNumber(totalRemainingQuantity)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatNumber(partiallyAssignedCount)} PO sudah memiliki
              assignment
            </p>
          </div>
        </section>

        <section className={panelClass}>
          <div>
            <h2 className="text-lg font-bold">Daftar Production Order</h2>
            <p className="mt-1 text-sm text-slate-500">
              Assignment awal hanya untuk proses pertama. Proses berikutnya
              menerima unit melalui transfer dari Operator.
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="assignment-search" className={labelClass}>
              Cari Production Order
            </label>
            <input
              id="assignment-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Contoh: PO-001, Spider-Man, Printing..."
              className={inputClass}
              autoComplete="off"
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', 'Semua PO'],
                  ['unassigned', 'Belum ada tim'],
                  ['assigned', 'Sudah ada assignment'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setListFilter(value)}
                  aria-pressed={listFilter === value}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    listFilter === value
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:text-red-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-500">
              Menampilkan{' '}
              <span className="font-semibold text-slate-900">
                {formatNumber(filteredOrders.length)}
              </span>{' '}
              dari {formatNumber(orders.length)} PO
            </p>
          </div>
        </section>

        <section className="space-y-4">
          {loading ? (
            <div
              className={`${panelClass} py-12 text-center text-sm text-slate-500`}
            >
              Memuat Production Order dan Operator...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className={`${panelClass} py-12 text-center`}>
              <p className="font-semibold text-slate-700">
                {orders.length === 0
                  ? 'Tidak ada Production Order yang menunggu assignment.'
                  : 'Production Order tidak ditemukan.'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {orders.length === 0
                  ? 'Buat Production Batch terlebih dahulu atau refresh data.'
                  : 'Coba kata kunci lain atau ubah filter.'}
              </p>
              {(search || listFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setListFilter('all');
                  }}
                  className="mt-4 text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Reset pencarian dan filter
                </button>
              )}
            </div>
          ) : (
            filteredOrders.map((order) => {
              const selectedIds = getSelectedIds(order._id);
              const remainingQuantity = Number(order.remainingQuantity ?? 0);
              const assignedQuantity = Number(order.assignedQuantity ?? 0);
              const requestedQuantity =
                selectedIds.length > 0 ? remainingQuantity : 0;
              const isAssigning = assigningOrderId === order._id;

              return (
                <article key={order._id} className={`${panelClass} space-y-5`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                        Production Order
                      </p>
                      <h3 className="mt-1 break-words text-lg font-bold">
                        {order.orderNumber}
                      </h3>
                      <p className="mt-1 break-words text-sm text-slate-600">
                        {order.product?.name ?? 'Produk tidak tersedia'}
                        {order.product?.version
                          ? ` · ${order.product.version}`
                          : ''}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Batch: {order.batch?.batchNumber ?? '—'}
                      </p>
                    </div>
                    <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                      {assignedQuantity > 0
                        ? 'Tim sudah ditugaskan'
                        : 'Belum ada tim'}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">
                      Proses pertama
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {order.step?.processName ?? 'Proses tidak tersedia'}
                    </p>
                    {order.step?.processCode && (
                      <p className="mt-1 text-xs text-slate-500">
                        Kode proses: {order.step.processCode}
                      </p>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-slate-700">
                      Ringkasan Kuantitas
                    </h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">Target PO</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {formatNumber(Number(order.quantity ?? 0))}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">unit</p>
                      </div>
                      <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                        <p className="text-xs text-green-700">
                          Sudah ditugaskan
                        </p>
                        <p className="mt-1 text-xl font-bold text-green-800">
                          {formatNumber(assignedQuantity)}
                        </p>
                        <p className="mt-1 text-xs text-green-700">unit</p>
                      </div>
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                        <p className="text-xs text-red-700">Sisa unit</p>
                        <p className="mt-1 text-xl font-bold text-red-800">
                          {formatNumber(remainingQuantity)}
                        </p>
                        <p className="mt-1 text-xs text-red-700">
                          belum ditugaskan
                        </p>
                      </div>
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                        <p className="text-xs text-blue-700">Akan ditugaskan</p>
                        <p className="mt-1 text-xl font-bold text-blue-800">
                          {formatNumber(requestedQuantity)}
                        </p>
                        <p className="mt-1 text-xs text-blue-700">unit</p>
                      </div>
                    </div>
                  </div>

                  {order.assignments?.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-slate-700">
                        Anggota tim yang sudah ditugaskan
                      </h4>
                      <div className="space-y-2">
                        {order.assignments.map((assignment, index) => {
                          const operator = operators.find(
                            (item) => item._id === assignment.assignedOperator,
                          );
                          return (
                            <div
                              key={`${assignment.assignedOperator ?? 'operator'}-${index}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            >
                              <span className="min-w-0 truncate text-slate-700">
                                {operator?.username ?? 'Operator'}
                              </span>
                              <span className="shrink-0 font-semibold text-slate-900">
                                {formatNumber(Number(assignment.quantity ?? 0))}{' '}
                                unit
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className={labelClass}>Pilih anggota tim Operator</p>
                    {operators.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {operators.map((operator) => {
                          const checked = selectedIds.includes(operator._id);
                          const disabled = remainingQuantity < 1 || isAssigning;

                          return (
                            <div
                              key={operator._id}
                              className={`rounded-xl border p-3 transition ${
                                checked
                                  ? 'border-red-400 bg-red-50 ring-1 ring-red-200'
                                  : 'border-slate-200 bg-white'
                              } ${disabled ? 'opacity-70' : ''}`}
                            >
                              <label className="flex cursor-pointer items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(event) => {
                                    const isChecked = event.target.checked;
                                    setSelectedOperatorsByOrder((current) => {
                                      const selected = current[order._id] ?? [];
                                      const nextSelected = isChecked
                                        ? [...selected, operator._id]
                                        : selected.filter(
                                            (id) => id !== operator._id,
                                          );
                                      return {
                                        ...current,
                                        [order._id]: nextSelected,
                                      };
                                    });
                                  }}
                                  className="mt-1 h-4 w-4 accent-red-600"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-slate-900">
                                    {operator.username}
                                  </span>
                                  {operator.email && (
                                    <span className="mt-0.5 block break-all text-xs text-slate-500">
                                      {operator.email}
                                    </span>
                                  )}
                                </span>
                              </label>
                              {checked && (
                                <p className="ml-7 mt-2 text-xs font-medium text-blue-700">
                                  Anggota tim — menangani seluruh{' '}
                                  {formatNumber(
                                    Number(order.remainingQuantity ?? 0),
                                  )}{' '}
                                  unit PO ini
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Belum ada Operator yang tersedia.
                      </p>
                    )}
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Operator yang dipilih dianggap satu tim. Semua anggota
                      bertanggung jawab atas seluruh kuantitas PO, dan kuantitas
                      PO dihitung satu kali.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      <p className="text-slate-500">
                        {selectedIds.length} Operator terpilih
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        Total {formatNumber(requestedQuantity)} dari{' '}
                        {formatNumber(remainingQuantity)} unit tersisa
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void assignOperator(order)}
                      disabled={
                        isAssigning ||
                        selectedIds.length === 0 ||
                        remainingQuantity < 1 ||
                        operators.length === 0
                      }
                      className="min-h-12 rounded-xl bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAssigning
                        ? 'Menyimpan assignment...'
                        : 'Assign Operator'}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <p className="pb-3 text-xs leading-5 text-slate-500">
          Catatan: halaman ini hanya membuat assignment awal untuk proses tanpa
          dependency. Proses selanjutnya menerima kuantitas melalui transfer
          dari Operator. Validasi akhir tetap dilakukan oleh backend.
        </p>
      </div>
    </main>
  );
}
