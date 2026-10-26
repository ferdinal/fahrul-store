'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminHeader } from '@/components/layout/AdminHeader';

import {
  fulfillCustomerOrder,
  getCustomerOrders,
  type CustomerOrder,
  type CustomerOrderItem,
} from '@/lib/api/customerOrders';

import {
  getInventoryByProduct,
  type FinishedGoodsInventory,
} from '@/lib/api/inventory';

type SortKey =
  | 'packagingCode'
  | 'orderNumber'
  | 'buyer'
  | 'version'
  | 'body'
  | 'shippingMethod'
  | 'orderCount'
  | 'quantity'
  | 'availableStock'
  | 'fulfilledQuantity'
  | 'orderBy'
  | 'status';

type SortDirection = 'asc' | 'desc';

type Filters = {
  packagingCode: string;
  orderNumber: string;
  buyer: string;
  version: string;
  body: string;
  shippingMethod: string;
  orderCount: string;
  quantity: string;
  availableStock: string;
  fulfilledQuantity: string;
  orderBy: string;
  status: string;
};

type OrderRow = {
  order: CustomerOrder;
  item: CustomerOrderItem;
  orderCount: number;
  availableStock: number;
};

type FulfillmentState = Record<string, number>;

const emptyFilters: Filters = {
  packagingCode: '',
  orderNumber: '',
  buyer: '',
  version: '',
  body: '',
  shippingMethod: '',
  orderCount: '',
  quantity: '',
  availableStock: '',
  fulfilledQuantity: '',
  orderBy: '',
  status: '',
};

function getBuyerName(order: CustomerOrder): string {
  return `${order.buyer.firstName ?? ''} ${order.buyer.lastName ?? ''}`.trim();
}

function getShippingType(value: string): string {
  return value.split(' - ')[0].trim();
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim();
}

function matchesFilter(value: unknown, filterValue: string): boolean {
  if (!filterValue.trim()) {
    return true;
  }

  return normalizeSearchValue(value).includes(
    normalizeSearchValue(filterValue),
  );
}

function compareValues(
  a: string | number,
  b: string | number,
  direction: SortDirection,
): number {
  let result = 0;

  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  return direction === 'asc' ? result : -result;
}

