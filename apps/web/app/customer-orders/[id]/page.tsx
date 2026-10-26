'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { AdminHeader } from '@/components/layout/AdminHeader';

import {
  fulfillCustomerOrder,
  getCustomerOrder,
  updateCustomerOrder,
} from '@/lib/api/customerOrders';
import { getProducts, type Product } from '@/lib/api/products';

import { customerOrderKeys } from '@/lib/api/customerOrderKeys';

import {
  getInventoryByProduct,
  type FinishedGoodsInventory,
} from '@/lib/api/inventory';

type EditableOrderItem = {
  product: string;
  quantity: string;
  price: string;
};

type EditableOrderForm = {
  orderNumber: string;
  orderBy: string;
  orderDate: string;
  fulfillmentDueDate: string;
  status: 'pending' | 'partial' | 'fulfilled' | 'cancelled';
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  paymentStatus: string;
  shippingStatus: string;
  shippingMethod: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  currency: string;
  shippingCost: string;
  tax: string;
  discount: string;
  note: string;
  items: EditableOrderItem[];
};

const ORDER_SOURCES = [
  'Big cartel',
  'Shopee internasional',
  'Shopee Indonesia',
  'Tiktok',
  'Etsy',
  'Complain',
  'Additional Order',
] as const;

interface CustomerOrderDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}

function getStatusClass(
  status:
    | 'pending'
    | 'fulfilled'
    | 'cancelled'
    | 'partial'
    | 'delivered'
    | 'completed',
) {
  switch (status) {
    case 'pending':
      return 'border-yellow-800/50 bg-yellow-950/30 text-yellow-400';

    case 'fulfilled':
      return 'border-green-800/50 bg-green-950/30 text-green-400';

    case 'cancelled':
      return 'border-red-800/50 bg-red-950/30 text-red-400';

    default:
      return 'border-gray-800 bg-gray-900/30 text-gray-400';
  }
}

