'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

import { DatePicker } from '@/components/ui/DatePicker';
import { AdminHeader } from '@/components/layout/AdminHeader';

import {
  createProductionOrder,
  deleteProductionOrder,
  getProductionOrders,
  type CreateProductionOrderInput,
} from '@/lib/api/productionOrders';

import { getProductionBatches } from '@/lib/api/productionBatches';
import { getProducts } from '@/lib/api/products';

import { productionOrderKeys } from '@/lib/api/productionOrderKeys';
import { productionBatchKeys } from '@/lib/api/productionBatchKeys';

const statusOptions = [
  {
    value: 'planned',
    label: 'Planned',
  },
  {
    value: 'in_progress',
    label: 'In Progress',
  },
  {
    value: 'completed',
    label: 'Completed',
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
  },
] as const;

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

function formatDate(date: string | null | undefined) {
  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Ringkasan PO menggunakan proses terakhir (sequence tertinggi), bukan
 * penjumlahan antarproses. Unit yang sama bisa melewati banyak proses.
 */
function getFinalStep<
  T extends {
    sequence: number;
    quantityProcessed?: number;
    quantityGood?: number;
    quantityScrap?: number;
    processName?: string;
  },
>(order: { steps?: T[] }): T | undefined {
  return (order.steps ?? [])
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .at(-1);
}

/**
 * Progress adalah rata-rata progress tiap step agar tidak melebihi 100%
 * hanya karena unit yang sama dihitung berulang pada proses berbeda.
 */
function getOrderProgress(order: {
  quantity: number;
  steps?: Array<{
    sequence: number;
    status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
    quantityProcessed?: number;
  }>;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
}): number {
  if (order.status === 'completed') return 100;

  const steps = (order.steps ?? [])
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
  if (steps.length === 0 || Number(order.quantity) <= 0) return 0;

  const totalProgress = steps.reduce((sum, step) => {
    if (step.status === 'completed') return sum + 1;
    if (step.status === 'cancelled') return sum + 1;

    const processed = Math.max(0, Number(step.quantityProcessed ?? 0));
    return sum + Math.min(1, processed / Number(order.quantity));
  }, 0);

  return Math.min(100, Math.round((totalProgress / steps.length) * 100));
}

export default function ProductionOrdersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [batch, setBatch] = useState('');
  const [product, setProduct] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  const [quantity, setQuantity] = useState('');

  const [status, setStatus] =
    useState<CreateProductionOrderInput['status']>('planned');

  const [notes, setNotes] = useState('');

  const [search, setSearch] = useState('');
  const [searchStartDate, setSearchStartDate] = useState('');
  const [searchEndDate, setSearchEndDate] = useState('');

  const ordersQuery = useQuery({
    queryKey: productionOrderKeys.list(),
    queryFn: getProductionOrders,
    refetchInterval: 5000,
  });

  const batchesQuery = useQuery({
    queryKey: productionBatchKeys.list(),
    queryFn: getProductionBatches,
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'list'],
    queryFn: getProducts,
  });

  const createMutation = useMutation({
    mutationFn: createProductionOrder,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionOrderKeys.all,
      });

      setBatch('');
      setProduct('');
      setProductSearch('');
      setProductDropdownOpen(false);
      setQuantity('');
      setStatus('planned');
      setNotes('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProductionOrder,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionOrderKeys.all,
      });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!batch) {
      alert('Batch wajib dipilih.');
      return;
    }

    if (!product) {
      alert('Product wajib dipilih.');
      return;
    }

    const parsedQuantity = Number(quantity);

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      alert('Quantity minimal 1.');
      return;
    }

    createMutation.mutate({
      batch,
      product,
      quantity: parsedQuantity,
      status,
      notes: notes.trim() || undefined,
    });
  }

  function handleDelete(id: string) {
    const confirmed = window.confirm(
      'Yakin ingin menghapus production order ini?',
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(id);
  }

  const filteredProducts =
    productsQuery.data?.filter((item) => {
      const keyword = productSearch.trim().toLowerCase();

      if (!keyword) {
        return true;
      }

      return (
        item.name.toLowerCase().includes(keyword) ||
        item.version.toLowerCase().includes(keyword) ||
        item.body.toLowerCase().includes(keyword)
      );
    }) ?? [];

  const selectedProduct = productsQuery.data?.find(
    (item) => item._id === product,
  );

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const keywords = keyword
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    return (ordersQuery.data ?? []).filter((order) => {
      const searchableText = [
        order.orderNumber ?? '',
        order.batch?.batchNumber ?? '',
        order.product?.name ?? '',
        order.product?.version ?? '',
        order.product?.body ?? '',
        formatStatus(order.status),
        order.status ?? '',
        String(order.quantity ?? ''),
        order.notes ?? '',
        ...(order.steps ?? []).flatMap((step) => [
          step.processName ?? '',
          step.processCode ?? '',
          formatStatus(step.status),
          step.status ?? '',
        ]),
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        keywords.length === 0 ||
        keywords.every((item) => searchableText.includes(item));

      const createdDate = order.createdAt ? order.createdAt.slice(0, 10) : '';

      const matchesStartDate =
        !searchStartDate ||
        (createdDate !== '' && createdDate >= searchStartDate);

      const matchesEndDate =
        !searchEndDate || (createdDate !== '' && createdDate <= searchEndDate);

      return matchesSearch && matchesStartDate && matchesEndDate;
    });
  }, [ordersQuery.data, search, searchStartDate, searchEndDate]);

  const hasFilter =
    search.trim() !== '' || searchStartDate !== '' || searchEndDate !== '';

  function clearFilters() {
    setSearch('');
    setSearchStartDate('');
    setSearchEndDate('');
  }

  function handleExportExcel() {
    if (filteredOrders.length === 0) {
      alert('Tidak ada production order untuk diexport.');

      return;
    }

    const exportData = filteredOrders.map((order) => ({
      'Order Number': order.orderNumber,
      Batch: order.batch?.batchNumber ?? '',
      Product: order.product?.name ?? '',
      Version: order.product?.version ?? '',
      Body: order.product?.body ?? '',
      Target: order.quantity,
      'Proses terakhir': getFinalStep(order)?.processName ?? '',
      'Diproses (proses terakhir)': Number(
        getFinalStep(order)?.quantityProcessed ?? 0,
      ),
      'Barang baik (proses terakhir)': Number(
        getFinalStep(order)?.quantityGood ?? 0,
      ),
      'Barang rusak (proses terakhir)': Number(
        getFinalStep(order)?.quantityScrap ?? 0,
      ),
      'Sisa target proses terakhir': Math.max(
        0,
        Number(order.quantity ?? 0) -
          Number(getFinalStep(order)?.quantityProcessed ?? 0),
      ),
      Status: formatStatus(order.status),
      'Production Steps':
        order.steps
          ?.slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map(
            (step) =>
              `${step.sequence}. ${step.processName} (${formatStatus(
                step.status,
              )})`,
          )
          .join(' | ') ?? '',
      Notes: order.notes || '',
      'Created Date': formatDate(order.createdAt),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    worksheet['!cols'] = [
      { wch: 25 },
      { wch: 25 },
      { wch: 35 },
      { wch: 20 },
      { wch: 25 },
      { wch: 12 },
      { wch: 28 },
      { wch: 28 },
      { wch: 28 },
      { wch: 28 },
      { wch: 20 },
      { wch: 80 },
      { wch: 50 },
      { wch: 20 },
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Production Orders');

    XLSX.writeFile(workbook, 'production-orders.xlsx');
  }

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Production Orders"
        subtitle="Manage production orders"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Form */}
        <section className="mb-8 rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-blue-300">
              Create Production Order
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Create a production order from a batch and product.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              {/* Batch */}
              <div>
                <label
                  htmlFor="batch"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  Production Batch
                </label>

                <select
                  id="batch"
                  value={batch}
                  onChange={(event) => setBatch(event.target.value)}
                  disabled={batchesQuery.isLoading}
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">
                    {batchesQuery.isLoading
                      ? 'Loading batches...'
                      : 'Select production batch'}
                  </option>

                  {batchesQuery.data?.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.batchNumber}
                    </option>
                  ))}
                </select>

                {batchesQuery.isError && (
                  <p className="mt-2 text-xs text-red-400">
                    Gagal mengambil production batches.
                  </p>
                )}

                {!batchesQuery.isLoading &&
                  !batchesQuery.isError &&
                  batchesQuery.data?.length === 0 && (
                    <p className="mt-2 text-xs text-yellow-500">
                      Belum ada production batch.
                    </p>
                  )}
              </div>

              {/* Product */}
              <div>
                <label
                  htmlFor="product"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  Product
                </label>

                <div className="relative">
                  <input
                    id="product"
                    type="text"
                    value={
                      productDropdownOpen
                        ? productSearch
                        : (selectedProduct?.name ?? '')
                    }
                    onChange={(event) => {
                      setProductSearch(event.target.value);
                      setProductDropdownOpen(true);

                      if (product) {
                        setProduct('');
                      }
                    }}
                    onFocus={() => {
                      setProductDropdownOpen(true);

                      if (selectedProduct) {
                        setProductSearch('');
                      }
                    }}
                    placeholder={
                      productsQuery.isLoading
                        ? 'Loading products...'
                        : 'Search product...'
                    }
                    disabled={productsQuery.isLoading}
                    autoComplete="off"
                    className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />

                  {productDropdownOpen && !productsQuery.isLoading && (
                    <div className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-blue-900/50 bg-[#0a1024] shadow-xl">
                      {filteredProducts.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">
                          Product tidak ditemukan.
                        </div>
                      ) : (
                        filteredProducts.map((item) => (
                          <button
                            key={item._id}
                            type="button"
                            onClick={() => {
                              setProduct(item._id);
                              setProductSearch('');
                              setProductDropdownOpen(false);
                            }}
                            className="block w-full border-b border-blue-900/20 px-4 py-3 text-left transition last:border-0 hover:bg-blue-950/50"
                          >
                            <p className="text-sm font-medium text-white">
                              {item.name}
                            </p>

                            <p className="mt-1 text-xs text-gray-500">
                              {item.version} · {item.body}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {product && selectedProduct && (
                  <p className="mt-2 text-xs text-green-400">
                    ✓ Product selected: {selectedProduct.name}
                  </p>
                )}

                {productsQuery.isError && (
                  <p className="mt-2 text-xs text-red-400">
                    Gagal mengambil products.
                  </p>
                )}

                {!productsQuery.isLoading &&
                  !productsQuery.isError &&
                  productsQuery.data?.length === 0 && (
                    <p className="mt-2 text-xs text-yellow-500">
                      Belum ada product.
                    </p>
                  )}
              </div>

              {/* Quantity */}
              <div>
                <label
                  htmlFor="quantity"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  Quantity
                </label>

                <input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="Contoh: 100"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Status */}
              <div>
                <label
                  htmlFor="status"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  Status
                </label>

                <select
                  id="status"
                  value={status}
                  onChange={(event) =>
                    setStatus(
                      event.target
                        .value as CreateProductionOrderInput['status'],
                    )
                  }
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="notes"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Notes
              </label>

              <textarea
                id="notes"
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Catatan production order..."
                className="w-full resize-none rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
              />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending
                  ? 'Creating...'
                  : 'Create Production Order'}
              </button>
            </div>

            {createMutation.isError && (
              <p className="text-sm text-red-400">
                {createMutation.error.message}
              </p>
            )}
          </form>
        </section>

        {/* List */}
        <section className="overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024]">
          <div className="border-b border-blue-900/40 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-300">
                  Production Order List
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Manage all production orders.
                </p>
              </div>

              <div className="text-sm text-gray-500">
                {filteredOrders.length} order
              </div>
            </div>

            {/* Search, Date Filter & Export */}
            <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_220px_220px_auto]">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search order, batch, product, status..."
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 pr-10 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-white"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Start Date */}
              <DatePicker
                value={searchStartDate}
                onChange={setSearchStartDate}
                placeholder="Start date"
              />

              {/* End Date */}
              <DatePicker
                value={searchEndDate}
                onChange={setSearchEndDate}
                placeholder="End date"
                disabled={(date) => {
                  if (!searchStartDate) {
                    return false;
                  }

                  const startDate = new Date(`${searchStartDate}T00:00:00`);

                  return date < startDate;
                }}
              />

              {/* Export */}
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={filteredOrders.length === 0}
                className="rounded-lg border border-green-800/50 bg-green-950/30 px-5 py-3 text-sm font-medium text-green-300 transition hover:bg-green-950/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export Excel
              </button>
            </div>

            {hasFilter && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                {search && (
                  <span>
                    Search: <span className="text-gray-300">{search}</span>
                  </span>
                )}

                {searchStartDate && (
                  <span>
                    Start:{' '}
                    <span className="text-gray-300">
                      {formatDate(searchStartDate)}
                    </span>
                  </span>
                )}

                {searchEndDate && (
                  <span>
                    End:{' '}
                    <span className="text-gray-300">
                      {formatDate(searchEndDate)}
                    </span>
                  </span>
                )}

                <span>· {filteredOrders.length} hasil</span>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-blue-400 transition hover:text-blue-300"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>

          {ordersQuery.isLoading && (
            <div className="px-6 py-10 text-center text-sm text-gray-500">
              Loading production orders...
            </div>
          )}

          {ordersQuery.isError && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-red-400">
                {ordersQuery.error.message}
              </p>

              <button
                type="button"
                onClick={() => ordersQuery.refetch()}
                className="mt-4 rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
              >
                Try Again
              </button>
            </div>
          )}

          {!ordersQuery.isLoading &&
            !ordersQuery.isError &&
            ordersQuery.data?.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-500">
                  Belum ada production order.
                </p>
              </div>
            )}

          {!ordersQuery.isLoading &&
            !ordersQuery.isError &&
            ordersQuery.data &&
            ordersQuery.data.length > 0 &&
            filteredOrders.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-500">
                  Tidak ada production order yang cocok dengan filter.
                </p>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
                >
                  Clear Filter
                </button>
              </div>
            )}

          {!ordersQuery.isLoading &&
            !ordersQuery.isError &&
            filteredOrders.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1350px]">
                  <thead>
                    <tr className="border-b border-blue-900/40 text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="px-6 py-4">Order Number</th>

                      <th className="px-6 py-4">Batch</th>

                      <th className="px-6 py-4">Product</th>

                      <th className="px-6 py-4">Target</th>
                      <th className="px-6 py-4">Diproses</th>
                      <th className="px-6 py-4">Barang Baik</th>
                      <th className="px-6 py-4">Barang Rusak</th>
                      <th className="px-6 py-4">Progress</th>
                      <th className="px-6 py-4">Status</th>

                      <th className="px-6 py-4">Production Steps</th>

                      <th className="px-6 py-4">Notes</th>

                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr
                        key={order._id}
                        className="border-b border-blue-900/20 last:border-0"
                      >
                        {/* Order Number */}
                        <td className="px-6 py-5 align-top">
                          <span className="font-semibold text-white">
                            {order.orderNumber}
                          </span>

                          {order.createdAt && (
                            <p className="mt-1 text-xs text-gray-600">
                              {formatDate(order.createdAt)}
                            </p>
                          )}
                        </td>

                        {/* Batch */}
                        <td className="px-6 py-5 align-top text-sm text-gray-400">
                          {order.batch?.batchNumber ?? '-'}
                        </td>

                        {/* Product */}
                        <td className="px-6 py-5 align-top">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {order.product?.name ?? '-'}
                            </p>

                            {order.product && (
                              <p className="mt-1 text-xs text-gray-500">
                                {order.product.version} · {order.product.body}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Final output quantities: use the last process, not sums across steps */}
                        <td className="px-6 py-5 align-top text-sm text-gray-300">
                          {Number(order.quantity ?? 0).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-5 align-top text-sm text-gray-300">
                          {Number(
                            getFinalStep(order)?.quantityProcessed ?? 0,
                          ).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-5 align-top text-sm font-medium text-green-300">
                          {Number(
                            getFinalStep(order)?.quantityGood ?? 0,
                          ).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-5 align-top text-sm font-medium text-red-300">
                          {Number(
                            getFinalStep(order)?.quantityScrap ?? 0,
                          ).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-5 align-top">
                          {(() => {
                            const percent = getOrderProgress(order);
                            return (
                              <div className="min-w-[100px]">
                                <div className="mb-1 text-xs text-gray-400">
                                  {percent}%
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                                  <div
                                    className="h-full rounded-full bg-blue-500"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-5 align-top">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClass(
                              order.status,
                            )}`}
                          >
                            {formatStatus(order.status)}
                          </span>
                        </td>

                        {/* Production Steps: read-only status from backend/operator activity */}
                        <td className="px-6 py-5 align-top">
                          {!order.steps || order.steps.length === 0 ? (
                            <span className="text-xs text-gray-600">
                              No steps
                            </span>
                          ) : (
                            <div className="min-w-[220px] space-y-2">
                              {order.steps
                                .slice()
                                .sort((a, b) => a.sequence - b.sequence)
                                .map((step) => (
                                  <div
                                    key={step._id}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-blue-900/30 bg-[#070b1a] p-3"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600/20 text-xs text-blue-300">
                                        {step.sequence}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-white">
                                          {step.processName ||
                                            `Proses ${step.sequence}`}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {step.processCode || '-'}
                                        </p>
                                      </div>
                                    </div>
                                    <span
                                      className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-[11px] ${getStatusClass(step.status)}`}
                                    >
                                      {formatStatus(step.status)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </td>

                        {/* Notes */}
                        <td className="max-w-xs px-6 py-5 align-top text-sm text-gray-400">
                          <span className="line-clamp-2">
                            {order.notes || '-'}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-6 py-5 text-right align-top">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/production-orders/${order._id}`)
                              }
                              className="rounded-lg border border-blue-800/50 px-3 py-2 text-xs font-medium text-blue-400 transition hover:bg-blue-950"
                            >
                              Detail
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(order._id)}
                              disabled={deleteMutation.isPending}
                              className="rounded-lg border border-red-800/50 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </main>
    </div>
  );
}
