'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

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
  message?: string;
  data?: unknown;
};

type ListFilter = 'all' | 'selected' | 'unselected';

const panelClass =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6';

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-100';

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

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
  const [listFilter, setListFilter] = useState<ListFilter>('all');

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

    return (Array.isArray(requirements) ? requirements : []).filter(
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

        const isSelected = Object.prototype.hasOwnProperty.call(
          selectedProducts,
          product._id,
        );

        const matchesFilter =
          listFilter === 'all' ||
          (listFilter === 'selected' && isSelected) ||
          (listFilter === 'unselected' && !isSelected);

        return matchesSearch && matchesFilter;
      },
    );
  }, [requirements, search, listFilter, selectedProducts]);

  function toggleProduct(productId: string) {
    setSelectedProducts((current) => {
      const next = { ...current };

      if (Object.prototype.hasOwnProperty.call(next, productId)) {
        delete next[productId];
      } else {
        next[productId] = '1';
      }

      return next;
    });
  }

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

      return !Number.isInteger(quantity) || quantity < 1;
    });

    if (invalidProduct) {
      const product = requirements.find(
        (item) => item.product._id === invalidProduct,
      )?.product;

      setErrorMessage(
        `Jumlah produksi untuk "${product?.name ?? 'produk yang dipilih'}" harus berupa bilangan bulat minimal 1.`,
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

    const items = selectedIds.map((product) => ({
      product,
      quantity: Number(selectedProducts[product]),
    }));

    setIsSubmitting(true);

    try {
      const response = await apiFetch<CreateBatchResponse>(
        '/api/production-batches/from-requirements',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items,
            plannedStartDate,
            plannedEndDate,
            notes: notes.trim(),
          }),
        },
      );

      setNotice(response?.message || 'Production batch berhasil dibuat.');
      setSelectedProducts({});
      setPlannedStartDate('');
      setPlannedEndDate('');
      setNotes('');
      setSearch('');
      setListFilter('all');

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
      ]);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-red-700 via-red-600 to-blue-800 p-5 text-white shadow-lg sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-red-100">ADMIN PRODUKSI</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                Create Production Order
              </h1>
              <p className="mt-2 max-w-xl text-sm text-red-50">
                Cari produk, pilih kebutuhan produksi, lalu buat batch produksi
                dalam satu proses.
              </p>
            </div>

            <Link
              href="/admin-produksi"
              className="inline-flex w-fit items-center justify-center rounded-xl border border-white/40 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10"
            >
              Kembali ke Planning
            </Link>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 sm:flex-row sm:items-center sm:justify-between"
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
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <section className={panelClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">Pilih Produk</h2>
              <p className="mt-1 text-sm text-slate-500">
                Gunakan pencarian agar tidak perlu scroll seluruh produk.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {formatNumber(selectedCount)} produk dipilih
              </span>
              <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                {formatNumber(totalQuantity)} unit
              </span>
            </div>
          </div>

          <div className="mt-5">
            <label htmlFor="product-search" className={labelClass}>
              Cari nama produk, versi, jenis, atau ID
            </label>

            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
              </span>

              <input
                id="product-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Contoh: Spider-Man, Red Edition..."
                className={`${inputClass} pl-10 pr-10`}
                autoComplete="off"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Hapus pencarian"
                  className="absolute inset-y-0 right-3 my-auto text-sm text-slate-500 hover:text-red-600"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2" aria-label="Filter produk">
              {(
                [
                  ['all', 'Semua produk'],
                  ['selected', 'Sudah dipilih'],
                  ['unselected', 'Belum dipilih'],
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
                {formatNumber(filteredRequirements.length)}
              </span>{' '}
              dari {formatNumber(requirements.length)} produk
            </p>
          </div>

          {isLoading && (
            <div className="py-12 text-center text-sm text-slate-500">
              Memuat daftar produk...
            </div>
          )}

          {isError && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                Gagal memuat produk: {getErrorMessage(error)}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Coba lagi
              </button>
            </div>
          )}

          {!isLoading && !isError && (
            <div className="mt-5">
              {filteredRequirements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center">
                  <p className="font-semibold text-slate-700">
                    Produk tidak ditemukan
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Coba kata kunci lain atau ubah filter produk.
                  </p>
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
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequirements.map((requirement) => {
                    const product = requirement.product;
                    const isSelected = Object.prototype.hasOwnProperty.call(
                      selectedProducts,
                      product._id,
                    );

                    return (
                      <article
                        key={product._id}
                        className={`rounded-xl border p-4 transition ${
                          isSelected
                            ? 'border-red-300 bg-red-50/50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            id={`product-${product._id}`}
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProduct(product._id)}
                            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-red-600"
                          />

                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`product-${product._id}`}
                              className="block cursor-pointer"
                            >
                              <span className="block break-words font-semibold text-slate-900">
                                {product.name}
                              </span>

                              <span className="mt-1 block break-all text-xs text-slate-500">
                                ID: {product._id}
                              </span>

                              {(product.version || product.body) && (
                                <span className="mt-1 block text-sm text-slate-600">
                                  {[
                                    product.version
                                      ? `Versi: ${product.version}`
                                      : '',
                                    product.body
                                      ? `Jenis: ${product.body}`
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              )}
                            </label>

                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <div className="rounded-lg bg-white p-2.5">
                                <p className="text-xs text-slate-500">
                                  Kebutuhan
                                </p>
                                <p className="mt-1 font-semibold text-slate-900">
                                  {formatNumber(requirement.productionNeed)}
                                </p>
                              </div>

                              <div className="rounded-lg bg-white p-2.5">
                                <p className="text-xs text-slate-500">
                                  Stok tersedia
                                </p>
                                <p className="mt-1 font-semibold text-slate-900">
                                  {formatNumber(
                                    requirement.inventory.availableQuantity,
                                  )}
                                </p>
                              </div>

                              <div className="rounded-lg bg-white p-2.5">
                                <p className="text-xs text-slate-500">
                                  Terencana
                                </p>
                                <p className="mt-1 font-semibold text-slate-900">
                                  {formatNumber(
                                    requirement.production.plannedQuantity,
                                  )}
                                </p>
                              </div>

                              <div className="rounded-lg bg-white p-2.5">
                                <p className="text-xs text-slate-500">
                                  Dalam proses
                                </p>
                                <p className="mt-1 font-semibold text-slate-900">
                                  {formatNumber(
                                    requirement.production.inProgressQuantity,
                                  )}
                                </p>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="mt-4 max-w-xs">
                                <label
                                  htmlFor={`quantity-${product._id}`}
                                  className={labelClass}
                                >
                                  Jumlah produksi
                                </label>

                                <input
                                  id={`quantity-${product._id}`}
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={selectedProducts[product._id]}
                                  onChange={(event) =>
                                    changeQuantity(
                                      product._id,
                                      event.target.value,
                                    )
                                  }
                                  aria-describedby={`quantity-help-${product._id}`}
                                  className={inputClass}
                                />

                                <p
                                  id={`quantity-help-${product._id}`}
                                  className="mt-1 text-xs text-slate-500"
                                >
                                  Kosongkan sementara untuk mengetik ulang.
                                  Nilai akhir harus bilangan bulat minimal 1.
                                </p>

                                <button
                                  type="button"
                                  onClick={() => removeProduct(product._id)}
                                  className="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
                                >
                                  Hapus produk dari pilihan
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <form onSubmit={createBatch} className={panelClass}>
          <div>
            <h2 className="text-lg font-bold">Informasi Production Batch</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tentukan jadwal produksi untuk produk yang dipilih.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="planned-start" className={labelClass}>
                Tanggal mulai
              </label>
              <input
                id="planned-start"
                type="date"
                value={plannedStartDate}
                onChange={(event) => setPlannedStartDate(event.target.value)}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="planned-end" className={labelClass}>
                Tanggal selesai
              </label>
              <input
                id="planned-end"
                type="date"
                value={plannedEndDate}
                min={plannedStartDate || undefined}
                onChange={(event) => setPlannedEndDate(event.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="batch-notes" className={labelClass}>
              Catatan (opsional)
            </label>
            <textarea
              id="batch-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Tambahkan catatan produksi..."
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">Total produk dipilih</span>
              <span className="font-semibold text-slate-900">
                {formatNumber(selectedCount)} produk
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">Total unit produksi</span>
              <span className="font-semibold text-slate-900">
                {formatNumber(totalQuantity)} unit
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedCount === 0 || isSubmitting}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Hapus semua pilihan
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isLoading || isError}
              className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Membuat batch...' : 'Buat Production Batch'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