export default function CustomerOrderDetailPage({
  params,
}: CustomerOrderDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { id } = use(params);

  const [fulfillQuantities, setFulfillQuantities] = useState<
    Record<string, string>
  >({});
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [editForm, setEditForm] = useState<EditableOrderForm | null>(null);
  const [productSearch, setProductSearch] = useState<Record<number, string>>(
    {},
  );
  const [productDropdownOpen, setProductDropdownOpen] = useState<
    Record<number, boolean>
  >({});

  const [fulfillmentError, setFulfillmentError] = useState('');

  const [fulfillmentSuccess, setFulfillmentSuccess] = useState('');

  const orderQuery = useQuery({
    queryKey: customerOrderKeys.detail(id),
    queryFn: () => getCustomerOrder(id),
  });

  const order = orderQuery.data;

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
    enabled: editOpen,
  });

  function openEditOrder() {
    if (!order) return;
    setEditError('');
    setEditSuccess('');
    setEditForm({
      orderNumber: order.orderNumber,
      orderBy: order.orderBy ?? 'Big cartel',
      orderDate: new Date(order.orderDate).toISOString().slice(0, 10),
      fulfillmentDueDate: new Date(order.fulfillmentDueDate)
        .toISOString()
        .slice(0, 10),
      status: order.status as EditableOrderForm['status'],
      buyerFirstName: order.buyer.firstName ?? '',
      buyerLastName: order.buyer.lastName ?? '',
      buyerEmail: order.buyer.email ?? '',
      buyerPhone: order.buyer.phone ?? '',
      paymentStatus: order.paymentStatus ?? '',
      shippingStatus: order.shippingStatus ?? '',
      shippingMethod: order.shippingMethod ?? 'regular',
      address1: order.shippingAddress.address1 ?? '',
      address2: order.shippingAddress.address2 ?? '',
      city: order.shippingAddress.city ?? '',
      state: order.shippingAddress.state ?? '',
      zip: order.shippingAddress.zip ?? '',
      country: order.shippingAddress.country ?? '',
      currency: order.currency ?? 'USD',
      shippingCost: String(order.shippingCost ?? 0),
      tax: String(order.tax ?? 0),
      discount: String(order.discount ?? 0),
      note: order.note ?? '',
      items: order.items.map((item) => ({
        product: item.product._id,
        quantity: String(item.quantity),
        price: String(item.price),
      })),
    });
    setEditOpen(true);
  }

  function updateEditForm(key: keyof EditableOrderForm, value: string) {
    setEditForm((current) =>
      current ? ({ ...current, [key]: value } as EditableOrderForm) : current,
    );
  }

  function updateEditItem(
    index: number,
    key: keyof EditableOrderItem,
    value: string,
  ) {
    setEditForm((current) => {
      if (!current) return current;
      const items = [...current.items];
      items[index] = { ...items[index], [key]: value };
      return { ...current, items };
    });
  }

  function addEditItem() {
    setEditForm((current) =>
      current
        ? {
            ...current,
            items: [
              ...current.items,
              { product: '', quantity: '1', price: '0' },
            ],
          }
        : current,
    );
  }

  function removeEditItem(index: number) {
    setEditForm((current) =>
      current
        ? { ...current, items: current.items.filter((_, i) => i !== index) }
        : current,
    );
  }

  async function saveEditedOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || !editForm) return;
    setEditError('');
    setEditSuccess('');

    if (
      !editForm.orderNumber.trim() ||
      !editForm.orderDate ||
      !editForm.fulfillmentDueDate ||
      !editForm.buyerFirstName.trim() ||
      !editForm.buyerEmail.trim()
    ) {
      setEditError('Order number, tanggal, nama buyer, dan email wajib diisi.');
      return;
    }
    if (
      !editForm.items.length ||
      editForm.items.some(
        (item) =>
          !item.product ||
          !Number.isInteger(Number(item.quantity)) ||
          Number(item.quantity) < 1 ||
          !Number.isFinite(Number(item.price)) ||
          Number(item.price) < 0,
      )
    ) {
      setEditError(
        'Setiap item harus memiliki product, quantity bulat minimal 1, dan harga tidak negatif.',
      );
      return;
    }
    const hasFulfilledUnits = order.items.some(
      (item) => (item.fulfilledQuantity ?? 0) > 0,
    );
    const originalItems = order.items.map((item) => ({
      product: item.product._id,
      quantity: item.quantity,
    }));
    const nextItems = editForm.items.map((item) => ({
      product: item.product,
      quantity: Number(item.quantity),
    }));
    const itemsChanged =
      JSON.stringify(originalItems) !== JSON.stringify(nextItems);
    if (hasFulfilledUnits && itemsChanged) {
      setEditError(
        'Product atau quantity tidak bisa diubah karena order sudah memiliki fulfillment. Ubah field lainnya saja agar stok tetap akurat.',
      );
      return;
    }

    const productMap = new Map(
      (productsQuery.data ?? []).map((product: Product) => [
        product._id,
        product,
      ]),
    );
    const items = editForm.items.map((item) => {
      const product =
        productMap.get(item.product) ??
        order.items.find((old) => old.product._id === item.product)?.product;
      if (!product) throw new Error('Product tidak ditemukan.');
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      return {
        product: item.product,
        productName: product.name,
        productOptionName: product.version || product.body || product.name,
        quantity,
        fulfilledQuantity:
          order.items.find((old) => old.product._id === item.product)
            ?.fulfilledQuantity ?? 0,
        price,
        total: quantity * price,
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const shippingCost = Number(editForm.shippingCost);
    const tax = Number(editForm.tax);
    const discount = Number(editForm.discount);
    if (
      [shippingCost, tax, discount].some(
        (value) => !Number.isFinite(value) || value < 0,
      )
    ) {
      setEditError('Shipping, tax, dan discount harus angka nol atau lebih.');
      return;
    }

    try {
      await updateCustomerOrder(id, {
        orderNumber: editForm.orderNumber.trim(),
        orderBy: editForm.orderBy,
        buyer: {
          firstName: editForm.buyerFirstName.trim(),
          lastName: editForm.buyerLastName.trim(),
          email: editForm.buyerEmail.trim(),
          phone: editForm.buyerPhone.trim(),
        },
        orderDate: editForm.orderDate,
        fulfillmentDueDate: editForm.fulfillmentDueDate,
        status: editForm.status,
        paymentStatus: editForm.paymentStatus,
        shippingStatus: editForm.shippingStatus,
        shippingMethod: editForm.shippingMethod,
        shippingAddress: {
          address1: editForm.address1,
          address2: editForm.address2,
          city: editForm.city,
          state: editForm.state,
          zip: editForm.zip,
          country: editForm.country,
        },
        currency: editForm.currency,
        subtotal,
        shippingCost,
        tax,
        discount,
        total: subtotal + shippingCost + tax - discount,
        note: editForm.note,
        items,
      });
      setEditOpen(false);
      setEditSuccess('Customer Order berhasil diperbarui.');
      await queryClient.invalidateQueries({
        queryKey: customerOrderKeys.detail(id),
      });
      await queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      await queryClient.invalidateQueries({
        queryKey: ['customer-order-inventory', id],
      });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan perubahan order.',
      );
    }
  }

  const inventoryQueries = useQuery({
    queryKey: ['customer-order-inventory', id],
    enabled: Boolean(order),
    queryFn: async () => {
      if (!order) {
        return {};
      }

      const entries = await Promise.all(
        order.items.map(async (item) => {
          try {
            const inventory = await getInventoryByProduct(item.product._id);

            return [item.product._id, inventory] as const;
          } catch {
            return [item.product._id, null] as const;
          }
        }),
      );

      return Object.fromEntries(entries) as Record<
        string,
        FinishedGoodsInventory | null
      >;
    },
  });

  /**
   * Fulfillment quantity adalah jumlah akhir yang diinginkan per item.
   * Nilai 0 diperbolehkan untuk mengembalikan seluruh stok fulfillment.
   */
  const fulfillmentMutation = useMutation({
    mutationFn: () => {
      if (!order) {
        throw new Error('Customer order tidak tersedia');
      }

      const items = order.items
        .map((item) => {
          const value = fulfillQuantities[item._id];
          if (value === undefined || value === '') return null;

          return {
            itemId: item._id,
            quantity: Number(value),
          };
        })
        .filter(
          (item): item is { itemId: string; quantity: number } => item !== null,
        );

      if (items.length === 0) {
        throw new Error('Ubah minimal satu quantity fulfillment.');
      }

      return fulfillCustomerOrder(id, { items });
    },

    onSuccess: async () => {
      setFulfillQuantities({});
      setFulfillmentError('');
      setFulfillmentSuccess('Customer order berhasil diperbarui.');

      await queryClient.invalidateQueries({
        queryKey: customerOrderKeys.detail(id),
      });
      await queryClient.invalidateQueries({
        queryKey: ['customer-order-inventory', id],
      });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
    },

    onError: (error) => {
      setFulfillmentSuccess('');
      setFulfillmentError(
        error instanceof Error
          ? error.message
          : 'Gagal memperbarui fulfillment.',
      );
    },
  });

  function updateFulfillQuantity(
    itemId: string,
    value: string,
    maxQuantity: number,
  ) {
    if (value === '') {
      setFulfillQuantities((current) => ({ ...current, [itemId]: '' }));
      setFulfillmentError('');
      setFulfillmentSuccess('');
      return;
    }

    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) return;

    setFulfillQuantities((current) => ({
      ...current,
      [itemId]: String(Math.min(number, maxQuantity)),
    }));
    setFulfillmentError('');
    setFulfillmentSuccess('');
  }

  function handleFulfill() {
    setFulfillmentError('');
    setFulfillmentSuccess('');

    if (!order) return;

    for (const item of order.items) {
      const value = fulfillQuantities[item._id];
      if (value === undefined || value === '') continue;

      const quantity = Number(value);
      if (!Number.isInteger(quantity) || quantity < 0) {
        setFulfillmentError(
          `Quantity ${item.product.name} harus berupa angka bulat >= 0.`,
        );
        return;
      }

      if (quantity > item.quantity) {
        setFulfillmentError(
          `Quantity fulfillment ${item.product.name} tidak boleh melebihi jumlah order (${item.quantity}).`,
        );
        return;
      }

      const currentFulfilled = item.fulfilledQuantity ?? 0;
      const delta = quantity - currentFulfilled;
      const stock = inventoryQueries.data?.[item.product._id]?.quantity ?? 0;

      if (delta > stock) {
        setFulfillmentError(
          `Stok ${item.product.name} tidak cukup. Tambahan dibutuhkan ${delta}, stok tersedia ${stock}.`,
        );
        return;
      }
    }

    fulfillmentMutation.mutate();
  }

  if (orderQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Customer Order"
          subtitle="View customer order details."
        />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6 text-sm text-gray-400">
            Loading customer order...
          </div>
        </main>
      </div>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <div className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Customer Order"
          subtitle="View customer order details."
        />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
            <p className="text-sm text-red-400">
              {orderQuery.error instanceof Error
                ? orderQuery.error.message
                : 'Customer order not found.'}
            </p>

            <button
              type="button"
              onClick={() => router.push('/customer-orders')}
              className="mt-4 rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
            >
              Back to Orders
            </button>
          </div>
        </main>
      </div>
    );
  }

  const canEditFulfillment = !['cancelled', 'delivered', 'completed'].includes(
    order.status,
  );
  const hasFulfillableItems = canEditFulfillment && order.items.length > 0;

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Customer Order"
        subtitle="View customer order details."
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.push('/customer-orders')}
              className="mb-3 text-sm text-blue-400 transition hover:text-blue-300"
            >
              ← Back to Orders
            </button>

            <h2 className="text-2xl font-bold">{order.orderNumber}</h2>

            <p className="mt-1 text-sm text-gray-500">
              Customer order details and fulfillment status.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={openEditOrder}
              disabled={['completed', 'delivered'].includes(order.status)}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Edit Order
            </button>
            <span
              className={`inline-flex w-fit rounded-full border px-4 py-2 text-sm font-medium ${getStatusClass(order.status)}`}
            >
              {order.status}
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold">Order Information</h3>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Order Number
                </p>

                <p className="mt-1 text-sm font-medium text-white">
                  {order.orderNumber}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Order Date
                </p>

                <p className="mt-1 text-sm text-gray-300">
                  {formatDate(order.orderDate)}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Fulfillment Due
                </p>

                <p className="mt-1 text-sm text-gray-300">
                  {formatDate(order.fulfillmentDueDate)}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Payment
                </p>

                <p className="mt-1 text-sm text-gray-300">
                  {order.paymentStatus || '-'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Shipping Status
                </p>

                <p className="mt-1 text-sm text-gray-300">
                  {order.shippingStatus || '-'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Shipping Method
                </p>

                <p className="mt-1 text-sm text-gray-300">
                  {order.shippingMethod || '-'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
            <h3 className="text-lg font-semibold">Buyer</h3>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Name
                </p>

                <p className="mt-1 text-sm text-gray-200">
                  {[order.buyer.firstName, order.buyer.lastName]
                    .filter(Boolean)
                    .join(' ') || '-'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Email
                </p>

                <p className="mt-1 break-all text-sm text-gray-300">
                  {order.buyer.email || '-'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Phone
                </p>

                <p className="mt-1 text-sm text-gray-300">
                  {order.buyer.phone || '-'}
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold">Shipping Address</h3>

            <div className="mt-5 text-sm leading-6 text-gray-300">
              <p>{order.shippingAddress.address1 || '-'}</p>

              {order.shippingAddress.address2 && (
                <p>{order.shippingAddress.address2}</p>
              )}

              <p>
                {[order.shippingAddress.city, order.shippingAddress.state]
                  .filter(Boolean)
                  .join(', ')}
              </p>

              <p>
                {[order.shippingAddress.zip, order.shippingAddress.country]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
            <h3 className="text-lg font-semibold">Order Total</h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>

                <span>{formatCurrency(order.subtotal, order.currency)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-500">Shipping</span>

                <span>
                  {formatCurrency(order.shippingCost, order.currency)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-500">Tax</span>

                <span>{formatCurrency(order.tax, order.currency)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-500">Discount</span>

                <span>-{formatCurrency(order.discount, order.currency)}</span>
              </div>

              <div className="border-t border-blue-900/30 pt-3">
                <div className="flex justify-between">
                  <span className="font-semibold">Total</span>

                  <span className="font-bold text-blue-400">
                    {formatCurrency(order.total, order.currency)}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Order Items</h3>

              <p className="mt-1 text-sm text-gray-500">
                Product quantity, available stock, and fulfillment progress.
              </p>
            </div>

            <span className="text-sm text-gray-500">
              {order.items.length} items
            </span>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[950px] text-left">
              <thead className="border-b border-blue-900/40">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Product
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    CSV Product
                  </th>

                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ordered
                  </th>

                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Fulfilled
                  </th>

                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Remaining
                  </th>

                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Available
                  </th>

                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Fulfill Qty
                  </th>

                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-blue-900/20">
                {order.items.map((item) => {
                  const fulfilled = item.fulfilledQuantity ?? 0;
                  const remaining = Math.max(item.quantity - fulfilled, 0);
                  const inventory = inventoryQueries.data?.[item.product._id];
                  const physicalStock = inventory?.quantity ?? 0;
                  const availableStock = physicalStock;
                  const currentFulfillValue = fulfillQuantities[item._id] ?? '';
                  const fulfillmentDisabled =
                    !canEditFulfillment || inventoryQueries.isLoading;

                  return (
                    <tr key={item._id} className="hover:bg-blue-950/20">
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">
                          {item.product.name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {item.product.version}

                          {item.product.body ? ` · ${item.product.body}` : ''}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <p className="text-xs text-gray-500">product_name</p>

                        <p className="text-sm text-gray-300">
                          {item.productName}
                        </p>

                        <p className="mt-2 text-xs text-gray-500">
                          product_option_name
                        </p>

                        <p className="text-sm text-gray-300">
                          {item.productOptionName}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-center text-sm font-medium text-white">
                        {item.quantity}
                      </td>

                      <td className="px-4 py-4 text-center text-sm font-medium text-green-400">
                        {fulfilled}
                      </td>

                      <td className="px-4 py-4 text-center">
                        <span
                          className={
                            remaining > 0
                              ? 'font-medium text-yellow-400'
                              : 'font-medium text-green-400'
                          }
                        >
                          {remaining}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-center">
                        {inventoryQueries.isLoading ? (
                          <span className="text-xs text-gray-500">
                            Loading...
                          </span>
                        ) : inventory ? (
                          <div>
                            <span
                              className={
                                availableStock > 0
                                  ? 'font-medium text-green-400'
                                  : 'font-medium text-red-400'
                              }
                            >
                              {availableStock}
                            </span>

                            <p className="mt-1 text-[11px] text-gray-600">
                              Pcs: {physicalStock}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-red-400">No stock</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={currentFulfillValue}
                          disabled={fulfillmentDisabled}
                          onChange={(event) =>
                            updateFulfillQuantity(
                              item._id,
                              event.target.value,
                              item.quantity,
                            )
                          }
                          placeholder={String(fulfilled)}
                          className="w-24 rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-center text-sm text-white outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                        />

                        <p className="mt-1 text-[11px] text-gray-600">
                          current {fulfilled} / {item.quantity}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-right text-sm text-gray-300">
                        {formatCurrency(item.total, order.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {fulfillmentError && (
            <div className="mt-5 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
              {fulfillmentError}
            </div>
          )}

          {fulfillmentSuccess && (
            <div className="mt-5 rounded-lg border border-green-900/50 bg-green-950/20 px-4 py-3 text-sm text-green-400">
              {fulfillmentSuccess}
            </div>
          )}

          {hasFulfillableItems && (
            <div className="mt-6 flex flex-col gap-4 border-t border-blue-900/30 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-white">
                  Fulfill Customer Order
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Masukkan jumlah fulfillment akhir. Jika jumlah dikurangi,
                  selisih stok akan dikembalikan ke inventory.
                </p>
              </div>

              <button
                type="button"
                onClick={handleFulfill}
                disabled={
                  fulfillmentMutation.isPending || inventoryQueries.isLoading
                }
                className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fulfillmentMutation.isPending
                  ? 'Processing...'
                  : 'Fulfill Selected'}
              </button>
            </div>
          )}
        </section>

        {editSuccess && (
          <div className="mt-5 rounded-lg border border-green-900/50 bg-green-950/20 px-4 py-3 text-sm text-green-400">
            {editSuccess}
          </div>
        )}

        {editOpen && editForm && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
            <div className="mx-auto my-6 max-w-5xl rounded-2xl border border-blue-900/50 bg-[#0a1024] p-5 shadow-2xl sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Edit Customer Order</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Ubah informasi order, buyer, alamat, produk, quantity, dan
                    harga.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-lg border border-blue-900/50 px-3 py-2 text-sm text-gray-300 hover:bg-blue-950"
                >
                  Tutup
                </button>
              </div>
              <form onSubmit={saveEditedOrder} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ['Order Number', 'orderNumber'],
                      ['Order Date', 'orderDate'],
                      ['Fulfillment Due Date', 'fulfillmentDueDate'],
                    ] as const
                  ).map(([label, key]) => (
                    <label key={key} className="block text-sm text-gray-300">
                      {label}
                      <input
                        required
                        type={key.includes('Date') ? 'date' : 'text'}
                        value={editForm[key]}
                        onChange={(e) => updateEditForm(key, e.target.value)}
                        className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white outline-none focus:border-blue-500"
                      />
                    </label>
                  ))}
                  <label className="block text-sm text-gray-300">
                    Order By
                    <select
                      value={editForm.orderBy}
                      onChange={(e) =>
                        updateEditForm('orderBy', e.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white"
                    >
                      {ORDER_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-300">
                    Status
                    <select
                      value={editForm.status}
                      onChange={(e) =>
                        updateEditForm(
                          'status',
                          e.target.value as EditableOrderForm['status'],
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white"
                    >
                      {(
                        [
                          'pending',
                          'partial',
                          'fulfilled',
                          'cancelled',
                        ] as const
                      ).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-300">
                    Shipping Method
                    <select
                      value={editForm.shippingMethod}
                      onChange={(e) =>
                        updateEditForm('shippingMethod', e.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white"
                    >
                      <option value="regular">Regular</option>
                      <option value="express">Express</option>
                    </select>
                  </label>
                  {(
                    [
                      ['First Name', 'buyerFirstName'],
                      ['Last Name', 'buyerLastName'],
                      ['Email', 'buyerEmail'],
                      ['Phone', 'buyerPhone'],
                      ['Payment Status', 'paymentStatus'],
                      ['Shipping Status', 'shippingStatus'],
                    ] as const
                  ).map(([label, key]) => (
                    <label key={key} className="block text-sm text-gray-300">
                      {label}
                      <input
                        type="text"
                        value={editForm[key]}
                        onChange={(e) => updateEditForm(key, e.target.value)}
                        className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white outline-none focus:border-blue-500"
                      />
                    </label>
                  ))}
                </div>
                <div>
                  <h3 className="mb-3 font-semibold">Shipping Address</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {(
                      [
                        ['Address 1', 'address1'],
                        ['Address 2', 'address2'],
                        ['City', 'city'],
                        ['State / Province', 'state'],
                        ['ZIP / Postal Code', 'zip'],
                        ['Country', 'country'],
                      ] as const
                    ).map(([label, key]) => (
                      <label key={key} className="block text-sm text-gray-300">
                        {label}
                        <input
                          value={editForm[key]}
                          onChange={(e) => updateEditForm(key, e.target.value)}
                          className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white outline-none focus:border-blue-500"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold">Order Items</h3>
                    <button
                      type="button"
                      onClick={addEditItem}
                      disabled={order.items.some(
                        (item) => (item.fulfilledQuantity ?? 0) > 0,
                      )}
                      className="rounded-lg border border-blue-700/60 px-3 py-2 text-sm text-blue-300 hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      + Tambah Produk
                    </button>
                  </div>
                  {order.items.some(
                    (item) => (item.fulfilledQuantity ?? 0) > 0,
                  ) && (
                    <p className="mb-3 rounded-lg border border-yellow-900/50 bg-yellow-950/20 p-3 text-sm text-yellow-300">
                      Order ini sudah memiliki fulfillment. Product dan quantity
                      dikunci agar stok tidak menjadi tidak akurat. Field lain
                      tetap bisa diedit.
                    </p>
                  )}
                  <div className="space-y-3">
                    {editForm.items.map((item, index) => (
                      <div
                        key={index}
                        className="grid gap-3 rounded-xl border border-blue-900/30 p-3 sm:grid-cols-[minmax(0,1fr)_110px_140px_80px]"
                      >
                        <div className="relative text-sm text-gray-300">
                          <label htmlFor={`edit-product-search-${index}`}>
                            Product
                          </label>
                          <input
                            id={`edit-product-search-${index}`}
                            type="search"
                            autoComplete="off"
                            value={productSearch[index] ?? ''}
                            disabled={order.items.some(
                              (old) => (old.fulfilledQuantity ?? 0) > 0,
                            )}
                            onFocus={() =>
                              setProductDropdownOpen((current) => ({
                                ...current,
                                [index]: true,
                              }))
                            }
                            onChange={(e) => {
                              setProductSearch((current) => ({
                                ...current,
                                [index]: e.target.value,
                              }));
                              setProductDropdownOpen((current) => ({
                                ...current,
                                [index]: true,
                              }));
                            }}
                            placeholder={
                              (productsQuery.data ?? []).find(
                                (product: Product) =>
                                  product._id === item.product,
                              )?.name ?? 'Cari nama, versi, atau body produk...'
                            }
                            className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white outline-none placeholder:text-gray-600 focus:border-blue-500 disabled:opacity-50"
                          />
                          {productDropdownOpen[index] &&
                            !order.items.some(
                              (old) => (old.fulfilledQuantity ?? 0) > 0,
                            ) && (
                              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-blue-800/60 bg-[#070b1a] shadow-xl">
                                {productsQuery.isLoading ? (
                                  <p className="px-3 py-3 text-xs text-gray-400">
                                    Memuat produk...
                                  </p>
                                ) : (productsQuery.data ?? []).filter(
                                    (product: Product) => {
                                      const query = (productSearch[index] ?? '')
                                        .trim()
                                        .toLowerCase();
                                      return (
                                        !query ||
                                        [
                                          product.name,
                                          product.version,
                                          product.body,
                                        ].some((value) =>
                                          String(value ?? '')
                                            .toLowerCase()
                                            .includes(query),
                                        )
                                      );
                                    },
                                  ).length === 0 ? (
                                  <p className="px-3 py-3 text-xs text-gray-400">
                                    Produk tidak ditemukan.
                                  </p>
                                ) : (
                                  (productsQuery.data ?? [])
                                    .filter((product: Product) => {
                                      const query = (productSearch[index] ?? '')
                                        .trim()
                                        .toLowerCase();
                                      return (
                                        !query ||
                                        [
                                          product.name,
                                          product.version,
                                          product.body,
                                        ].some((value) =>
                                          String(value ?? '')
                                            .toLowerCase()
                                            .includes(query),
                                        )
                                      );
                                    })
                                    .map((product: Product) => (
                                      <button
                                        key={product._id}
                                        type="button"
                                        onMouseDown={(event) =>
                                          event.preventDefault()
                                        }
                                        onClick={() => {
                                          updateEditItem(
                                            index,
                                            'product',
                                            product._id,
                                          );
                                          setProductSearch((current) => ({
                                            ...current,
                                            [index]: '',
                                          }));
                                          setProductDropdownOpen((current) => ({
                                            ...current,
                                            [index]: false,
                                          }));
                                        }}
                                        className={`block w-full border-b border-blue-900/20 px-3 py-2.5 text-left last:border-b-0 hover:bg-blue-950/60 ${product._id === item.product ? 'bg-blue-950/40 text-blue-200' : 'text-gray-200'}`}
                                      >
                                        <span className="block font-medium">
                                          {product.name}
                                        </span>
                                        <span className="mt-0.5 block text-xs text-gray-500">
                                          {[product.version, product.body]
                                            .filter(Boolean)
                                            .join(' · ') || 'Tanpa versi/body'}
                                        </span>
                                      </button>
                                    ))
                                )}
                              </div>
                            )}
                          <p className="mt-1 text-xs text-gray-500">
                            Produk terpilih:{' '}
                            {(productsQuery.data ?? []).find(
                              (product: Product) =>
                                product._id === item.product,
                            )?.name ??
                              order.items.find(
                                (old) => old.product._id === item.product,
                              )?.product.name ??
                              'Belum dipilih'}
                          </p>
                        </div>
                        <label className="text-sm text-gray-300">
                          Quantity
                          <input
                            disabled={order.items.some(
                              (old) => (old.fulfilledQuantity ?? 0) > 0,
                            )}
                            type="number"
                            min={1}
                            step={1}
                            value={item.quantity}
                            onChange={(e) =>
                              updateEditItem(index, 'quantity', e.target.value)
                            }
                            className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white disabled:opacity-50"
                          />
                        </label>
                        <label className="text-sm text-gray-300">
                          Unit Price
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.price}
                            onChange={(e) =>
                              updateEditItem(index, 'price', e.target.value)
                            }
                            className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white"
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            disabled={
                              editForm.items.length <= 1 ||
                              order.items.some(
                                (old) => (old.fulfilledQuantity ?? 0) > 0,
                              )
                            }
                            onClick={() => removeEditItem(index)}
                            className="w-full rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {productsQuery.isLoading && (
                    <p className="mt-2 text-xs text-gray-500">
                      Memuat daftar produk...
                    </p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      ['Currency', 'currency'],
                      ['Shipping Cost', 'shippingCost'],
                      ['Tax', 'tax'],
                      ['Discount', 'discount'],
                    ] as const
                  ).map(([label, key]) => (
                    <label key={key} className="block text-sm text-gray-300">
                      {label}
                      <input
                        type={key === 'currency' ? 'text' : 'number'}
                        min={key === 'currency' ? undefined : 0}
                        step="0.01"
                        value={editForm[key]}
                        onChange={(e) => updateEditForm(key, e.target.value)}
                        className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white outline-none focus:border-blue-500"
                      />
                    </label>
                  ))}
                </div>
                <label className="block text-sm text-gray-300">
                  Note
                  <textarea
                    rows={3}
                    value={editForm.note}
                    onChange={(e) => updateEditForm('note', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </label>
                {editError && (
                  <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
                    {editError}
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-3 border-t border-blue-900/30 pt-5">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="rounded-lg border border-blue-900/50 px-4 py-2 text-sm text-gray-300 hover:bg-blue-950"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={productsQuery.isLoading}
                    className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
