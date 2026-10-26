'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { AdminHeader } from '@/components/layout/AdminHeader';
import { DatePicker } from '@/components/ui/DatePicker';

import {
  importCustomerOrderCsv,
  previewCustomerOrderCsv,
  type CustomerOrderImportPreview,
} from '@/lib/api/customerOrders';

import { customerOrderKeys } from '@/lib/api/customerOrderKeys';

type PreviewOrder = CustomerOrderImportPreview['orders'][number];

type PreviewEntry = {
  id: string;
  order: PreviewOrder;
};

export default function CustomerOrderImportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [fulfillmentDueDate, setFulfillmentDueDate] = useState('');

  const [previewEntries, setPreviewEntries] = useState<PreviewEntry[]>([]);
  const [hasPreview, setHasPreview] = useState(false);

  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [error, setError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const orders = previewEntries.map((entry) => entry.order);
  const validOrders = orders.filter((order) => order.valid);
  const invalidOrders = orders.filter((order) => !order.valid);

  const summary = {
    totalOrders: orders.length,
    validOrders: validOrders.length,
    invalidOrders: invalidOrders.length,
  };

  async function handlePreview() {
    setError('');
    setImportSuccess('');
    setHasPreview(false);
    setPreviewEntries([]);

    if (!file) {
      setError('Pilih file CSV atau Excel terlebih dahulu.');
      return;
    }

    if (!fulfillmentDueDate) {
      setError('Fulfillment Due Date wajib diisi.');
      return;
    }

    try {
      setLoading(true);

      const result = await previewCustomerOrderCsv(file);

      setPreviewEntries(
        result.orders.map((order, index) => ({
          id: `${index}-${crypto.randomUUID()}`,
          order,
        })),
      );

      setHasPreview(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal memproses file import.',
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDeleteInvalidOrder(id: string) {
    const entry = previewEntries.find((item) => item.id === id);

    if (!entry || entry.order.valid) {
      return;
    }

    const confirmed = window.confirm(
      `Hapus order #${entry.order.orderNumber || '(nomor kosong)'} dari preview? Order ini tidak akan ikut diimport.`,
    );

    if (!confirmed) {
      return;
    }

    setPreviewEntries((current) => current.filter((item) => item.id !== id));

    setError('');
    setImportSuccess('');
  }

  async function handleImport() {
    setError('');
    setImportSuccess('');

    if (!file) {
      setError('File CSV atau Excel tidak tersedia.');
      return;
    }

    if (!fulfillmentDueDate) {
      setError('Fulfillment Due Date wajib diisi.');
      return;
    }

    if (!hasPreview) {
      setError('Lakukan preview terlebih dahulu.');
      return;
    }

    if (validOrders.length === 0) {
      setError('Tidak ada order valid untuk diimport.');
      return;
    }

    if (invalidOrders.length > 0) {
      setError('Hapus setiap order invalid sebelum melakukan import.');
      return;
    }

    try {
      setImporting(true);

      const orderNumbersToImport = validOrders.map(
        (order) => order.orderNumber,
      );

      const result = await importCustomerOrderCsv(
        file,
        fulfillmentDueDate,
        orderNumbersToImport,
      );

      setImportSuccess(
        `Import berhasil. ${result.created} customer order berhasil dibuat.`,
      );

      await queryClient.invalidateQueries({
        queryKey: customerOrderKeys.list(),
      });

      setTimeout(() => {
        router.push('/customer-orders');
      }, 1200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal import customer orders.',
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Import Customer Orders"
        subtitle="Upload Big Cartel CSV atau Excel dan preview orders"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push('/customer-orders')}
            className="rounded-lg border border-blue-800/50 px-3 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
          >
            ← Customer Orders
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-bold">Import Big Cartel Orders</h2>

          <p className="mt-2 text-sm text-gray-400">
            Upload file CSV, XLSX, atau XLS Big Cartel untuk melihat preview
            sebelum order disimpan.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Fulfillment Due Date
              </label>

              <DatePicker
                value={fulfillmentDueDate}
                onChange={(value) => {
                  setFulfillmentDueDate(value);
                  setError('');
                  setImportSuccess('');
                }}
                placeholder="Pilih fulfillment due date"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                CSV / Excel File
              </label>

              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreviewEntries([]);
                  setHasPreview(false);
                  setError('');
                  setImportSuccess('');
                }}
                className="block w-full cursor-pointer rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-gray-300"
              />
            </div>
          </div>

          {file && (
            <div className="mt-4 rounded-lg border border-blue-900/40 bg-blue-950/20 px-4 py-3 text-sm text-blue-300">
              Selected file:{' '}
              <span className="font-medium text-white">{file.name}</span>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {importSuccess && (
            <div className="mt-4 rounded-lg border border-green-900/50 bg-green-950/20 px-4 py-3 text-sm text-green-400">
              {importSuccess}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handlePreview}
              disabled={loading || importing}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Preview Import'}
            </button>
          </div>
        </div>

        {hasPreview && (
          <>
            <div className="mt-8">
              <h2 className="text-xl font-bold">Import Preview</h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <SummaryCard label="Total Orders" value={summary.totalOrders} />
                <SummaryCard
                  label="Valid Orders"
                  value={summary.validOrders}
                  type="success"
                />
                <SummaryCard
                  label="Invalid Orders"
                  value={summary.invalidOrders}
                  type="error"
                />
              </div>

              <p className="mt-4 text-sm text-gray-400">
                Tombol Delete hanya tersedia pada order INVALID. Menghapus order
                akan mengeluarkannya dari preview, bukan menghapus data dari
                database.
              </p>

              <div className="mt-6 space-y-4">
                {previewEntries.map(({ id, order }) => (
                  <div
                    key={id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-6"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <h3 className="text-lg font-bold">
                          #{order.orderNumber || '(nomor kosong)'}
                        </h3>

                        <p className="mt-1 text-sm text-gray-400">
                          {order.buyer.firstName} {order.buyer.lastName}
                        </p>

                        <p className="text-sm text-gray-500">
                          {order.buyer.email}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            order.valid
                              ? 'bg-green-600/20 text-green-400'
                              : 'bg-red-600/20 text-red-400'
                          }`}
                        >
                          {order.valid ? 'VALID' : 'INVALID'}
                        </span>

                        {!order.valid && (
                          <button
                            type="button"
                            onClick={() => handleDeleteInvalidOrder(id)}
                            disabled={importing}
                            className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-900/50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {order.errors.length > 0 && (
                      <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/20 p-4">
                        <p className="text-sm font-semibold text-red-400">
                          Validation Errors
                        </p>

                        <ul className="mt-2 space-y-1 text-sm text-red-300">
                          {order.errors.map((message, index) => (
                            <li key={`${id}-error-${index}`}>• {message}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[800px] text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-left text-gray-400">
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3">Option</th>
                            <th className="px-4 py-3">Qty</th>
                            <th className="px-4 py-3">Price</th>
                            <th className="px-4 py-3">Total</th>
                            <th className="px-4 py-3">Match</th>
                          </tr>
                        </thead>

                        <tbody>
                          {order.items.map((item, index) => (
                            <tr
                              key={`${id}-item-${index}`}
                              className="border-b border-white/5"
                            >
                              <td className="px-4 py-3 text-gray-300">
                                {item.productName}
                              </td>

                              <td className="px-4 py-3 text-gray-400">
                                {item.productOptionName}
                              </td>

                              <td className="px-4 py-3">{item.quantity}</td>
                              <td className="px-4 py-3">{item.price}</td>
                              <td className="px-4 py-3">{item.total}</td>

                              <td className="px-4 py-3">
                                {item.matched ? (
                                  <span className="text-green-400">
                                    ✓ {item.product?.name}
                                  </span>
                                ) : (
                                  <span className="text-red-400">
                                    ✕ Not Found
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}

                          {order.items.length === 0 && (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-4 py-5 text-center text-gray-500"
                              >
                                Tidak ada item pada order ini.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {previewEntries.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-gray-400">
                    Semua order sudah dihapus dari preview. Tidak ada order
                    untuk ditampilkan.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col items-end gap-3">
              {summary.invalidOrders > 0 && (
                <p className="text-sm text-red-400">
                  Hapus semua order INVALID sebelum melakukan import.
                </p>
              )}

              {summary.validOrders === 0 && (
                <p className="text-sm text-yellow-400">
                  Tidak ada order VALID yang bisa diimport.
                </p>
              )}

              <button
                type="button"
                onClick={handleImport}
                disabled={
                  importing ||
                  loading ||
                  summary.validOrders === 0 ||
                  summary.invalidOrders > 0
                }
                className="rounded-lg bg-gradient-to-r from-green-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing
                  ? 'Importing...'
                  : `Import ${summary.validOrders} Customer Orders`}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  type,
}: {
  label: string;
  value: number;
  type?: 'success' | 'error';
}) {
  const valueClass =
    type === 'success'
      ? 'text-green-400'
      : type === 'error'
        ? 'text-red-400'
        : 'text-blue-400';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
