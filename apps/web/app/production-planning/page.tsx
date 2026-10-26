'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { DatePicker } from '@/components/ui/DatePicker';
import { AdminHeader } from '@/components/layout/AdminHeader';
import { apiFetch } from '@/lib/api';

interface ProductionRequirement {
  product: {
    _id: string;
    name: string;
    version?: string;
    body?: string;
  };

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
}

interface ProductionRequirementResponse {
  success: boolean;
  data: ProductionRequirement[];
  message?: string;
}

interface SelectedItem {
  product: string;
  quantity: number;
}

export default function ProductionPlanningPage() {
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>(
    {},
  );

  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const {
    data: requirementResponse,
    isLoading: loading,
    error: queryError,
    refetch: loadRequirements,
  } = useQuery({
    queryKey: ['production-requirements'],
    queryFn: () =>
      apiFetch<ProductionRequirementResponse>('/api/production-requirements'),
  });

  const data = requirementResponse?.data ?? [];

  const error =
    queryError instanceof Error
      ? queryError.message
      : queryError
        ? 'Gagal mengambil production requirement'
        : '';

  const selectableItems = data.filter((item) => item.productionNeed > 0);

  const selectedCount = Object.values(selectedItems).filter(
    (quantity) => quantity > 0,
  ).length;

  const selectedQuantity = Object.values(selectedItems).reduce(
    (total, quantity) => total + quantity,
    0,
  );

  const totalProductionNeed = data.reduce(
    (total, item) => total + item.productionNeed,
    0,
  );

  /**
   * Checkbox:
   * Saat product dipilih, default quantity = productionNeed.
   *
   * User tetap bisa menaikkan quantity di atas productionNeed
   * melalui input quantity.
   */
  const handleToggle = (
    productId: string,
    checked: boolean,
    defaultQuantity: number,
  ) => {
    setSelectedItems((current) => {
      const next = { ...current };

      if (checked) {
        next[productId] = defaultQuantity;
      } else {
        delete next[productId];
      }

      return next;
    });
  };

  /**
   * Quantity TIDAK dibatasi productionNeed.
   *
   * Contoh:
   * Need = 10
   * User boleh input 10, 20, 50, 100, dst.
   */
  const handleQuantityChange = (productId: string, value: string) => {
    if (value === '') {
      setSelectedItems((current) => {
        const next = { ...current };

        delete next[productId];

        return next;
      });

      return;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return;
    }

    const quantity = Math.max(Math.floor(parsed), 0);

    setSelectedItems((current) => {
      const next = { ...current };

      if (quantity <= 0) {
        delete next[productId];
      } else {
        next[productId] = quantity;
      }

      return next;
    });
  };

  const handleCreateBatch = async () => {
    const items: SelectedItem[] = Object.entries(selectedItems)
      .filter(([, quantity]) => quantity > 0)
      .map(([product, quantity]) => ({
        product,
        quantity,
      }));

    if (items.length === 0) {
      alert('Pilih minimal satu product.');

      return;
    }

    if (
      plannedStartDate &&
      plannedEndDate &&
      plannedEndDate < plannedStartDate
    ) {
      alert('Planned End Date tidak boleh lebih awal dari Planned Start Date.');

      return;
    }

    try {
      setCreating(true);

      const response = await apiFetch<{
        success: boolean;
        message?: string;
        data?: {
          batch: {
            _id: string;
            batchNumber: string;
          };
          orders: {
            _id: string;
            orderNumber: string;
          }[];
        };
      }>('/api/production-batches/from-requirements', {
        method: 'POST',
        body: JSON.stringify({
          plannedStartDate: plannedStartDate || null,
          plannedEndDate: plannedEndDate || null,
          notes: notes.trim() || '',
          items,
        }),
      });

      if (!response.success) {
        throw new Error(response.message ?? 'Gagal membuat production batch.');
      }

      setSelectedItems({});
      setPlannedStartDate('');
      setPlannedEndDate('');
      setNotes('');

      await loadRequirements();

      const batchNumber = response.data?.batch?.batchNumber ?? '-';

      const orderCount = response.data?.orders?.length ?? 0;

      alert(
        `Production Batch ${batchNumber} berhasil dibuat dengan ${orderCount} Production Order.`,
      );
    } catch (error) {
      console.error('Create production batch error:', error);

      alert(
        error instanceof Error
          ? error.message
          : 'Gagal membuat production batch.',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Production Planning"
        subtitle="Plan production based on customer orders and inventory"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Production Requirement</h2>

            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Hitung kebutuhan produksi berdasarkan customer order, finished
              goods inventory, dan production yang sedang berjalan.
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadRequirements()}
            disabled={loading}
            className="rounded-lg border border-blue-800/50 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Summary */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-5">
            <p className="text-sm text-gray-500">Products</p>

            <p className="mt-2 text-3xl font-bold text-white">{data.length}</p>

            <p className="mt-1 text-xs text-gray-600">
              Products with demand or production
            </p>
          </div>

          <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-5">
            <p className="text-sm text-gray-500">Total Production Needed</p>

            <p className="mt-2 text-3xl font-bold text-red-400">
              {totalProductionNeed}
            </p>

            <p className="mt-1 text-xs text-gray-600">
              Additional units required
            </p>
          </div>

          <div className="rounded-xl border border-blue-900/40 bg-blue-950/10 p-5">
            <p className="text-sm text-gray-500">Selected</p>

            <p className="mt-2 text-3xl font-bold text-blue-400">
              {selectedQuantity}
            </p>

            <p className="mt-1 text-xs text-gray-600">
              {selectedCount} product selected
            </p>
          </div>
        </div>

        {/* Requirement Table */}
        <div className="mb-6 overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024]">
          <div className="flex flex-col gap-2 border-b border-blue-900/40 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-white">
                Production Requirement
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Pilih product yang membutuhkan tambahan produksi.
              </p>
            </div>

            <div className="text-sm text-gray-500">
              {selectableItems.length} product membutuhkan produksi
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-gray-500">
              Loading production requirement...
            </div>
          ) : data.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl">🏭</div>

              <p className="mt-4 text-sm text-gray-400">
                Tidak ada production requirement.
              </p>

              <p className="mt-1 text-xs text-gray-600">
                Customer order atau production data belum menghasilkan kebutuhan
                produksi.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-blue-900/40 bg-blue-950/20">
                  <tr>
                    <th className="w-16 px-5 py-4 text-center font-semibold text-blue-300">
                      Select
                    </th>

                    <th className="px-5 py-4 font-semibold text-blue-300">
                      Product
                    </th>

                    <th className="px-5 py-4 text-right font-semibold text-blue-300">
                      Demand
                    </th>

                    <th className="px-5 py-4 text-right font-semibold text-blue-300">
                      Available
                    </th>

                    <th className="px-5 py-4 text-right font-semibold text-blue-300">
                      Planned
                    </th>

                    <th className="px-5 py-4 text-right font-semibold text-blue-300">
                      In Progress
                    </th>

                    <th className="px-5 py-4 text-right font-semibold text-blue-300">
                      Total Supply
                    </th>

                    <th className="px-5 py-4 text-right font-semibold text-blue-300">
                      Need
                    </th>

                    <th className="px-5 py-4 font-semibold text-blue-300">
                      Production Qty
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {data.map((item) => {
                    const productId = item.product._id;
                    const need = item.productionNeed;
                    const currentQuantity = selectedItems[productId] ?? 0;
                    const checked = currentQuantity > 0;

                    return (
                      <tr
                        key={productId}
                        className="border-b border-blue-900/20 transition hover:bg-blue-950/20"
                      >
                        {/* Select */}
                        <td className="px-5 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={need <= 0}
                            onChange={(event) =>
                              handleToggle(
                                productId,
                                event.target.checked,
                                need,
                              )
                            }
                            className="h-4 w-4 cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
                          />
                        </td>

                        {/* Product */}
                        <td className="px-5 py-4">
                          <div className="font-medium text-white">
                            {item.product.name}
                          </div>

                          {(item.product.version || item.product.body) && (
                            <div className="mt-1 text-xs text-gray-500">
                              {item.product.version
                                ? `Version: ${item.product.version}`
                                : ''}

                              {item.product.body
                                ? ` • ${item.product.body}`
                                : ''}
                            </div>
                          )}
                        </td>

                        {/* Demand */}
                        <td className="px-5 py-4 text-right text-gray-300">
                          {item.demandQuantity}
                        </td>

                        {/* Available */}
                        <td className="px-5 py-4 text-right text-gray-300">
                          {item.inventory.availableQuantity}
                        </td>

                        {/* Planned */}
                        <td className="px-5 py-4 text-right text-gray-300">
                          {item.production.plannedQuantity}
                        </td>

                        {/* In Progress */}
                        <td className="px-5 py-4 text-right text-gray-300">
                          {item.production.inProgressQuantity}
                        </td>

                        {/* Total Supply */}
                        <td className="px-5 py-4 text-right text-gray-300">
                          {item.totalSupply}
                        </td>

                        {/* Need */}
                        <td className="px-5 py-4 text-right">
                          {need > 0 ? (
                            <span className="font-semibold text-red-400">
                              {need}
                            </span>
                          ) : (
                            <span className="font-medium text-green-400">
                              0
                            </span>
                          )}
                        </td>

                        {/* Production Qty */}
                        <td className="px-5 py-4">
                          {need > 0 ? (
                            <input
                              type="number"
                              min={0}
                              value={currentQuantity || ''}
                              onChange={(event) =>
                                handleQuantityChange(
                                  productId,
                                  event.target.value,
                                )
                              }
                              placeholder={`Need ${need}`}
                              className="w-28 rounded-lg border border-blue-900/40 bg-[#070b1a] px-3 py-2 text-right text-white outline-none transition placeholder:text-gray-700 focus:border-blue-500"
                            />
                          ) : (
                            <span className="text-xs text-gray-600">
                              No production needed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Production Batch */}
        <div className="rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
          <div className="mb-5">
            <h2 className="font-semibold text-white">Production Batch</h2>

            <p className="mt-1 text-sm text-gray-500">
              Tentukan informasi batch sebelum production order dibuat.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Planned Start Date */}
            <div>
              <label
                htmlFor="plannedStartDate"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Planned Start Date
              </label>

              <DatePicker
                value={plannedStartDate}
                onChange={setPlannedStartDate}
                placeholder="Pilih planned start date"
              />
            </div>

            {/* Planned End Date */}
            <div>
              <label
                htmlFor="plannedEndDate"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Planned End Date
              </label>

              <DatePicker
                value={plannedEndDate}
                onChange={setPlannedEndDate}
                placeholder="Pilih planned end date"
                disabled={(date) => {
                  if (!plannedStartDate) {
                    return false;
                  }

                  const startDate = new Date(`${plannedStartDate}T00:00:00`);

                  return date < startDate;
                }}
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label
                htmlFor="notes"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Notes
              </label>

              <textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Catatan production batch..."
                className="w-full resize-none rounded-lg border border-blue-900/40 bg-[#070b1a] px-3 py-2 text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-4 border-t border-blue-900/40 pt-5 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-gray-400">
              {selectedCount > 0 ? (
                <>
                  <span className="font-medium text-white">
                    {selectedCount}
                  </span>{' '}
                  product dipilih, total{' '}
                  <span className="font-medium text-white">
                    {selectedQuantity}
                  </span>{' '}
                  unit.
                </>
              ) : (
                'Belum ada product yang dipilih.'
              )}
            </div>

            <button
              type="button"
              onClick={handleCreateBatch}
              disabled={creating || selectedCount === 0}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creating ? 'Creating...' : 'Create Production Batch'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