export default function CustomerOrderDetailsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const [sortKey, setSortKey] = useState<SortKey>('packagingCode');

  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [fulfillmentValues, setFulfillmentValues] = useState<FulfillmentState>(
    {},
  );

  const [savingFulfillment, setSavingFulfillment] = useState<
    Record<string, boolean>
  >({});

  const [message, setMessage] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /*
   * Customer Orders
   */
  const {
    data: orders = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: getCustomerOrders,
  });

  /*
   * Get unique product IDs.
   */
  const productIds = useMemo(() => {
    const ids = new Set<string>();

    for (const order of orders) {
      for (const item of order.items) {
        ids.add(item.product._id);
      }
    }

    return Array.from(ids);
  }, [orders]);

  /*
   * Inventory per product.
   */
  const { data: inventoryByProduct = {}, isLoading: isInventoryLoading } =
    useQuery({
      queryKey: ['customer-order-details-inventory', productIds],
      enabled: productIds.length > 0,
      queryFn: async () => {
        const entries = await Promise.all(
          productIds.map(async (productId) => {
            try {
              const inventory = await getInventoryByProduct(productId);

              return [productId, inventory] as const;
            } catch {
              return [productId, null] as const;
            }
          }),
        );

        return Object.fromEntries(entries) as Record<
          string,
          FinishedGoodsInventory | null
        >;
      },
    });

  /*
   * Flatten:
   *
   * 1 Customer Order
   *       ↓
   * Multiple SKU rows
   */
  const rows = useMemo<OrderRow[]>(() => {
    const result: OrderRow[] = [];

    for (const order of orders) {
      const orderCount = order.items.length;

      for (const item of order.items) {
        const inventory = inventoryByProduct[item.product._id];

        // Tanpa allocation, stok tersedia adalah quantity fisik inventory.
        const availableStock = Math.max(inventory?.quantity ?? 0, 0);

        result.push({
          order,
          item,
          orderCount,
          availableStock,
        });
      }
    }

    return result;
  }, [orders, inventoryByProduct]);

  /*
   * Filter + Search + Sort
   */
  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(search);

    const filtered = rows.filter((row) => {
      const { order, item } = row;

      const buyer = getBuyerName(order);

      const shippingType = getShippingType(order.shippingMethod);

      const searchableValues = [
        order.packagingCode,
        order.orderNumber,
        buyer,
        item.productName,
        item.productOptionName,
        item.product.version,
        item.product.body,
        shippingType,
        row.orderCount,
        item.quantity,
        row.availableStock,
        item.fulfilledQuantity,
        order.orderBy,
        order.status,
      ];

      const matchesGlobalSearch =
        !normalizedSearch ||
        searchableValues.some((value) =>
          normalizeSearchValue(value).includes(normalizedSearch),
        );

      if (!matchesGlobalSearch) {
        return false;
      }

      if (!matchesFilter(order.packagingCode, filters.packagingCode)) {
        return false;
      }

      if (!matchesFilter(order.orderNumber, filters.orderNumber)) {
        return false;
      }

      if (!matchesFilter(buyer, filters.buyer)) {
        return false;
      }

      if (!matchesFilter(item.product.version, filters.version)) {
        return false;
      }

      if (!matchesFilter(item.product.body, filters.body)) {
        return false;
      }

      if (!matchesFilter(shippingType, filters.shippingMethod)) {
        return false;
      }

      if (!matchesFilter(row.orderCount, filters.orderCount)) {
        return false;
      }

      if (!matchesFilter(item.quantity, filters.quantity)) {
        return false;
      }

      if (!matchesFilter(row.availableStock, filters.availableStock)) {
        return false;
      }

      if (!matchesFilter(item.fulfilledQuantity, filters.fulfilledQuantity)) {
        return false;
      }

      if (!matchesFilter(order.orderBy, filters.orderBy)) {
        return false;
      }

      if (!matchesFilter(order.status, filters.status)) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortKey) {
        case 'packagingCode':
          aValue = a.order.packagingCode;
          bValue = b.order.packagingCode;
          break;

        case 'orderNumber':
          aValue = a.order.orderNumber;
          bValue = b.order.orderNumber;
          break;

        case 'buyer':
          aValue = getBuyerName(a.order);
          bValue = getBuyerName(b.order);
          break;

        case 'version':
          aValue = a.item.product.version;
          bValue = b.item.product.version;
          break;

        case 'body':
          aValue = a.item.product.body;
          bValue = b.item.product.body;
          break;

        case 'shippingMethod':
          aValue = getShippingType(a.order.shippingMethod);
          bValue = getShippingType(b.order.shippingMethod);
          break;

        case 'orderCount':
          aValue = a.orderCount;
          bValue = b.orderCount;
          break;

        case 'quantity':
          aValue = a.item.quantity;
          bValue = b.item.quantity;
          break;

        case 'availableStock':
          aValue = a.availableStock;
          bValue = b.availableStock;
          break;

        case 'fulfilledQuantity':
          aValue = a.item.fulfilledQuantity;
          bValue = b.item.fulfilledQuantity;
          break;

        case 'orderBy':
          aValue = a.order.orderBy;
          bValue = b.order.orderBy;
          break;

        case 'status':
          aValue = a.order.status;
          bValue = b.order.status;
          break;

        default:
          aValue = '';
          bValue = '';
      }

      return compareValues(aValue, bValue, sortDirection);
    });
  }, [rows, search, filters, sortKey, sortDirection]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));

      return;
    }

    setSortKey(key);
    setSortDirection('asc');
  }

  function renderSortIndicator(key: SortKey) {
    if (sortKey !== key) {
      return <span className="ml-1 text-slate-500">↕</span>;
    }

    return (
      <span className="ml-1 text-blue-400">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  }

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function clearFilters() {
    setSearch('');
    setFilters(emptyFilters);
  }

  function handleFulfillmentChange(itemId: string, value: string) {
    if (value.trim() === '') {
      setFulfillmentValues((current) => ({ ...current, [itemId]: 0 }));
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    setFulfillmentValues((current) => ({
      ...current,
      [itemId]: Math.max(Math.floor(parsed), 0),
    }));
  }

  /*
   * Save Fulfillment
   */
  async function handleSaveFulfillment(row: OrderRow) {
    const itemId = row.item._id;
    const newQuantity =
      fulfillmentValues[itemId] ?? row.item.fulfilledQuantity ?? 0;
    const oldQuantity = row.item.fulfilledQuantity ?? 0;

    if (!Number.isInteger(newQuantity) || newQuantity < 0) {
      setErrorMessage(
        'Fulfillment quantity harus berupa angka bulat dan tidak boleh negatif.',
      );
      return;
    }

    if (newQuantity > row.item.quantity) {
      setErrorMessage(
        `Fulfillment untuk ${row.item.productName} tidak boleh lebih dari ${row.item.quantity}.`,
      );
      return;
    }

    if (newQuantity === oldQuantity) return;

    setErrorMessage(null);
    setMessage(null);
    setSavingFulfillment((current) => ({ ...current, [itemId]: true }));

    try {
      // API menerima jumlah fulfillment akhir, bukan delta.
      await fulfillCustomerOrder(row.order._id, {
        items: [{ itemId, quantity: newQuantity }],
      });

      await queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      await queryClient.invalidateQueries({
        queryKey: ['customer-order-details-inventory'],
      });
      setFulfillmentValues((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      setMessage(`Fulfillment ${row.item.productName} berhasil disimpan.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Gagal menyimpan fulfillment.',
      );
    } finally {
      setSavingFulfillment((current) => ({ ...current, [itemId]: false }));
    }
  }

  /*
   * Loading
   */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Customer Order Details"
          subtitle="Review customer orders and manage fulfillment."
        />

        <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8">
            Loading Customer Order Details...
          </div>
        </main>
      </div>
    );
  }

  /*
   * Error
   */
  if (isError) {
    return (
      <div className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Customer Order Details"
          subtitle="Review customer orders and manage fulfillment."
        />

        <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
            <h1 className="text-lg font-semibold">
              Failed to load Customer Orders
            </h1>

            <p className="mt-2 text-sm">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Customer Order Details"
        subtitle="Review customer orders and manage fulfillment."
      />

      <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Orders</h1>

            <p className="mt-1 text-sm text-slate-400">
              Manage fulfillment directly from the customer order table.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({
                queryKey: ['customer-orders'],
              });

              queryClient.invalidateQueries({
                queryKey: ['customer-order-details-inventory'],
              });
            }}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Refresh
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="flex-1">
              <label
                htmlFor="customer-order-search"
                className="mb-1 block text-xs font-medium text-slate-400"
              >
                Search
              </label>

              <input
                id="customer-order-search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search packing no, order no, buyer, version, body, shipping, SKU, order by, status..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorMessage}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <div className="overflow-x-auto">
            <table className="min-w-[1800px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950">
                  {[
                    ['packagingCode', 'Packing No.'],
                    ['orderNumber', 'Order No.'],
                    ['buyer', 'Buyer'],
                    ['version', 'Version'],
                    ['body', 'Body'],
                    ['shippingMethod', 'Shipping Type'],
                    ['orderCount', 'Order Count'],
                    ['quantity', 'Unit Quantity'],
                    ['availableStock', 'Available Stock'],
                    ['fulfilledQuantity', 'Fulfilled'],
                    ['orderBy', 'Order By'],
                    ['status', 'Status'],
                  ].map(([key, label]) => (
                    <th
                      key={key}
                      className="min-w-[130px] border-r border-slate-800 p-2 align-top"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(key as SortKey)}
                        className="mb-2 flex w-full items-center text-left font-semibold text-white"
                      >
                        {label}
                        {renderSortIndicator(key as SortKey)}
                      </button>

                      <input
                        type="text"
                        value={filters[key as keyof Filters]}
                        onChange={(event) =>
                          updateFilter(key as keyof Filters, event.target.value)
                        }
                        placeholder="Filter"
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                      />
                    </th>
                  ))}

                  <th className="min-w-[150px] p-2 align-top">
                    <div className="font-semibold text-white">Fulfill</div>

                    <div className="mt-2 text-xs text-slate-500">
                      Save fulfillment
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="p-10 text-center text-slate-500"
                    >
                      {rows.length === 0
                        ? 'No Customer Orders found.'
                        : 'No rows match the current search/filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const { order, item, orderCount, availableStock } = row;

                    const fulfillment =
                      fulfillmentValues[item._id] ??
                      item.fulfilledQuantity ??
                      0;

                    const fulfillmentSaving =
                      savingFulfillment[item._id] ?? false;
                    const isFullyFulfilled =
                      item.fulfilledQuantity >= item.quantity;

                    const buyer = getBuyerName(order);

                    const shippingType = getShippingType(order.shippingMethod);

                    return (
                      <tr
                        key={`${order._id}-${item._id}`}
                        className={`border-b border-slate-800 transition ${
                          isFullyFulfilled
                            ? 'bg-slate-950/40'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="border-r border-slate-800 p-3 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/customer-orders/${order._id}`)
                            }
                            className="font-medium text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            {order.packagingCode}
                          </button>
                        </td>

                        <td className="border-r border-slate-800 p-3 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/customer-orders/${order._id}`)
                            }
                            className="text-left font-medium text-white hover:text-blue-300 hover:underline"
                          >
                            {order.orderNumber}
                          </button>
                        </td>

                        <td className="border-r border-slate-800 p-3 align-top">
                          <div className="font-medium text-white">
                            {buyer || '-'}
                          </div>

                          {order.buyer.email && (
                            <div className="mt-1 text-xs text-slate-500">
                              {order.buyer.email}
                            </div>
                          )}
                        </td>

                        <td className="border-r border-slate-800 p-3 align-top text-slate-300">
                          {item.product.version || '-'}
                        </td>

                        <td className="border-r border-slate-800 p-3 align-top text-slate-300">
                          <div className="max-w-[220px] whitespace-normal">
                            {item.product.body || '-'}
                          </div>
                        </td>

                        <td className="border-r border-slate-800 p-3 align-top">
                          <span className="text-slate-300">
                            {shippingType || '-'}
                          </span>
                        </td>

                        <td className="border-r border-slate-800 p-3 text-center align-top text-slate-300">
                          {orderCount}
                        </td>

                        <td className="border-r border-slate-800 p-3 text-center align-top">
                          <span className="font-medium text-white">
                            {item.quantity}
                          </span>
                        </td>

                        <td className="border-r border-slate-800 p-3 text-center align-top">
                          <span
                            className={
                              availableStock > 0
                                ? 'font-medium text-green-400'
                                : 'font-medium text-red-400'
                            }
                          >
                            {isInventoryLoading ? '...' : availableStock}
                          </span>
                        </td>

                        <td className="border-r border-slate-800 p-3 align-top">
                          <div className="space-y-2">
                            <input
                              type="number"
                              min={0}
                              max={Math.min(
                                item.quantity,
                                fulfillment + availableStock,
                              )}
                              value={fulfillment}
                              disabled={
                                availableStock <= 0 || fulfillmentSaving
                              }
                              onChange={(event) =>
                                handleFulfillmentChange(
                                  item._id,
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-40"
                            />

                            <div className="text-center text-xs text-slate-500">
                              Current: {item.fulfilledQuantity}
                            </div>
                          </div>
                        </td>

                        <td className="border-r border-slate-800 p-3 align-top">
                          <span className="inline-flex rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                            {order.orderBy || '-'}
                          </span>
                        </td>

                        <td className="border-r border-slate-800 p-3 align-top">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                              order.status === 'fulfilled'
                                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                                : order.status === 'cancelled'
                                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                  : 'border-slate-700 bg-slate-800 text-slate-300'
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>

                        <td className="p-3 align-top">
                          <button
                            type="button"
                            disabled={
                              fulfillmentSaving ||
                              fulfillment === item.fulfilledQuantity
                            }
                            onClick={() => handleSaveFulfillment(row)}
                            className="w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {fulfillmentSaving
                              ? 'Saving...'
                              : 'Save Fulfillment'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Showing{' '}
              <span className="font-medium text-slate-300">
                {filteredRows.length}
              </span>{' '}
              of{' '}
              <span className="font-medium text-slate-300">{rows.length}</span>{' '}
              SKU rows
            </div>

            <div>{orders.length} Customer Orders</div>
          </div>
        </div>
      </main>
    </div>
  );
}
