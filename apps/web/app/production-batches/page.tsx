'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

import { DatePicker } from '@/components/ui/DatePicker';
import { AdminHeader } from '@/components/layout/AdminHeader';

import {
  createProductionBatch,
  deleteProductionBatch,
  getProductionBatches,
  updateProductionBatch,
  type CreateProductionBatchInput,
  type ProductionBatchStatus,
} from '@/lib/api/productionBatches';

import { productionBatchKeys } from '@/lib/api/productionBatchKeys';

const statusOptions: {
  value: ProductionBatchStatus;
  label: string;
}[] = [
  {
    value: 'planned',
    label: 'Planned',
  },
  {
    value: 'in_progress',
    label: 'In Progress',
  },
  {
    value: 'completed',
    label: 'Completed',
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
  },
];

function getStatusClass(status: ProductionBatchStatus) {
  switch (status) {
    case 'planned':
      return 'border-blue-800/50 bg-blue-950/40 text-blue-300';

    case 'in_progress':
      return 'border-yellow-800/50 bg-yellow-950/40 text-yellow-300';

    case 'completed':
      return 'border-green-800/50 bg-green-950/40 text-green-300';

    case 'cancelled':
      return 'border-red-800/50 bg-red-950/40 text-red-300';

    default:
      return 'border-gray-800 bg-gray-900 text-gray-400';
  }
}

function formatStatus(status: ProductionBatchStatus) {
  switch (status) {
    case 'planned':
      return 'Planned';

    case 'in_progress':
      return 'In Progress';

    case 'completed':
      return 'Completed';

    case 'cancelled':
      return 'Cancelled';

    default:
      return status;
  }
}

