'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getProducts } from '@/lib/api/products';

type ProductInfo = {
  _id: string;
  name: string;
  version?: string | number;
  body?: string;
};

type ProductionRequirement = {
  product: ProductInfo;
  demandQuantity: number;
  inventory: {
    physicalQuantity: number;
    allocatedQuantity: number;
    availableQuantity: number;
  };
  production: {
    plannedQuantity: number;
    inProgressQuantity: number;
    totalQuantity: number;
  };
  totalSupply: number;
  productionNeed: number;
};

type RequirementsResponse =
  | ProductionRequirement[]
  | {
      data?:
        | ProductionRequirement[]
        | {
            data?: ProductionRequirement[];
            requirements?: ProductionRequirement[];
          };
      requirements?: ProductionRequirement[];
    };

type CreateBatchResponse = {
  success?: boolean;
  message?: string;
  data?: unknown;
};

const panelClass =
  'rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4';

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-100';

const labelClass = 'mb-1 block text-xs font-medium text-slate-700';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Terjadi kesalahan. Silakan coba lagi.';
}

export default function CreateProductionOrderPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');

  // Nilai string agar input boleh kosong saat diedit.
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, string>
  >({});

  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: requirements = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ProductionRequirement[]>({
    queryKey: ['production-requirements'],
    queryFn: async () => {
      const response = await apiFetch<RequirementsResponse>(
        '/api/production-requirements',
      );

      if (Array.isArray(response)) {
        return response;
      }

      if (Array.isArray(response.data)) {
        return response.data;
      }

      if (response.data && !Array.isArray(response.data)) {
        if (Array.isArray(response.data.data)) {
          return response.data.data;
        }

        if (Array.isArray(response.data.requirements)) {
          return response.data.requirements;
        }
      }

      if (Array.isArray(response.requirements)) {
        return response.requirements;
      }

      throw new Error(
        'Format respons production requirements tidak sesuai. Periksa respons API.',
      );
    },
  });

  const {
    data: products = [],
    isLoading: isProductsLoading,
    isError: isProductsError,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery<ProductInfo[]>({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const allProductRequirements = useMemo(() => {
    const requirementsByProduct = new Map(
      requirements.map((requirement) => [
        requirement.product._id,
        requirement,
      ]),
    );

    return products.map((product) => {
      const requirement = requirementsByProduct.get(product._id);
      if (requirement) return requirement;

      return {
        product,
        demandQuantity: 0,
        inventory: {
          physicalQuantity: 0,
          allocatedQuantity: 0,
          availableQuantity: 0,
        },
        production: {
          plannedQuantity: 0,
          inProgressQuantity: 0,
          totalQuantity: 0,
        },
        totalSupply: 0,
        productionNeed: 0,
      };
    });
  }, [products, requirements]);

  const selectedIds = Object.keys(selectedProducts);
  const selectedCount = selectedIds.length;

  const totalQuantity = Object.values(selectedProducts).reduce(
    (total, value) => {
      const quantity = Number(value);

      return (
        total + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0)
      );
    },
    0,
  );

  const filteredRequirements = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id-ID');

    return allProductRequirements.filter(
      (requirement) => {
        if (!requirement?.product?._id) {
          return false;
        }

        const product = requirement.product;

        const searchableText = [
          product.name,
          product.version,
          product.body,
          product._id,
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(' ')
          .toLocaleLowerCase('id-ID');

        const matchesSearch =
          keyword.length === 0 || searchableText.includes(keyword);
        return matchesSearch;
      },
    );
  }, [allProductRequirements, search]);

  const selectedRequirements = allProductRequirements.filter((requirement) =>
    Object.prototype.hasOwnProperty.call(
      selectedProducts,
      requirement.product._id,
    ),
  );

  function changeQuantity(productId: string, value: string) {
    // Jangan paksa kembali ke 1 saat input dikosongkan.
    setSelectedProducts((current) => ({
      ...current,
      [productId]: value,
    }));
  }

  function removeProduct(productId: string) {
    setSelectedProducts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  function clearSelection() {
    setSelectedProducts({});
  }

  function addProduct(productId: string) {
    setSelectedProducts((current) => {
      if (Object.prototype.hasOwnProperty.call(current, productId)) {
        return current;
      }

      return { ...current, [productId]: '1' };
    });
    setSearch('');
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage('');
    setNotice('');

    if (selectedCount === 0) {
      setErrorMessage('Pilih minimal satu produk terlebih dahulu.');
      return;
    }

    // Validasi quantity sebelum dikirim ke backend.
    const invalidProduct = selectedIds.find((productId) => {
      const rawQuantity = selectedProducts[productId];

      if (rawQuantity.trim() === '') return true;

      const quantity = Number(rawQuantity);
      const requirement = requirements.find(
        (item) => item.product._id === productId,
      );
      const minimum = Math.max(1, Number(requirement?.productionNeed) || 0);

      return !Number.isInteger(quantity) || quantity < minimum;
    });

    if (invalidProduct) {
      const product = requirements.find(
        (item) => item.product._id === invalidProduct,
      )?.product;

      setErrorMessage(
        `Jumlah produksi untuk "${product?.name ?? 'produk yang dipilih'}" harus memenuhi kebutuhan produksi minimal ${formatNumber(Math.max(1, Number(requirements.find((item) => item.product._id === invalidProduct)?.productionNeed) || 0))} unit.`,
      );
      return;
    }

    if (!plannedStartDate || !plannedEndDate) {
      setErrorMessage('Tanggal mulai dan tanggal selesai wajib diisi.');
      return;
    }

    if (plannedEndDate < plannedStartDate) {
      setErrorMessage(
        'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.',
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const createdProductIds: string[] = [];
      let failure: { productName: string; message: string } | null = null;

      // Setiap produk dibuat terpisah agar masing-masing mendapat batch dan PO sendiri.
      for (const productId of selectedIds) {
        const product = requirements.find(
          (item) => item.product._id === productId,
        )?.product;

        try {
          const response = await apiFetch<CreateBatchResponse>(
            '/api/production-batches/from-requirements',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: [
                  {
                    product: productId,
                    quantity: Number(selectedProducts[productId]),
                  },
                ],
                plannedStartDate,
                plannedEndDate,
                notes: notes.trim(),
              }),
            },
          );

          if (response?.success === false) {
            throw new Error(response.message || 'Gagal membuat batch.');
          }

          createdProductIds.push(productId);
        } catch (err) {
          failure = {
            productName: product?.name ?? productId,
            message: getErrorMessage(err),
          };
          break;
        }
      }

      if (createdProductIds.length > 0) {
        setSelectedProducts((current) => {
          const remaining = { ...current };
          for (const productId of createdProductIds) delete remaining[productId];
          return remaining;
        });
      }

      if (failure) {
        setNotice(
          createdProductIds.length > 0
            ? `${createdProductIds.length} produk berhasil dibuat. Produk berikutnya belum dibuat.`
            : '',
        );
        setErrorMessage(
          `Gagal membuat batch untuk ${failure.productName}: ${failure.message}`,
        );
      } else {
        setNotice(
          `${createdProductIds.length} Production Batch dan Production Order berhasil dibuat, satu untuk setiap produk.`,
        );
        setPlannedStartDate('');
        setPlannedEndDate('');
        setNotes('');
      }
      setSearch('');

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['production-requirements'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['unassigned-orders'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['production-planning'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['admin-production-orders'],
        }),
      ]);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-white px-2 py-4 text-slate-900 sm:px-3 sm:py-6">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <header className="relative overflow-hidden rounded-2xl bg-white px-1 py-2">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-64 rotate-[32deg] bg-gradient-to-r from-red-600 to-blue-800 opacity-95" />
          <div className="relative flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#102b59] text-lg font-black text-white shadow-sm">
              FS
            </div>
            <div className="min-w-0">
              <p className="text-xl font-extrabold tracking-tight text-[#102b59]">
                Fahrul Store
              </p>
              <h1 className="mt-0.5 text-sm font-bold text-[#101d3b]">
                Create Production Order
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Buat batch dan PO dari produk terpilih.
              </p>
            </div>
          </div>
          <nav
            aria-label="Navigasi Admin Produksi"
            className="relative mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
          >
            <Link
              href="/admin-produksi"
              className="flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 sm:text-sm"
            >
              Planning
            </Link>
            <Link
              href="/admin-produksi/create-order"
              aria-current="page"
              className="flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-red-600 to-blue-600 px-3 py-2 text-center text-xs font-bold text-white shadow-sm sm:text-sm"
            >
              Create Order
            </Link>
          </nav>
          <div className="relative mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-500">Produk dipilih</p>
              <p className="mt-0.5 text-lg font-extrabold">
                {formatNumber(selectedCount)}
              </p>
            </div>
            <div className="rounded-xl bg-red-50 p-2.5">
              <p className="text-[11px] text-red-700">Total produksi</p>
              <p className="mt-0.5 text-lg font-extrabold text-red-800">
                {formatNumber(totalQuantity)} unit
              </p>
            </div>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <p>{notice}</p>
            <Link
              href="/admin-produksi/assignment"
              className="font-semibold underline underline-offset-4"
            >
              Lanjut ke Assignment
            </Link>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={createBatch} className={`${panelClass} space-y-4`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Jadwal</p>
            <h2 className="mt-1 text-lg font-bold">Jadwal Produksi</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="planned-start" className={labelClass}>Tanggal mulai</label>
                <input id="planned-start" type="date" value={plannedStartDate} onChange={(event) => setPlannedStartDate(event.target.value)} required className={inputClass} />
              </div>
              <div>
                <label htmlFor="planned-end" className={labelClass}>Tanggal selesai</label>
                <input id="planned-end" type="date" value={plannedEndDate} min={plannedStartDate || undefined} onChange={(event) => setPlannedEndDate(event.target.value)} required className={inputClass} />
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="batch-notes" className={labelClass}>Catatan (opsional)</label>
              <textarea id="batch-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan produksi (opsional)" rows={2} className={inputClass} />
            </div>
          </div>

          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Pilih Produk</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Satu produk dibuat menjadi satu batch dan PO.
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">
                {formatNumber(selectedCount)} dipilih
              </span>
            </div>

            <div className="mt-4">
              <input
                id="product-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, versi, atau jenis produk..."
                className={inputClass}
                autoComplete="off"
              />

              {search.trim() && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {isLoading || isProductsLoading ? (
                    <p className="px-4 py-4 text-sm text-slate-500">Memuat produk...</p>
                  ) : isError || isProductsError ? (
                    <div className="px-4 py-4">
                      <p className="text-sm text-red-700">Gagal memuat produk: {getErrorMessage(productsError ?? error)}</p>
                      <button type="button" onClick={() => { void refetch(); void refetchProducts(); }} className="mt-2 text-sm font-semibold text-red-600">Coba lagi</button>
                    </div>
                  ) : filteredRequirements.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-slate-500">Produk tidak ditemukan.</p>
                  ) : (
                    filteredRequirements.map((requirement) => {
                      const product = requirement.product;
                      const alreadySelected = Object.prototype.hasOwnProperty.call(selectedProducts, product._id);
                      return (
                        <button
                          key={product._id}
                          type="button"
                          disabled={alreadySelected}
                          onClick={() => addProduct(product._id)}
                          className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-red-50/50 disabled:cursor-default disabled:opacity-60"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900">{product.name}</span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {[product.version ? `Versi ${product.version}` : '', product.body ? `Jenis ${product.body}` : ''].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-red-600">{alreadySelected ? 'Ditambahkan' : '+ Tambah'}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Produk dipilih</h3>
                <span className="text-xs text-slate-500">{selectedCount} produk</span>
              </div>
              {selectedRequirements.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center">
                  <p className="text-xs text-slate-500">Belum ada produk dipilih.</p>
                </div>
              ) : selectedRequirements.map((requirement) => {
                const product = requirement.product;
                return (
                  <article key={product._id} className="rounded-lg border border-red-100 bg-red-50/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-bold text-slate-900">{product.name}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {[product.version ? `Versi ${product.version}` : '', product.body ? `Jenis ${product.body}` : ''].filter(Boolean).join(' · ') || `ID: ${product._id}`}
                        </p>
                      </div>
                      <button type="button" onClick={() => removeProduct(product._id)} className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Hapus</button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {[
                        ['Kebutuhan', requirement.productionNeed],
                        ['Stok tersedia', requirement.inventory.availableQuantity],
                        ['Terencana', requirement.production.plannedQuantity],
                        ['Dalam proses', requirement.production.inProgressQuantity],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md bg-white p-2">
                          <p className="text-[11px] text-slate-500">{label}</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatNumber(Number(value))}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 max-w-xs">
                      <label htmlFor={`quantity-${product._id}`} className={labelClass}>Jumlah produksi</label>
                      <input
                        id={`quantity-${product._id}`}
                        type="number"
                        min={1}
                        step={1}
                        value={selectedProducts[product._id]}
                        onChange={(event) => changeQuantity(product._id, event.target.value)}
                        aria-describedby={`quantity-help-${product._id}`}
                        className={inputClass}
                      />
                      <p id={`quantity-help-${product._id}`} className="mt-1 text-[11px] text-slate-500">Minimal {formatNumber(Math.max(1, Number(requirement.productionNeed) || 0))} unit.</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold">Ringkasan</h2>
                <p className="mt-0.5 text-xs text-slate-500">{selectedCount} produk · {formatNumber(totalQuantity)} unit</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={clearSelection} disabled={selectedCount === 0 || isSubmitting} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Hapus pilihan</button>
              <button type="submit" disabled={isSubmitting || isLoading || isError || isProductsLoading || isProductsError} className="min-h-12 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? 'Membuat batch dan PO...' : 'Buat Batch & PO'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
