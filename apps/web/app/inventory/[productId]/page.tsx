'use client';

import { use, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { AdminHeader } from '@/components/layout/AdminHeader';
import { apiFetch } from '@/lib/api';
import { getProducts, type Product } from '@/lib/api/products';
import { getInventoryByProduct, getStockMovements } from '@/lib/api/inventory';
import { inventoryKeys } from '@/lib/api/inventoryKeys';

interface InventoryDetailPageProps {
  params: Promise<{ productId: string }>;
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

interface TransferStockInput {
  sourceProductId: string;
  destinationProductId: string;
  quantity: number;
}

interface TransferStockResult {
  transferId: string;
  source: { productId: string; quantity: number };
  destination: { productId: string; quantity: number };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function movementLabel(referenceType?: string) {
  switch (referenceType) {
    case 'production_order':
      return 'Production Order';
    case 'customer_order':
      return 'Customer Order';
    case 'stock_transfer':
      return 'Transfer Stock';
    default:
      return referenceType || 'Stock Movement';
  }
}

export default function InventoryDetailPage({
  params,
}: InventoryDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { productId } = use(params);

  const [transferOpen, setTransferOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [destinationProductId, setDestinationProductId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');

  const inventoryQuery = useQuery({
    queryKey: inventoryKeys.detail(productId),
    queryFn: () => getInventoryByProduct(productId),
  });

  const movementsQuery = useQuery({
    queryKey: inventoryKeys.movements(productId),
    queryFn: () => getStockMovements(productId),
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
    enabled: transferOpen,
  });

  const inventory = inventoryQuery.data;
  const movements = movementsQuery.data ?? [];
  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  );
  const sourceQuantity = inventory?.quantity ?? 0;
  const sourceAllocated = inventory?.allocatedQuantity ?? 0;
  const sourceAvailable = Math.max(sourceQuantity - sourceAllocated, 0);

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return products.filter((product: Product) => {
      if (product._id === productId) return false;
      if (!term) return true;
      return [product.name, product.version, product.body]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [products, productSearch, productId]);

  const selectedDestination = products.find(
    (product: Product) => product._id === destinationProductId,
  );

  const transferMutation = useMutation({
    mutationFn: async () => {
      const quantity = Number(transferQuantity);
      if (!destinationProductId)
        throw new Error('Pilih produk tujuan terlebih dahulu.');
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new Error(
          'Jumlah transfer harus berupa bilangan bulat lebih dari 0.',
        );
      }
      if (quantity > sourceAvailable) {
        throw new Error(
          `Stok yang bisa ditransfer hanya ${sourceAvailable} pcs.`,
        );
      }

      return apiFetch<ApiResponse<TransferStockResult>>(
        '/api/inventory/transfer',
        {
          method: 'POST',
          body: JSON.stringify({
            sourceProductId: productId,
            destinationProductId,
            quantity,
          } satisfies TransferStockInput),
        },
      );
    },
    onSuccess: async (response) => {
      setTransferError('');
      setTransferSuccess(response.message || 'Transfer stock berhasil.');
      setTransferOpen(false);
      setProductSearch('');
      setDestinationProductId('');
      setTransferQuantity('');

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.detail(productId),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.movements(productId),
        }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({
          queryKey: ['inventory', destinationProductId],
        }),
      ]);
    },
    onError: (error) => {
      setTransferSuccess('');
      setTransferError(
        error instanceof Error
          ? error.message
          : 'Gagal melakukan transfer stock.',
      );
    },
  });

  function openTransferModal() {
    setTransferError('');
    setTransferSuccess('');
    setProductSearch('');
    setDestinationProductId('');
    setTransferQuantity('');
    setTransferOpen(true);
  }

  if (inventoryQuery.isLoading || movementsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Inventory Detail"
          subtitle="Finished goods inventory"
        />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6 text-sm text-gray-500">
            Loading inventory...
          </div>
        </main>
      </div>
    );
  }

  if (inventoryQuery.isError || !inventory) {
    return (
      <div className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Inventory Detail"
          subtitle="Finished goods inventory"
        />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
            <p className="text-sm text-red-400">
              {inventoryQuery.error instanceof Error
                ? inventoryQuery.error.message
                : 'Inventory tidak ditemukan.'}
            </p>
            <button
              type="button"
              onClick={() => router.push('/inventory')}
              className="mt-4 rounded-lg border border-blue-800/50 px-3 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
            >
              Kembali
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Inventory Detail"
        subtitle="Finished goods inventory"
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => router.push('/inventory')}
          className="mb-6 rounded-lg border border-blue-800/50 px-3 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
        >
          ← Inventory
        </button>

        {transferSuccess && (
          <div className="mb-5 rounded-lg border border-green-900/50 bg-green-950/20 px-4 py-3 text-sm text-green-400">
            {transferSuccess}
          </div>
        )}
        {transferError && !transferOpen && (
          <div className="mb-5 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
            {transferError}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-blue-900/40 bg-[#0a1024] p-6">
            <p className="text-sm text-gray-500">Product</p>
            <h2 className="mt-2 text-2xl font-bold">
              {inventory.product.name}
            </h2>
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-gray-400">
                Version:{' '}
                <span className="text-white">{inventory.product.version}</span>
              </p>
              <p className="text-gray-400">
                Body:{' '}
                <span className="text-white">{inventory.product.body}</span>
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-green-900/40 bg-green-950/10 p-6">
            <p className="text-sm text-gray-500">Current Stock</p>
            <p className="mt-2 text-4xl font-bold text-green-400">
              {inventory.quantity}
            </p>
            <p className="mt-2 text-sm text-gray-500">Finished goods on hand</p>
            <p className="mt-1 text-xs text-gray-500">
              Allocated: {sourceAllocated} · Available to transfer:{' '}
              {sourceAvailable}
            </p>
            <button
              type="button"
              onClick={openTransferModal}
              disabled={sourceAvailable <= 0}
              className="mt-5 rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Transfer Stock to Product
            </button>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-4">
            <h3 className="text-xl font-bold">Stock Movement</h3>
            <p className="mt-1 text-sm text-gray-500">
              Inventory history for this product.
            </p>
          </div>
          {movements.length === 0 ? (
            <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6 text-sm text-gray-500">
              Belum ada stock movement.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="border-b border-blue-900/40 bg-blue-950/20">
                    <tr>
                      <th className="px-5 py-4 font-semibold text-blue-300">
                        Date
                      </th>
                      <th className="px-5 py-4 font-semibold text-blue-300">
                        Type
                      </th>
                      <th className="px-5 py-4 text-right font-semibold text-blue-300">
                        Quantity
                      </th>
                      <th className="px-5 py-4 font-semibold text-blue-300">
                        Reference
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => {
                      const movementWithReference =
                        movement as typeof movement & {
                          referenceType?: string;
                        };
                      const isOut = movement.type === 'OUT';
                      return (
                        <tr
                          key={movement._id}
                          className="border-b border-blue-900/20 transition hover:bg-blue-950/20"
                        >
                          <td className="px-5 py-4 text-gray-400">
                            {formatDate(movement.createdAt)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-medium ${isOut ? 'border-red-800/50 bg-red-950/20 text-red-400' : 'border-green-800/50 bg-green-950/20 text-green-400'}`}
                            >
                              {movement.type}
                            </span>
                          </td>
                          <td
                            className={`px-5 py-4 text-right font-bold ${isOut ? 'text-red-400' : 'text-green-400'}`}
                          >
                            {isOut ? '-' : '+'}
                            {movement.quantity}
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-gray-400">
                              {movementLabel(
                                movementWithReference.referenceType,
                              )}
                            </span>
                            <div className="mt-1 font-mono text-xs text-blue-300">
                              {movement.referenceId}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {transferOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
            <div className="mx-auto my-10 max-w-xl rounded-2xl border border-blue-900/50 bg-[#0a1024] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Transfer Stock</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Pindahkan stok fisik dari produk ini ke produk lain.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="rounded-lg border border-blue-900/50 px-3 py-1.5 text-sm text-gray-300 hover:bg-blue-950"
                >
                  Tutup
                </button>
              </div>

              <div className="mt-5 rounded-lg border border-blue-900/30 bg-[#070b1a] p-4 text-sm">
                <p className="text-gray-500">Produk asal</p>
                <p className="mt-1 font-semibold">
                  {inventory.product.name} — {inventory.product.version}
                </p>
                <p className="mt-1 text-gray-400">
                  Stok: {sourceQuantity} · Tersedia untuk transfer:{' '}
                  {sourceAvailable}
                </p>
              </div>

              <label className="mt-5 block text-sm text-gray-300">
                Cari produk tujuan
                <input
                  value={productSearch}
                  onChange={(event) => {
                    setProductSearch(event.target.value);
                    setDestinationProductId('');
                  }}
                  placeholder="Ketik nama, version, atau body produk..."
                  className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2.5 text-white outline-none focus:border-blue-500"
                />
              </label>

              <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-blue-900/40 bg-[#070b1a]">
                {productsQuery.isLoading ? (
                  <p className="p-3 text-sm text-gray-500">Memuat produk...</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500">
                    Produk tidak ditemukan.
                  </p>
                ) : (
                  filteredProducts.map((product: Product) => (
                    <button
                      key={product._id}
                      type="button"
                      onClick={() => {
                        setDestinationProductId(product._id);
                        setProductSearch(
                          `${product.name} — ${product.version}`,
                        );
                        setTransferError('');
                      }}
                      className={`block w-full border-b border-blue-900/20 px-3 py-3 text-left text-sm transition hover:bg-blue-950/40 ${destinationProductId === product._id ? 'bg-blue-950/50 text-blue-200' : 'text-gray-200'}`}
                    >
                      <span className="block font-medium">{product.name}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        Version: {product.version || '-'} · Body:{' '}
                        {product.body || '-'}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {selectedDestination && (
                <div className="mt-3 rounded-lg border border-green-900/40 bg-green-950/10 p-3 text-sm text-green-300">
                  Tujuan dipilih: {selectedDestination.name} —{' '}
                  {selectedDestination.version}
                </div>
              )}

              <label className="mt-5 block text-sm text-gray-300">
                Quantity transfer
                <input
                  type="number"
                  min={1}
                  max={sourceAvailable}
                  step={1}
                  value={transferQuantity}
                  onChange={(event) => setTransferQuantity(event.target.value)}
                  placeholder={`Maksimal ${sourceAvailable}`}
                  className="mt-1 w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-3 py-2.5 text-white outline-none focus:border-blue-500"
                />
              </label>

              {transferQuantity &&
                Number.isInteger(Number(transferQuantity)) &&
                Number(transferQuantity) > 0 &&
                selectedDestination && (
                  <div className="mt-4 rounded-lg border border-blue-900/30 bg-[#070b1a] p-4 text-sm">
                    <p className="font-semibold">Ringkasan transfer</p>
                    <div className="mt-2 flex justify-between gap-4 text-gray-400">
                      <span>Stok asal setelah transfer</span>
                      <span className="font-semibold text-white">
                        {sourceQuantity - Number(transferQuantity)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Stok tujuan akan bertambah {Number(transferQuantity)} pcs.
                    </p>
                  </div>
                )}

              {transferError && (
                <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
                  {transferError}
                </div>
              )}

              <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-blue-900/30 pt-5">
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="rounded-lg border border-blue-900/50 px-4 py-2 text-sm text-gray-300 hover:bg-blue-950"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => transferMutation.mutate()}
                  disabled={
                    transferMutation.isPending ||
                    !destinationProductId ||
                    !transferQuantity
                  }
                  className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {transferMutation.isPending
                    ? 'Memproses...'
                    : 'Konfirmasi Transfer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
