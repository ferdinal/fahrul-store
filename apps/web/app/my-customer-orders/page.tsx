'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  createMyCustomerOrder,
  getMyCustomerOrders,
  type CreateMyCustomerOrderInput,
} from '@/lib/api/myCustomerOrders';
import { myCustomerOrderKeys } from '@/lib/api/myCustomerOrderKeys';
import { getProducts, type Product } from '@/lib/api/products';
import type { CustomerOrder } from '@/lib/api/customerOrders';
import { useAuthStore } from '@/store/authStore';

// ============================================================
// CONSTANTS
// ============================================================

const CUSTOMER_ORDER_SOURCES = [
  'Big cartel',
  'Shopee internasional',
  'Shopee Indonesia',
  'Tiktok',
  'Etsy',
  'Complain',
  'Additional Order',
] as const;

type CustomerOrderSource = (typeof CUSTOMER_ORDER_SOURCES)[number];

type SelectedOrderItem = {
  product: Product;
  quantity: number | '';
  price: number;
};

// ============================================================
// PAGE
// ============================================================

export default function MyCustomerOrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  // ==========================================================
  // CREATE FORM STATE
  // ==========================================================

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orderDate, setOrderDate] = useState('');
  const [fulfillmentDueDate, setFulfillmentDueDate] = useState('');
  const [orderBy, setOrderBy] = useState<CustomerOrderSource | ''>('');
  const [shippingMethod, setShippingMethod] = useState<'regular' | 'express'>(
    'regular',
  );

  const [productSearch, setProductSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedOrderItem[]>([]);

  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // ==========================================================
  // ROLE GUARD
  // ==========================================================

  useEffect(() => {
    if (!user) {
      return;
    }

    if (user.role === 'admin') {
      router.replace('/dashboard');
      return;
    }

    if (user.role !== 'user') {
      router.replace('/login');
    }
  }, [user, router]);

  // ==========================================================
  // CUSTOMER ORDERS
  // ==========================================================

  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    error: ordersQueryError,
  } = useQuery<CustomerOrder[], Error>({
    queryKey: myCustomerOrderKeys.list(),
    queryFn: getMyCustomerOrders,
    enabled: Boolean(user && user.role === 'user'),
  });

  // ==========================================================
  // PRODUCTS
  // ==========================================================

  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsError,
    error: productsQueryError,
  } = useQuery<Product[], Error>({
    queryKey: ['products'],
    queryFn: getProducts,
    enabled: showCreateForm && Boolean(user && user.role === 'user'),
  });

  // ==========================================================
  // PRODUCT SEARCH
  // ==========================================================

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();

    if (!keyword) {
      return [];
    }

    return products.filter((product) => {
      const name = product.name?.toLowerCase() ?? '';
      const version = product.version?.toLowerCase() ?? '';
      const body = product.body?.toLowerCase() ?? '';

      return (
        name.includes(keyword) ||
        version.includes(keyword) ||
        body.includes(keyword)
      );
    });
  }, [products, productSearch]);

  // ==========================================================
  // FULFILLMENT DUE DATE
  // +7 DAYS
  // ==========================================================

  //   const fulfillmentDueDate = useMemo(() => {
  //     if (!orderDate) {
  //       return '';
  //     }

  //     const date = new Date(`${orderDate}T00:00:00`);

  //     if (Number.isNaN(date.getTime())) {
  //       return '';
  //     }

  //     date.setDate(date.getDate() + 7);

  //     const year = date.getFullYear();
  //     const month = String(date.getMonth() + 1).padStart(2, '0');
  //     const day = String(date.getDate()).padStart(2, '0');

  //     return `${year}-${month}-${day}`;
  //   }, [orderDate]);

  // ==========================================================
  // TOTAL
  // ==========================================================

  const total = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      return sum + (Number(item.quantity) || 0) * item.price;
    }, 0);
  }, [selectedItems]);

  // ==========================================================
  // CREATE ORDER
  // ==========================================================

  async function handleCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError('');

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!orderDate) {
      setCreateError('Order Date wajib diisi.');
      return;
    }

    if (!orderBy) {
      setCreateError('Order By wajib dipilih.');
      return;
    }

    if (selectedItems.length === 0) {
      setCreateError('Minimal pilih 1 product.');
      return;
    }

    const hasInvalidItem = selectedItems.some(
      (item) =>
        item.quantity === '' ||
        Number(item.quantity) < 1 ||
        !Number.isInteger(Number(item.quantity)) ||
        !Number.isFinite(item.price) ||
        item.price < 0,
    );

    if (hasInvalidItem) {
      setCreateError(
        'Setiap product harus memiliki quantity minimal 1 dan price yang valid.',
      );
      return;
    }

    // --------------------------------------------------------
    // CREATE
    // --------------------------------------------------------

    try {
      setCreating(true);

      const input: CreateMyCustomerOrderInput = {
        orderDate,
        orderBy,
        shippingMethod,
        items: selectedItems.map((item) => ({
          product: item.product._id,
          quantity: Number(item.quantity),
          price: item.price,
        })),
      };

      await createMyCustomerOrder(input);

      // Refresh orders
      await queryClient.invalidateQueries({
        queryKey: myCustomerOrderKeys.list(),
      });

      resetCreateForm();
    } catch (error) {
      console.error('Create my customer order error:', error);

      setCreateError(
        error instanceof Error
          ? error.message
          : 'Gagal membuat customer order.',
      );
    } finally {
      setCreating(false);
    }
  }

  // ==========================================================
  // RESET FORM
  // ==========================================================

  function resetCreateForm() {
    setShowCreateForm(false);
    setOrderDate('');
    setOrderBy('');
    setShippingMethod('regular');
    setProductSearch('');
    setSelectedItems([]);
    setCreateError('');
  }

  // ==========================================================
  // AUTH LOADING
  // ==========================================================

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070b1a] px-4 text-white">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-red-500" />
          <p className="mt-4 text-sm text-white/50">Loading...</p>
        </div>
      </main>
    );
  }

  // ==========================================================
  // ROLE GUARD
  // ==========================================================

  if (user.role !== 'user') {
    return null;
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <main className="min-h-screen bg-[#070b1a] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-red-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        {/* HEADER */}
        <header className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                  Reseller Portal
                </span>
              </div>

              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                My Customer Orders
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-white/50">
                Kelola customer order yang dibuat melalui akun reseller kamu.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setCreateError('');
                setShowCreateForm(true);
              }}
              className="shrink-0 rounded-xl bg-gradient-to-r from-red-600 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/10 transition hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="sm:hidden">+ Order</span>
              <span className="hidden sm:inline">+ Create Order</span>
            </button>
          </div>
        </header>

        {/* RESELLER INFO */}
        <section className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
          <div className="h-1 bg-gradient-to-r from-red-600 via-red-500 to-blue-600" />

          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-blue-600 text-sm font-black">
                {user.username.slice(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-bold">{user.username}</p>
                <p className="mt-0.5 truncate text-xs text-white/40">
                  {user.email}
                </p>
              </div>

              <div className="ml-auto rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                Reseller
              </div>
            </div>
          </div>
        </section>

        {/* SUMMARY */}
        {!ordersLoading && !ordersError && (
          <section className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-3">
            <SummaryCard label="Orders" value={orders.length} />

            <SummaryCard
              label="Pending"
              value={
                orders.filter((order) => order.status === 'pending').length
              }
              valueClassName="text-blue-400"
            />
            <SummaryCard
              label="Fulfilled"
              value={
                orders.filter((order) => order.status === 'fulfilled').length
              }
              valueClassName="text-green-400"
            />

            {/* <div className="col-span-2 sm:col-span-1">
              <SummaryCard
                label="Fulfilled"
                value={
                  orders.filter((order) => order.status === 'fulfilled').length
                }
                valueClassName="text-green-400"
              />
            </div> */}
          </section>
        )}

        {/* ORDERS LOADING */}
        {ordersLoading && (
          <section className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"
              >
                <div className="flex justify-between gap-4">
                  <div className="space-y-2">
                    <div className="h-3 w-20 rounded bg-white/10" />
                    <div className="h-5 w-32 rounded bg-white/10" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-white/10" />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div className="h-10 rounded bg-white/5" />
                  <div className="h-10 rounded bg-white/5" />
                  <div className="h-10 rounded bg-white/5" />
                  <div className="h-10 rounded bg-white/5" />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ORDERS ERROR */}
        {ordersError && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4">
            <p className="text-sm font-semibold text-red-300">
              Gagal memuat customer orders
            </p>

            <p className="mt-1 text-xs text-red-300/70">
              {ordersQueryError instanceof Error
                ? ordersQueryError.message
                : 'Terjadi kesalahan.'}
            </p>
          </div>
        )}

        {/* EMPTY */}
        {!ordersLoading && !ordersError && orders.length === 0 && (
          <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600/20 to-blue-600/20">
              <span className="text-2xl">+</span>
            </div>

            <h2 className="mt-5 text-lg font-bold">Belum ada customer order</h2>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/40">
              Customer order yang kamu buat akan muncul di halaman ini.
            </p>

            <button
              type="button"
              onClick={() => {
                setCreateError('');
                setShowCreateForm(true);
              }}
              className="mt-6 rounded-xl bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-bold text-white"
            >
              Create Customer Order
            </button>
          </section>
        )}

        {/* ORDERS */}
        {!ordersLoading && !ordersError && orders.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white/50">
                Customer Orders
              </h2>

              <p className="text-xs text-white/30">
                {orders.length} order
                {orders.length !== 1 ? 's' : ''}
              </p>
            </div>

            {orders.map((order) => (
              <OrderCard key={order._id} order={order} />
            ))}
          </section>
        )}
      </div>

      {/* CREATE ORDER MODAL */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm">
          <div className="min-h-full px-3 py-4 sm:px-6 sm:py-8">
            <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b1022] shadow-2xl">
              {/* Modal Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0b1022]/95 px-4 py-4 backdrop-blur sm:px-6">
                <div>
                  <h2 className="text-lg font-black sm:text-xl">
                    Create Customer Order
                  </h2>

                  <p className="mt-1 text-xs text-white/40">
                    Buat order baru sebagai reseller.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resetCreateForm}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/5 hover:text-white"
                >
                  ×
                </button>
              </div>

              {/* FORM */}
              <form
                onSubmit={handleCreateOrder}
                className="space-y-5 p-4 sm:p-6"
              >
                {/* ORDER */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <h3 className="text-sm font-bold">Order</h3>

                  <div className="mt-4 space-y-4">
                    {/* Order Date */}
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-white/60">
                        Order Date
                      </label>

                      <DatePicker
                        value={orderDate}
                        onChange={(value) => {
                          setOrderDate(value);
                          setCreateError('');
                        }}
                        placeholder="Pilih order date"
                      />
                    </div>

                    {/* Fulfillment Due Date */}
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-white/60">
                        Fulfillment Due Date
                      </label>

                      <DatePicker
                        value={fulfillmentDueDate}
                        onChange={(value) => {
                          setFulfillmentDueDate(value);
                          setCreateError('');
                        }}
                        placeholder="Pilih fulfillment due date"
                      />
                    </div>

                    {/* Order By */}
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-white/60">
                        Order By
                      </label>

                      <select
                        value={orderBy}
                        onChange={(event) => {
                          setOrderBy(event.target.value as CustomerOrderSource);
                          setCreateError('');
                        }}
                        className="w-full rounded-xl border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                      >
                        <option value="">Pilih Order By</option>

                        {CUSTOMER_ORDER_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {source}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {/* BUYER */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <h3 className="text-sm font-bold">Buyer</h3>

                  <div className="mt-4 space-y-4">
                    {/* Name */}
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-white/60">
                        Name
                      </label>

                      <input
                        value={user.username}
                        readOnly
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60 outline-none"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-white/60">
                        Email
                      </label>

                      <input
                        value={user.email}
                        readOnly
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60 outline-none"
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-white/30">
                    Buyer otomatis menggunakan akun reseller yang sedang login.
                  </p>
                </section>

                {/* SHIPPING */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <h3 className="text-sm font-bold">Shipping</h3>

                  <div className="mt-4">
                    <label className="mb-2 block text-xs font-semibold text-white/60">
                      Shipping Method
                    </label>

                    <select
                      value={shippingMethod}
                      onChange={(event) => {
                        setShippingMethod(
                          event.target.value as 'regular' | 'express',
                        );
                        setCreateError('');
                      }}
                      className="w-full rounded-xl border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                    >
                      <option value="regular">Reguler</option>
                      <option value="express">Express</option>
                    </select>
                  </div>
                </section>

                {/* PRODUCT */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <h3 className="text-sm font-bold">Product</h3>

                  {/* SEARCH PRODUCT */}
                  <div className="mt-4">
                    <label className="mb-2 block text-xs font-semibold text-white/60">
                      Search Product
                    </label>

                    <input
                      type="text"
                      value={productSearch}
                      onChange={(event) => {
                        setProductSearch(event.target.value);
                        setCreateError('');
                      }}
                      placeholder="Search product name or version..."
                      autoComplete="off"
                      className="w-full rounded-xl border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-blue-500"
                    />

                    {/* API ERROR */}
                    {productsError && (
                      <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                        Gagal mengambil products:{' '}
                        {productsQueryError instanceof Error
                          ? productsQueryError.message
                          : 'Terjadi kesalahan.'}
                      </div>
                    )}

                    {/* SEARCH RESULTS */}
                    {productSearch.trim() && (
                      <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#0a1024]">
                        {productsLoading ? (
                          <div className="px-4 py-4 text-sm text-white/40">
                            Loading products...
                          </div>
                        ) : filteredProducts.length === 0 ? (
                          <div className="px-4 py-4 text-sm text-white/40">
                            Product tidak ditemukan.
                          </div>
                        ) : (
                          filteredProducts.map((product) => {
                            const alreadySelected = selectedItems.some(
                              (item) => item.product._id === product._id,
                            );

                            return (
                              <button
                                key={product._id}
                                type="button"
                                disabled={alreadySelected}
                                onClick={() => {
                                  setSelectedItems((current) => {
                                    if (
                                      current.some(
                                        (item) =>
                                          item.product._id === product._id,
                                      )
                                    ) {
                                      return current;
                                    }

                                    return [
                                      ...current,
                                      {
                                        product,
                                        quantity: 1,
                                        price: 0,
                                      },
                                    ];
                                  });

                                  setProductSearch('');
                                  setCreateError('');
                                }}
                                className="block w-full border-b border-white/5 px-4 py-3 text-left last:border-b-0 hover:bg-blue-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-white">
                                      {product.name}
                                    </p>

                                    <p className="mt-1 text-xs text-white/40">
                                      Version: {product.version}
                                    </p>
                                  </div>

                                  <span className="text-xs text-blue-300">
                                    {alreadySelected ? 'Added' : '+ Add'}
                                  </span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* SELECTED PRODUCTS */}
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white/60">
                        Selected Products
                      </p>

                      <span className="text-xs text-white/40">
                        {selectedItems.length} product
                        {selectedItems.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {selectedItems.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
                        <p className="text-sm text-white/40">
                          Belum ada product dipilih.
                        </p>

                        <p className="mt-1 text-xs text-white/25">
                          Cari product di atas untuk menambahkannya.
                        </p>
                      </div>
                    ) : (
                      selectedItems.map((item) => (
                        <div
                          key={item.product._id}
                          className="rounded-xl border border-blue-800/40 bg-blue-950/20 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-blue-300">
                                {item.product.name}
                              </p>

                              <p className="mt-1 text-xs text-white/40">
                                Version: {item.product.version}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItems((current) =>
                                  current.filter(
                                    (selected) =>
                                      selected.product._id !== item.product._id,
                                  ),
                                );

                                setCreateError('');
                              }}
                              className="shrink-0 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            {/* QUANTITY */}
                            <div>
                              <label className="mb-2 block text-xs font-semibold text-white/60">
                                Quantity
                              </label>

                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={item.quantity}
                                onChange={(event) => {
                                  const value = event.target.value;

                                  setSelectedItems((current) =>
                                    current.map((selected) =>
                                      selected.product._id === item.product._id
                                        ? {
                                            ...selected,
                                            quantity:
                                              value === '' ? '' : Number(value),
                                          }
                                        : selected,
                                    ),
                                  );

                                  setCreateError('');
                                }}
                                onBlur={() => {
                                  setSelectedItems((current) =>
                                    current.map((selected) =>
                                      selected.product._id ===
                                        item.product._id &&
                                      (selected.quantity === '' ||
                                        Number(selected.quantity) < 1)
                                        ? { ...selected, quantity: 1 }
                                        : selected,
                                    ),
                                  );
                                }}
                                className="w-full rounded-xl border border-blue-900/50 bg-[#0a1024] px-3 py-3 text-sm text-white outline-none focus:border-blue-500"
                              />
                            </div>

                            {/* PRICE */}
                            <div>
                              <label className="mb-2 block text-xs font-semibold text-white/60">
                                Price per unit
                              </label>

                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.price}
                                onChange={(event) => {
                                  const value = event.target.value;

                                  setSelectedItems((current) =>
                                    current.map((selected) =>
                                      selected.product._id === item.product._id
                                        ? {
                                            ...selected,
                                            price: Math.max(
                                              0,
                                              Number(value) || 0,
                                            ),
                                          }
                                        : selected,
                                    ),
                                  );

                                  setCreateError('');
                                }}
                                className="w-full rounded-xl border border-blue-900/50 bg-[#0a1024] px-3 py-3 text-sm text-white outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>

                          {/* PRODUCT SUBTOTAL */}
                          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                            <span className="text-xs text-white/40">
                              Product Subtotal
                            </span>

                            <span className="text-sm font-bold text-blue-300">
                              {(
                                (Number(item.quantity) || 0) * item.price
                              ).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* TOTAL ORDER */}
                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                    <div>
                      <span className="text-sm text-white/40">Total Order</span>

                      <p className="mt-1 text-xs text-white/25">
                        {selectedItems.length} product terpilih
                      </p>
                    </div>

                    <span className="text-xl font-black text-blue-300">
                      {total.toFixed(2)}
                    </span>
                  </div>
                </section>

                {/* CREATE ERROR */}
                {createError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {createError}
                  </div>
                )}

                {/* ACTIONS */}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={resetCreateForm}
                    disabled={creating}
                    className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-xl bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/10 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create Order'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
  label,
  value,
  valueClassName = 'text-white',
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs text-white/40">{label}</p>
      <p className={`mt-2 text-2xl font-black ${valueClassName}`}>{value}</p>
    </div>
  );
}

// ============================================================
// ORDER CARD
// ============================================================

function OrderCard({ order }: { order: CustomerOrder }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      {/* HEADER */}
      <div className="border-b border-white/10 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
              Packing No.
            </p>

            <p className="mt-1 font-mono text-sm font-bold text-red-400">
              {order.packagingCode}
            </p>

            <p className="mt-2 text-xs text-white/40">{order.orderNumber}</p>
          </div>

          <StatusBadge status={order.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <InfoItem label="Order By" value={order.orderBy} />
          <InfoItem label="Order Date" value={formatDate(order.orderDate)} />
          <InfoItem label="Shipping" value={order.shippingMethod} />
          <InfoItem label="Items" value={`${order.items.length} SKU`} />
        </div>
      </div>

      {/* ITEMS */}
      <div className="p-4 sm:p-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">
          Order Items
        </p>

        <div className="space-y-2">
          {order.items.map((item) => (
            <div
              key={item._id}
              className="rounded-xl border border-white/5 bg-black/20 p-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {/* <p className="truncate text-sm font-semibold">
                    {item.productName}
                  </p> */}

                  {/* <p className="mt-1 text-xs text-white/40">
                    {item.productOptionName}
                  </p> */}
                  <p className="mt-1 text-xs text-white/40">
                    {item.product.name}
                  </p>

                  {/* {item.product?.version && (
                    <p className="mt-2 text-xs text-white/30">
                      Version: {item.product.version}
                    </p>
                  )} */}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold">× {item.quantity}</p>

                  <p className="mt-1 text-xs text-white/40">
                    {order.currency} {item.total.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-4 sm:px-5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/30">
            Total Items
          </p>

          {/* <p className="mt-1 text-lg font-black">
            {order.currency} {order.total.toFixed(2)}
          </p> */}
          <p className="mt-1 text-lg font-black">{order.items.length}</p>
        </div>

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/30">
            Due Date
          </p>

          <p className="mt-1 text-sm font-semibold text-white/70">
            {formatDate(order.fulfillmentDueDate)}
          </p>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// INFO ITEM
// ============================================================

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-white/30">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-medium text-white/80">
        {value || '-'}
      </p>
    </div>
  );
}

// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({ status }: { status: CustomerOrder['status'] }) {
  const config = {
    pending: {
      label: 'Pending',
      className: 'border-blue-400/20 bg-blue-500/10 text-blue-300',
    },

    partial: {
      label: 'Partial',
      className: 'border-orange-400/20 bg-orange-500/10 text-orange-300',
    },

    fulfilled: {
      label: 'Fulfilled',
      className: 'border-green-400/20 bg-green-500/10 text-green-300',
    },

    delivered: {
      label: 'Delivered',
      className: 'border-sky-400/20 bg-sky-500/10 text-sky-300',
    },

    completed: {
      label: 'Completed',
      className: 'border-purple-400/20 bg-purple-500/10 text-purple-300',
    },

    cancelled: {
      label: 'Cancelled',
      className: 'border-red-400/20 bg-red-500/10 text-red-300',
    },
  } as const;

  const current = config[status];

  return (
    <span
      className={[
        'shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider',
        current.className,
      ].join(' ')}
    >
      {current.label}
    </span>
  );
}

// ============================================================
// FORMAT DATE
// ============================================================

function formatDate(value: string) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