function formatDate(date: string | null) {
  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export default function ProductionBatchesPage() {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<ProductionBatchStatus>('planned');

  const [plannedStartDate, setPlannedStartDate] = useState('');

  const [plannedEndDate, setPlannedEndDate] = useState('');

  const [notes, setNotes] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState('');

  const [searchStartDate, setSearchStartDate] = useState('');

  const [searchEndDate, setSearchEndDate] = useState('');

  const batchesQuery = useQuery({
    queryKey: productionBatchKeys.list(),
    queryFn: getProductionBatches,
  });

  const filteredBatches = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const keywords = keyword
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    return (batchesQuery.data ?? []).filter((batch) => {
      const searchableText = [
        batch.batchNumber ?? '',
        formatStatus(batch.status),
        batch.status ?? '',
        batch.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        keywords.length === 0 ||
        keywords.every((item) => searchableText.includes(item));

      const batchStartDate = batch.plannedStartDate
        ? batch.plannedStartDate.slice(0, 10)
        : '';

      const batchEndDate = batch.plannedEndDate
        ? batch.plannedEndDate.slice(0, 10)
        : '';

      const matchesStartDate =
        !searchStartDate ||
        (batchStartDate !== '' && batchStartDate >= searchStartDate);

      const matchesEndDate =
        !searchEndDate ||
        (batchEndDate !== '' && batchEndDate <= searchEndDate);

      return matchesSearch && matchesStartDate && matchesEndDate;
    });
  }, [batchesQuery.data, search, searchStartDate, searchEndDate]);

  const hasSearch =
    search.trim() !== '' || searchStartDate !== '' || searchEndDate !== '';

  function clearSearch() {
    setSearch('');
    setSearchStartDate('');
    setSearchEndDate('');
  }

  function handleExportExcel() {
    if (filteredBatches.length === 0) {
      alert('Tidak ada production batch untuk diexport.');

      return;
    }

    const exportData = filteredBatches.map((batch) => ({
      'Batch Number': batch.batchNumber,
      Status: formatStatus(batch.status),
      'Planned Start Date': formatDate(batch.plannedStartDate),
      'Planned End Date': formatDate(batch.plannedEndDate),
      Notes: batch.notes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    worksheet['!cols'] = [
      { wch: 25 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
      { wch: 50 },
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Production Batches');

    XLSX.writeFile(workbook, 'production-batches.xlsx');
  }

  const createMutation = useMutation({
    mutationFn: createProductionBatch,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionBatchKeys.all,
      });

      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof updateProductionBatch>[1];
    }) => updateProductionBatch(id, input),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionBatchKeys.all,
      });

      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProductionBatch,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionBatchKeys.all,
      });
    },
  });

  function resetForm() {
    setStatus('planned');
    setPlannedStartDate('');
    setPlannedEndDate('');
    setNotes('');
    setEditingId(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      plannedStartDate &&
      plannedEndDate &&
      plannedEndDate < plannedStartDate
    ) {
      alert('Planned end date tidak boleh lebih awal dari planned start date.');

      return;
    }

    const input: CreateProductionBatchInput = {
      status,
      plannedStartDate: plannedStartDate || null,
      plannedEndDate: plannedEndDate || null,
      notes: notes.trim() || undefined,
    };

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        input,
      });

      return;
    }

    createMutation.mutate(input);
  }

  function handleEdit(batch: NonNullable<typeof batchesQuery.data>[number]) {
    setEditingId(batch._id);
    setStatus(batch.status);

    setPlannedStartDate(
      batch.plannedStartDate ? batch.plannedStartDate.slice(0, 10) : '',
    );

    setPlannedEndDate(
      batch.plannedEndDate ? batch.plannedEndDate.slice(0, 10) : '',
    );

    setNotes(batch.notes ?? '');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  function handleDelete(id: string) {
    const confirmed = window.confirm(
      'Yakin ingin menghapus production batch ini?',
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(id);
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Production Batches"
        subtitle="Manage production batches"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Form */}
        <section className="mb-8 rounded-xl border border-blue-900/40 bg-[#0a1024] p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-blue-300">
              {editingId ? 'Edit Production Batch' : 'Create Production Batch'}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {editingId
                ? 'Update production batch information.'
                : 'Create a new production batch.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              {/* Status */}
              <div>
                <label
                  htmlFor="status"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  Status
                </label>

                <select
                  id="status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as ProductionBatchStatus)
                  }
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
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

              {/* End Date */}
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
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="notes"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Notes
              </label>

              <textarea
                id="notes"
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Catatan production batch..."
                className="w-full resize-none rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Saving...'
                  : editingId
                    ? 'Update Batch'
                    : 'Create Batch'}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="rounded-lg border border-gray-700 px-5 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-900"
                >
                  Cancel
                </button>
              )}
            </div>

            {createMutation.isError && (
              <p className="text-sm text-red-400">
                {createMutation.error.message}
              </p>
            )}

            {updateMutation.isError && (
              <p className="text-sm text-red-400">
                {updateMutation.error.message}
              </p>
            )}
          </form>
        </section>

        {/* List */}
        <section className="overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024]">
          <div className="border-b border-blue-900/40 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-300">
                  Production Batch List
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Manage all production batches.
                </p>
              </div>

              <div className="text-sm text-gray-500">
                {filteredBatches.length} batch
              </div>
            </div>

            {/* Search & Date Filter */}
            <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_220px_220px_auto]">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search batch number, status, notes..."
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 pr-10 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-white"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Search Start Date */}
              <DatePicker
                value={searchStartDate}
                onChange={setSearchStartDate}
                placeholder="Start date"
              />

              {/* Search End Date */}
              <DatePicker
                value={searchEndDate}
                onChange={setSearchEndDate}
                placeholder="End date"
                disabled={(date) => {
                  if (!searchStartDate) {
                    return false;
                  }

                  const startDate = new Date(`${searchStartDate}T00:00:00`);

                  return date < startDate;
                }}
              />

              {/* Export */}
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={filteredBatches.length === 0}
                className="rounded-lg border border-green-800/50 bg-green-950/30 px-5 py-3 text-sm font-medium text-green-300 transition hover:bg-green-950/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export Excel
              </button>
            </div>

            {hasSearch && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                {search && (
                  <span>
                    Search: <span className="text-gray-300">{search}</span>
                  </span>
                )}

                {searchStartDate && (
                  <span>
                    Start:{' '}
                    <span className="text-gray-300">
                      {formatDate(searchStartDate)}
                    </span>
                  </span>
                )}

                {searchEndDate && (
                  <span>
                    End:{' '}
                    <span className="text-gray-300">
                      {formatDate(searchEndDate)}
                    </span>
                  </span>
                )}

                <span>· {filteredBatches.length} hasil</span>

                <button
                  type="button"
                  onClick={clearSearch}
                  className="text-blue-400 transition hover:text-blue-300"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>

          {batchesQuery.isLoading && (
            <div className="px-6 py-10 text-center text-sm text-gray-500">
              Loading production batches...
            </div>
          )}

          {batchesQuery.isError && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-red-400">
                {batchesQuery.error.message}
              </p>

              <button
                type="button"
                onClick={() => batchesQuery.refetch()}
                className="mt-4 rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
              >
                Try Again
              </button>
            </div>
          )}

          {!batchesQuery.isLoading &&
            !batchesQuery.isError &&
            batchesQuery.data?.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-500">
                  Belum ada production batch.
                </p>
              </div>
            )}

          {!batchesQuery.isLoading &&
            !batchesQuery.isError &&
            batchesQuery.data &&
            batchesQuery.data.length > 0 &&
            filteredBatches.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-500">
                  Tidak ada production batch yang cocok dengan filter.
                </p>

                <button
                  type="button"
                  onClick={clearSearch}
                  className="mt-4 rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
                >
                  Clear Filter
                </button>
              </div>
            )}

          {!batchesQuery.isLoading &&
            !batchesQuery.isError &&
            filteredBatches.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-blue-900/40 text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="px-6 py-4">Batch Number</th>

                      <th className="px-6 py-4">Status</th>

                      <th className="px-6 py-4">Start Date</th>

                      <th className="px-6 py-4">End Date</th>

                      <th className="px-6 py-4">Notes</th>

                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredBatches.map((batch) => (
                      <tr
                        key={batch._id}
                        className="border-b border-blue-900/20 last:border-0"
                      >
                        <td className="px-6 py-5">
                          <span className="font-semibold text-white">
                            {batch.batchNumber}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClass(
                              batch.status,
                            )}`}
                          >
                            {formatStatus(batch.status)}
                          </span>
                        </td>

                        <td className="px-6 py-5 text-sm text-gray-400">
                          {formatDate(batch.plannedStartDate)}
                        </td>

                        <td className="px-6 py-5 text-sm text-gray-400">
                          {formatDate(batch.plannedEndDate)}
                        </td>

                        <td className="max-w-xs px-6 py-5 text-sm text-gray-400">
                          <span className="line-clamp-2">
                            {batch.notes || '-'}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(batch)}
                              className="rounded-lg border border-blue-800/50 px-3 py-2 text-xs font-medium text-blue-300 transition hover:bg-blue-950"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(batch._id)}
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
            )}
        </section>
      </main>
    </div>
  );
}
