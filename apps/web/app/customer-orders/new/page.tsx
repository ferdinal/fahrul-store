'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminHeader } from '@/components/layout/AdminHeader';
import { DatePicker } from '@/components/ui/DatePicker';

import { createCustomerOrder } from '@/lib/api/customerOrders';
import { getProducts, type Product } from '@/lib/api/products';
import { customerOrderKeys } from '@/lib/api/customerOrderKeys';
import { useAuthStore } from '@/store/authStore';

type CustomerOrderSource =
  | 'Big cartel'
  | 'Shopee internasional'
  | 'Shopee Indonesia'
  | 'Tiktok'
  | 'Etsy'
  | 'Complain'
  | 'Additional Order';

const CUSTOMER_ORDER_SOURCES: CustomerOrderSource[] = [
  'Big cartel',
  'Shopee internasional',
  'Shopee Indonesia',
  'Tiktok',
  'Etsy',
  'Complain',
  'Additional Order',
];

export default function CreateCustomerOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const user = useAuthStore((state) => state.user);

  const [orderDate, setOrderDate] = useState('');

  const [orderBy, setOrderBy] = useState<CustomerOrderSource | ''>('');

  const [shippingMethod, setShippingMethod] = useState<'regular' | 'express'>(
    'regular',
  );

  const [productSearch, setProductSearch] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [quantity, setQuantity] = useState(1);

  const [price, setPrice] = useState(0);

  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();

    if (!keyword) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(keyword) ||
        product.version.toLowerCase().includes(keyword)
      );
    });
  }, [products, productSearch]);

  const fulfillmentDueDate = useMemo(() => {
    if (!orderDate) {
      return '';
    }

    const date = new Date(`${orderDate}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    date.setDate(date.getDate() + 7);

    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2, '0');

    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }, [orderDate]);

  const total = useMemo(() => {
    return quantity * price;
  }, [quantity, price]);

  const buyerName = user?.username ?? '';

  const buyerEmail = user?.email ?? '';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');

    if (!orderDate) {
      setError('Order Date wajib diisi.');
      return;
    }

    if (!orderBy) {
      setError('Order By wajib dipilih.');
      return;
    }

    if (!selectedProduct) {
      setError('Product wajib dipilih.');
      return;
    }

    if (quantity < 1) {
      setError('Quantity minimal 1.');
      return;
    }

    if (price < 0) {
      setError('Price tidak boleh kurang dari 0.');
      return;
    }

    if (!buyerName.trim()) {
      setError('Nama buyer tidak tersedia.');
      return;
    }

    if (!buyerEmail.trim()) {
      setError('Email buyer tidak tersedia.');
      return;
    }

    try {
      setLoading(true);

      await createCustomerOrder({
        buyer: {
          firstName: buyerName,
          lastName: '',
          email: buyerEmail,
          phone: '',
        },

        orderDate,

        orderBy,

        shippingMethod,

        items: [
          {
            product: selectedProduct._id,
            productName: selectedProduct.name,
            productOptionName: selectedProduct.version,
            quantity,
            price,
            total,
          },
        ],
      });

      await queryClient.invalidateQueries({
        queryKey: customerOrderKeys.list(),
      });

      router.push('/customer-orders');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Gagal membuat customer order.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Create Customer Order"
        subtitle="Create a customer order manually"
      />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => router.push('/customer-orders')}
          className="mb-6 rounded-lg border border-blue-800/50 px-3 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
        >
          ← Customer Orders
        </button>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ORDER */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-bold">Order</h2>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {/* Order Date */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Order Date
                </label>

                <DatePicker
                  value={orderDate}
                  onChange={(value) => {
                    setOrderDate(value);
                    setError('');
                  }}
                  placeholder="Pilih order date"
                />
              </div>

              {/* Fulfillment Due Date */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Fulfillment Due Date
                </label>

                <DatePicker
                  value={fulfillmentDueDate}
                  onChange={() => {}}
                  placeholder="Otomatis +7 hari"
                  disabled={() => true}
                />
              </div>

              {/* Order By */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Order By
                </label>

                <select
                  value={orderBy}
                  onChange={(event) => {
                    setOrderBy(event.target.value as CustomerOrderSource);
                    setError('');
                  }}
                  className="w-full rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
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
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-bold">Buyer</h2>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {/* Name */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Name
                </label>

                <input
                  value={buyerName}
                  readOnly
                  className="w-full rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-gray-300 outline-none"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Email
                </label>

                <input
                  value={buyerEmail}
                  readOnly
                  className="w-full rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-gray-300 outline-none"
                />
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Buyer menggunakan data user yang sedang login.
            </p>
          </section>

          {/* SHIPPING */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-bold">Shipping</h2>

            <div className="mt-5 max-w-md">
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Shipping Method
              </label>

              <select
                value={shippingMethod}
                onChange={(event) => {
                  setShippingMethod(
                    event.target.value as 'regular' | 'express',
                  );
                  setError('');
                }}
                className="w-full rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
              >
                <option value="regular">Reguler</option>
                <option value="express">Express</option>
              </select>
            </div>
          </section>

          {/* PRODUCT */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-bold">Product</h2>

            {/* Search */}
            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Search Product
              </label>

              <input
                value={
                  selectedProduct
                    ? `${selectedProduct.name} — ${selectedProduct.version}`
                    : productSearch
                }
                onChange={(event) => {
                  setSelectedProduct(null);
                  setProductSearch(event.target.value);
                  setError('');
                }}
                placeholder="Search by product name or version..."
                className="w-full rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-blue-500"
              />

              {!selectedProduct && productSearch.trim() && (
                <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-blue-900/50 bg-[#0a1024]">
                  {productsLoading ? (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      Loading products...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      Product tidak ditemukan.
                    </div>
                  ) : (
                    filteredProducts.map((product) => (
                      <button
                        key={product._id}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(product);
                          setProductSearch('');
                          setError('');
                        }}
                        className="block w-full border-b border-white/5 px-4 py-3 text-left transition last:border-b-0 hover:bg-blue-950/50"
                      >
                        <p className="text-sm font-semibold text-white">
                          {product.name}
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          Version: {product.version}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected Product */}
            {selectedProduct && (
              <div className="mt-4 rounded-lg border border-blue-800/50 bg-blue-950/20 p-4">
                <p className="font-semibold text-blue-300">
                  {selectedProduct.name}
                </p>

                <p className="mt-1 text-sm text-gray-400">
                  Version: {selectedProduct.version}
                </p>
              </div>
            )}

            {/* Quantity & Price */}
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Quantity
                </label>

                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(Math.max(1, Number(event.target.value) || 1));
                    setError('');
                  }}
                  className="w-full rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Price
                </label>

                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(event) => {
                    setPrice(Math.max(0, Number(event.target.value) || 0));
                    setError('');
                  }}
                  className="w-full rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Total */}
            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-5">
              <span className="text-sm text-gray-400">Total</span>

              <span className="text-xl font-bold text-blue-300">
                {total.toFixed(2)}
              </span>
            </div>
          </section>

          {/* ERROR */}
          {error && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ACTION */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/customer-orders')}
              className="rounded-lg border border-white/10 px-5 py-3 text-sm font-medium text-gray-300 transition hover:bg-white/5"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
