'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

import { AdminHeader } from '@/components/layout/AdminHeader';
import { DatePicker } from '@/components/ui/DatePicker';

import { getInventory, type FinishedGoodsInventory } from '@/lib/api/inventory';

import { inventoryKeys } from '@/lib/api/inventoryKeys';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
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

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default function InventoryPage() {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');

  const inventoryQuery = useQuery({
    queryKey: inventoryKeys.list(),
    queryFn: getInventory,
  });

  const inventory = useMemo(
    () => inventoryQuery.data ?? [],
    [inventoryQuery.data],
  );

  const filteredInventory = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const keywords = keyword
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    return inventory.filter((item) => {
      const searchableText = [
        item.product?.name ?? '',
        item.product?.version ?? '',
        item.product?.body ?? '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        keywords.length === 0 ||
        keywords.every((item) => searchableText.includes(item));

      const updatedDate = formatDateOnly(item.updatedAt);

      const matchesFrom =
        !updatedFrom || !updatedDate || updatedDate >= updatedFrom;

      const matchesTo = !updatedTo || !updatedDate || updatedDate <= updatedTo;

      return matchesSearch && matchesFrom && matchesTo;
    });
  }, [inventory, search, updatedFrom, updatedTo]);

  const hasFilter =
    search.trim() !== '' || updatedFrom !== '' || updatedTo !== '';

  function clearFilters() {
    setSearch('');
    setUpdatedFrom('');
    setUpdatedTo('');
  }

  function handleExportExcel() {
    const rows = filteredInventory.map((item) => {
      const allocated = item.allocatedQuantity ?? 0;

      const available =
        item.availableQuantity ?? Math.max(item.quantity - allocated, 0);

      return {
        Product: item.product?.name ?? '',
        Version: item.product?.version ?? '',
        Body: item.product?.body ?? '',
        Stock: item.quantity,
        Allocated: allocated,
        Available: available,
        'Updated Date': item.updatedAt ? formatDate(item.updatedAt) : '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');

    XLSX.writeFile(
      workbook,
      `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader title="Inventory" subtitle="Finished goods inventory" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div>
            <h2 className="text-2xl font-bold">Finished Goods</h2>

            <p className="mt-1 text-sm text-gray-500">
              Current finished goods stock.
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-900/40 bg-[#0a1024] p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto_auto] lg:items-end">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Search
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari product, version, body..."
                className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Updated From
              </label>

              <DatePicker
                value={updatedFrom}
                onChange={setUpdatedFrom}
                placeholder="Pilih tanggal awal"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Updated To
              </label>

              <DatePicker
                value={updatedTo}
                onChange={setUpdatedTo}
                placeholder="Pilih tanggal akhir"
                disabled={(date) => {
                  if (!updatedFrom) {
                    return false;
                  }

                  const startDate = new Date(`${updatedFrom}T00:00:00`);

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
              disabled={filteredInventory.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export Excel
            </button>
          </div>

          {hasFilter && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>
                {filteredInventory.length} dari {inventory.length} inventory
              </span>

              {search.trim() && (
                <>
                  <span>·</span>

                  <span>
                    Search: <span className="text-gray-300">{search}</span>
                  </span>
                </>
              )}

              {updatedFrom && (
                <>
                  <span>·</span>

                  <span>
                    From: <span className="text-gray-300">{updatedFrom}</span>
                  </span>
                </>
              )}

              {updatedTo && (
                <>
                  <span>·</span>

                  <span>
                    To: <span className="text-gray-300">{updatedTo}</span>
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {inventoryQuery.isLoading && (
          <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6 text-sm text-gray-500">
            Loading inventory...
          </div>
        )}

        {inventoryQuery.isError && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-sm text-red-400">
            {inventoryQuery.error instanceof Error
              ? inventoryQuery.error.message
              : 'Gagal mengambil inventory.'}
          </div>
        )}

        {!inventoryQuery.isLoading &&
          !inventoryQuery.isError &&
          inventory.length === 0 && (
            <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-8 text-center">
              <div className="text-4xl">📦</div>

              <h3 className="mt-4 font-semibold">Belum ada inventory</h3>

              <p className="mt-2 text-sm text-gray-500">
                Finished goods akan muncul setelah Production Order selesai.
              </p>
            </div>
          )}

        {!inventoryQuery.isLoading &&
          !inventoryQuery.isError &&
          inventory.length > 0 &&
          filteredInventory.length === 0 && (
            <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-8 text-center">
              <div className="text-4xl">🔍</div>

              <h3 className="mt-4 font-semibold">Inventory tidak ditemukan</h3>

              <p className="mt-2 text-sm text-gray-500">
                Tidak ada inventory yang sesuai dengan filter.
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

        {!inventoryQuery.isLoading &&
          !inventoryQuery.isError &&
          filteredInventory.length > 0 && (
            <InventoryTable
              inventory={filteredInventory}
              onDetail={(productId) => router.push(`/inventory/${productId}`)}
            />
          )}
      </main>
    </div>
  );
}

interface InventoryTableProps {
  inventory: FinishedGoodsInventory[];
  onDetail: (productId: string) => void;
}

function InventoryTable({ inventory, onDetail }: InventoryTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-blue-900/40 bg-blue-950/20">
            <tr>
              <th className="px-5 py-4 font-semibold text-blue-300">Product</th>

              <th className="px-5 py-4 font-semibold text-blue-300">Version</th>

              <th className="px-5 py-4 font-semibold text-blue-300">Body</th>

              <th className="px-5 py-4 text-right font-semibold text-blue-300">
                Stock
              </th>

              <th className="px-5 py-4 text-right font-semibold text-blue-300">
                Allocated
              </th>

              <th className="px-5 py-4 text-right font-semibold text-blue-300">
                Available
              </th>

              <th className="px-5 py-4 text-right font-semibold text-blue-300">
                Updated
              </th>

              <th className="px-5 py-4 text-right font-semibold text-blue-300">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {inventory.map((item) => {
              const allocated = item.allocatedQuantity ?? 0;

              const available =
                item.availableQuantity ??
                Math.max(item.quantity - allocated, 0);

              return (
                <tr
                  key={item._id}
                  className="border-b border-blue-900/20 transition hover:bg-blue-950/20"
                >
                  <td className="px-5 py-4 font-medium text-white">
                    {item.product.name}
                  </td>

                  <td className="px-5 py-4 text-gray-400">
                    {item.product.version}
                  </td>

                  <td className="px-5 py-4 text-gray-400">
                    {item.product.body}
                  </td>

                  <td className="px-5 py-4 text-right">
                    <span className="font-bold text-green-400">
                      {item.quantity}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-right">
                    <span className="font-semibold text-yellow-400">
                      {allocated}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-right">
                    <span className="font-bold text-blue-400">{available}</span>
                  </td>

                  <td className="px-5 py-4 text-right text-gray-500">
                    {formatDate(item.updatedAt)}
                  </td>

                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onDetail(item.product._id)}
                      className="rounded-lg border border-blue-800/50 px-3 py-2 text-xs font-medium text-blue-300 transition hover:bg-blue-950"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
