'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

import { AdminHeader } from '@/components/layout/AdminHeader';
import { DatePicker } from '@/components/ui/DatePicker';

import {
  deleteCustomerOrder,
  getCustomerOrders,
  updateCustomerOrderStatus,
  type CustomerOrderStatus,
} from '@/lib/api/customerOrders';

import { customerOrderKeys } from '@/lib/api/customerOrderKeys';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatDateOnly(value: string | Date | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getFulfillmentWarning(
  fulfillmentDueDate: string | Date,
  status: CustomerOrderStatus,
): { label: string; className: string } | null {
  if (status !== 'pending') {
    return null;
  }

  const dueDate = new Date(fulfillmentDueDate);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const today = new Date();

  // Bandingkan tanggal saja, tanpa jam.
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const daysRemaining = Math.round(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysRemaining < 0) {
    return {
      label: `Terlambat ${Math.abs(daysRemaining)} hari`,
      className: 'border-red-800/50 bg-red-950/30 text-red-400',
    };
  }

  if (daysRemaining === 0) {
    return {
      label: 'Jatuh tempo hari ini',
      className: 'border-red-800/50 bg-red-950/30 text-red-400',
    };
  }

  if (daysRemaining === 1) {
    return {
      label: 'Jatuh tempo besok',
      className: 'border-yellow-800/50 bg-yellow-950/30 text-yellow-400',
    };
  }

  return null;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}

function formatShippingMethod(value: string) {
  if (!value) {
    return '-';
  }

  return value.split(' - ')[0]?.trim() || value;
}

function getStatusClass(status: CustomerOrderStatus) {
  switch (status) {
    case 'pending':
      return 'border-yellow-800/50 bg-yellow-950/30 text-yellow-400';

    case 'fulfilled':
      return 'border-green-800/50 bg-green-950/30 text-green-400';

    case 'cancelled':
      return 'border-red-800/50 bg-red-950/30 text-red-400';

    case 'partial':
      return 'border-orange-800/50 bg-orange-950/30 text-orange-400';

    case 'delivered':
      return 'border-blue-800/50 bg-blue-950/30 text-blue-400';

    case 'completed':
      return 'border-purple-800/50 bg-purple-950/30 text-purple-400';

    default:
      return 'border-gray-800 bg-gray-900/30 text-gray-400';
  }
}

function getStatusLabel(status: CustomerOrderStatus) {
  switch (status) {
    case 'pending':
      return 'Pending';

    case 'fulfilled':
      return 'Fulfilled';

    case 'cancelled':
      return 'Cancelled';

    case 'partial':
      return 'Partial';

    case 'delivered':
      return 'Delivered';

    case 'completed':
      return 'Completed';

    default:
      return status;
  }
}

export default function CustomerOrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');

  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');
  const [completedOrder, setCompletedOrder] = useState<{
    id: string;
    orderNumber: string;
  } | null>(null);

  const [completionNotes, setCompletionNotes] = useState('');

  const ordersQuery = useQuery({
    queryKey: customerOrderKeys.list(),
    queryFn: getCustomerOrders,
  });

  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return orders.filter((order) => {
      const searchableValues = [
        order.orderNumber,
        order.packagingCode,
        order.orderBy,
        order.buyer.firstName,
        order.buyer.lastName,
        [order.buyer.firstName, order.buyer.lastName].filter(Boolean).join(' '),
        order.buyer.email,
        order.buyer.phone,
        order.shippingMethod,
        order.status,
      ];

      const matchesSearch =
        !keyword ||
        searchableValues.some((value) =>
          value?.toLowerCase().includes(keyword),
        );

      const orderDate = formatDateOnly(order.orderDate);

      const matchesFrom =
        !orderDateFrom || (orderDate !== '' && orderDate >= orderDateFrom);

      const matchesTo =
        !orderDateTo || (orderDate !== '' && orderDate <= orderDateTo);

      return matchesSearch && matchesFrom && matchesTo;
    });
  }, [orders, search, orderDateFrom, orderDateTo]);

  const deleteMutation = useMutation({
    mutationFn: deleteCustomerOrder,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: customerOrderKeys.list(),
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: {
      id: string;
      status: 'delivered' | 'completed';
      completionNotes?: string;
    }) =>
      updateCustomerOrderStatus(input.id, {
        status: input.status,
        completionNotes: input.completionNotes,
      }),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: customerOrderKeys.list(),
      });

      setCompletedOrder(null);
      setCompletionNotes('');
    },

    onError: (error) => {
      window.alert(
        error instanceof Error
          ? error.message
          : 'Gagal memperbarui status customer order.',
      );
    },
  });

  const hasFilter =
    search.trim() !== '' || orderDateFrom !== '' || orderDateTo !== '';

  function clearFilters() {
    setSearch('');
    setOrderDateFrom('');
    setOrderDateTo('');
  }

  function handleDelete(id: string, orderNumber: string) {
    const confirmed = window.confirm(`Hapus customer order ${orderNumber}?`);

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(id);
  }

  function handleExportExcel() {
    const rows = filteredOrders.flatMap((order) => {
      return order.items.map((item) => ({
        'Order Number': order.orderNumber,

        'Packaging Code': order.packagingCode,

        'Order Date': formatDate(order.orderDate),

        'Fulfillment Due': formatDate(order.fulfillmentDueDate),

        Buyer: [order.buyer.firstName, order.buyer.lastName]
          .filter(Boolean)
          .join(' '),

        Email: order.buyer.email || '',

        'Payment Status': order.paymentStatus || '',

        'Order Status': getStatusLabel(order.status),

        'Shipping Status': order.shippingStatus || '',

        'Shipping Method': order.shippingMethod || '',

        Product: item.productName,

        'Product Option': item.productOptionName || '',

        Quantity: item.quantity,

        'Allocated Quantity': item.allocatedQuantity,

        'Fulfilled Quantity': item.fulfilledQuantity,

        'Remaining Quantity': Math.max(
          item.quantity - item.fulfilledQuantity,
          0,
        ),

        Price: item.price,

        'Item Total': item.total,

        Currency: order.currency,

        Subtotal: order.subtotal,

        'Shipping Cost': order.shippingCost,

        Tax: order.tax,

        Discount: order.discount,

        'Order Total': order.total,

        'Shipping Address': order.shippingAddress || '',

        Note: order.note || '',
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 18 }, // Order Number
      { wch: 18 }, // Packaging Code
      { wch: 16 }, // Order Date
      { wch: 18 }, // Fulfillment Due
      { wch: 24 }, // Buyer
      { wch: 30 }, // Email
      { wch: 16 }, // Payment Status
      { wch: 16 }, // Order Status
      { wch: 18 }, // Shipping Status
      { wch: 18 }, // Shipping Method
      { wch: 32 }, // Product
      { wch: 24 }, // Product Option
      { wch: 12 }, // Quantity
      { wch: 18 }, // Allocated Quantity
      { wch: 18 }, // Fulfilled Quantity
      { wch: 18 }, // Remaining Quantity
      { wch: 14 }, // Price
      { wch: 16 }, // Item Total
      { wch: 12 }, // Currency
      { wch: 14 }, // Subtotal
      { wch: 14 }, // Shipping Cost
      { wch: 14 }, // Tax
      { wch: 14 }, // Discount
      { wch: 14 }, // Order Total
      { wch: 35 }, // Shipping Address
      { wch: 40 }, // Note
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Orders');

    XLSX.writeFile(
      workbook,
      `customer-orders-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Customer Orders"
        subtitle="Manage customer orders and fulfillment."
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Customer Orders</h2>

            <p className="mt-1 text-sm text-gray-500">
              Manage customer orders from your sales channel.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push('/customer-orders/import')}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              + Import CSV
            </button>

            <button
              type="button"
              onClick={() => router.push('/customer-orders/new')}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              + New Order
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-900/40 bg-[#0a1024] p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto_auto] lg:items-end">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Search Order
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari order, packaging, buyer, email, shipping..."
                className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Order Date From
              </label>

              <DatePicker
                value={orderDateFrom}
                onChange={setOrderDateFrom}
                placeholder="Pilih tanggal awal"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Order Date To
              </label>

              <DatePicker
                value={orderDateTo}
                onChange={setOrderDateTo}
                placeholder="Pilih tanggal akhir"
                disabled={(date) => {
                  if (!orderDateFrom) {
                    return false;
                  }

                  const startDate = new Date(`${orderDateFrom}T00:00:00`);

                  return date < startDate;
                }}
              />
            </div>

            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasFilter}
              className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredOrders.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export Excel
            </button>
          </div>

          {hasFilter && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>
                {filteredOrders.length} dari {orders.length} order
              </span>

              {search.trim() && (
                <>
                  <span>·</span>

                  <span>
                    Order: <span className="text-gray-300">{search}</span>
                  </span>
                </>
              )}

              {orderDateFrom && (
                <>
                  <span>·</span>

                  <span>
                    From: <span className="text-gray-300">{orderDateFrom}</span>
                  </span>
                </>
              )}

              {orderDateTo && (
                <>
                  <span>·</span>

                  <span>
                    To: <span className="text-gray-300">{orderDateTo}</span>
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {ordersQuery.isLoading && (
          <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6 text-sm text-gray-400">
            Loading customer orders...
          </div>
        )}

        {ordersQuery.isError && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-sm text-red-400">
            {ordersQuery.error instanceof Error
              ? ordersQuery.error.message
              : 'Failed to load customer orders.'}
          </div>
        )}

        {!ordersQuery.isLoading &&
          !ordersQuery.isError &&
          orders.length === 0 && (
            <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-8 text-center">
              <p className="text-gray-400">Belum ada customer order.</p>

              <button
                type="button"
                onClick={() => router.push('/customer-orders/new')}
                className="mt-4 rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
              >
                Buat Order
              </button>
            </div>
          )}

        {!ordersQuery.isLoading &&
          !ordersQuery.isError &&
          orders.length > 0 &&
          filteredOrders.length === 0 && (
            <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-8 text-center">
              <div className="text-4xl">🔍</div>

              <h3 className="mt-4 font-semibold">Order tidak ditemukan</h3>

              <p className="mt-2 text-sm text-gray-500">
                Tidak ada customer order yang sesuai dengan filter.
              </p>

              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-lg border border-blue-800/50 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-950"
              >
                Clear Filter
              </button>
            </div>
          )}

        {!ordersQuery.isLoading &&
          !ordersQuery.isError &&
          filteredOrders.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-left">
                  <thead className="border-b border-blue-900/40 bg-blue-950/20">
                    <tr>
                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Order
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Order By
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Packaging
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Buyer
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Shipping
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Note
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Order Date
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Fulfillment Due
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Items
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Total
                      </th>

                      <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Status
                      </th>

                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-blue-900/20">
                    {filteredOrders.map((order) => (
                      <tr
                        key={order._id}
                        className="transition hover:bg-blue-950/20"
                      >
                        {/* Order */}
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/customer-orders/${order._id}`)
                            }
                            className="text-left"
                          >
                            <p className="font-semibold text-blue-300 transition hover:text-blue-200 hover:underline">
                              {order.orderNumber}
                            </p>
                          </button>

                          <p className="mt-1 text-xs text-gray-600">
                            {order.paymentStatus || 'Payment status unknown'}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full border border-purple-800/50 bg-purple-950/30 px-3 py-1.5 text-xs font-medium text-purple-300">
                            {order.orderBy || '-'}
                          </span>
                        </td>

                        {/* Packaging */}
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-md border border-blue-800/50 bg-blue-950/30 px-3 py-1.5 font-mono text-sm font-semibold text-blue-300">
                            {order.packagingCode}
                          </span>
                        </td>

                        {/* Buyer */}
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-200">
                            {[order.buyer.firstName, order.buyer.lastName]
                              .filter(Boolean)
                              .join(' ') || '-'}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {order.buyer.email || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-300">
                            {formatShippingMethod(order.shippingMethod)}
                          </p>
                        </td>

                        {/* Note */}
                        <td className="px-4 py-4">
                          <p
                            className="max-w-56 whitespace-pre-wrap break-words text-sm text-gray-300"
                            title={order.note || ''}
                          >
                            {order.note?.trim() || '-'}
                          </p>
                        </td>

                        {/* Order Date */}
                        <td className="px-4 py-4 text-sm text-gray-300">
                          {formatDate(order.orderDate)}
                        </td>

                        {/* Fulfillment Due */}
                        {/* Fulfillment Due */}
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-300">
                            {formatDate(order.fulfillmentDueDate)}
                          </p>

                          {(() => {
                            const warning = getFulfillmentWarning(
                              order.fulfillmentDueDate,
                              order.status,
                            );

                            if (!warning) {
                              return null;
                            }

                            return (
                              <span
                                className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${warning.className}`}
                              >
                                ⚠ {warning.label}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Items */}
                        <td className="px-4 py-4">
                          <p className="text-sm font-medium text-white">
                            {order.items.length}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {order.items.reduce(
                              (total, item) => total + item.quantity,
                              0,
                            )}{' '}
                            units
                          </p>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-4 text-sm font-medium text-white">
                          {formatCurrency(order.total, order.currency)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClass(
                              order.status,
                            )}`}
                          >
                            {getStatusLabel(order.status)}
                          </span>
                          {order.status === 'completed' &&
                            order.completionNotes?.trim() && (
                              <p className="mt-2 max-w-48 whitespace-normal text-xs text-gray-400">
                                <span className="font-medium text-gray-300">
                                  Completion Notes:
                                </span>{' '}
                                {order.completionNotes}
                              </p>
                            )}

                          {/* Completed At */}
                          {order.status === 'completed' &&
                            order.completedAt && (
                              <p className="mt-2 text-xs text-gray-400">
                                <span className="font-medium text-gray-300">
                                  Completed At:
                                </span>{' '}
                                {new Intl.DateTimeFormat('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }).format(new Date(order.completedAt))}
                              </p>
                            )}
                        </td>

                        {/* Action */}
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {order.status === 'fulfilled' && (
                              <button
                                type="button"
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: order._id,
                                    status: 'delivered',
                                  })
                                }
                                disabled={statusMutation.isPending}
                                className="rounded-lg border border-blue-800/50 px-3 py-2 text-xs font-medium text-blue-300 transition hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Delivered
                              </button>
                            )}

                            {order.status === 'delivered' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCompletedOrder({
                                    id: order._id,
                                    orderNumber: order.orderNumber,
                                  });
                                  setCompletionNotes('');
                                }}
                                disabled={statusMutation.isPending}
                                className="rounded-lg border border-emerald-800/50 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Completed
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/customer-orders/${order._id}`)
                              }
                              className="rounded-lg border border-blue-800/50 px-3 py-2 text-xs font-medium text-blue-300 transition hover:bg-blue-950"
                            >
                              Detail
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDelete(order._id, order.orderNumber)
                              }
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
            </div>
          )}

        {completedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-xl border border-blue-900/50 bg-[#0a1024] p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white">
                Complete Customer Order
              </h3>

              <p className="mt-2 text-sm text-gray-400">
                Order: {completedOrder.orderNumber}
              </p>

              <label
                htmlFor="completionNotes"
                className="mb-2 mt-5 block text-sm font-medium text-gray-300"
              >
                Completion Notes (optional)
              </label>

              <textarea
                id="completionNotes"
                value={completionNotes}
                onChange={(event) => setCompletionNotes(event.target.value)}
                placeholder="Tambahkan catatan penyelesaian jika diperlukan..."
                rows={4}
                className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-blue-500"
              />

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCompletedOrder(null);
                    setCompletionNotes('');
                  }}
                  disabled={statusMutation.isPending}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!completedOrder) return;

                    statusMutation.mutate({
                      id: completedOrder.id,
                      status: 'completed',
                      completionNotes: completionNotes.trim(),
                    });
                  }}
                  disabled={statusMutation.isPending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Saving...' : 'Confirm Completed'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
