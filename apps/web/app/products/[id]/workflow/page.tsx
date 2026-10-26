'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminHeader } from '@/components/layout/AdminHeader';
import {
  getProduct,
  updateProductWorkflow,
  type Product,
} from '@/lib/api/products';
import {
  getProductionProcesses,
  type ProductionProcess,
} from '@/lib/api/productionProcesses';
import { productKeys } from '@/lib/api/productKeys';
import { productionProcessKeys } from '@/lib/api/productionProcessKeys';

interface WorkflowDraftItem {
  process: ProductionProcess;
  sequence: number;
}

export default function ProductWorkflowPage() {
  const router = useRouter();
  const params = useParams();

  const productId = String(params.id);

  const productQuery = useQuery({
    queryKey: productKeys.detail(productId),
    queryFn: () => getProduct(productId),
    enabled: Boolean(productId),
  });

  const processesQuery = useQuery({
    queryKey: productionProcessKeys.list(),
    queryFn: getProductionProcesses,
  });

  if (productQuery.isLoading || processesQuery.isLoading) {
    return (
      <main className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Product Workflow"
          subtitle="Configure product production workflow"
        />

        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  if (productQuery.isError || !productQuery.data) {
    return (
      <main className="min-h-screen bg-[#070b1a] text-white">
        <AdminHeader
          title="Product Workflow"
          subtitle="Configure product production workflow"
        />

        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
            <p className="text-red-400">Product tidak ditemukan.</p>

            <button
              type="button"
              onClick={() => router.push('/products')}
              className="mt-4 rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
            >
              Kembali ke Products
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <WorkflowEditor
      key={productQuery.data._id}
      product={productQuery.data}
      processes={processesQuery.data ?? []}
    />
  );
}

interface WorkflowEditorProps {
  product: Product;
  processes: ProductionProcess[];
}

function WorkflowEditor({ product, processes }: WorkflowEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [workflow, setWorkflow] = useState<WorkflowDraftItem[]>(() =>
    (product.workflow ?? [])
      .filter((item) => Boolean(item.process))
      .sort((a, b) => a.sequence - b.sequence)
      .map((item) => ({
        process: item.process,
        sequence: item.sequence,
      })),
  );

  const [selectedProcessId, setSelectedProcessId] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProductWorkflow(product._id, {
        workflow: workflow.map((item, index) => ({
          process: item.process._id,
          sequence: index + 1,
        })),
      }),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: productKeys.detail(product._id),
      });

      await queryClient.invalidateQueries({
        queryKey: productKeys.list(),
      });

      router.push('/products');
    },

    onError: (error: Error) => {
      setErrorMessage(error.message || 'Gagal menyimpan workflow.');
    },
  });

  function handleAddProcess() {
    if (!selectedProcessId) {
      return;
    }

    const process = processes.find((item) => item._id === selectedProcessId);

    if (!process) {
      return;
    }

    setWorkflow((current) => [
      ...current,
      {
        process,
        sequence: current.length + 1,
      },
    ]);

    setSelectedProcessId('');
    setErrorMessage(null);
  }

  function handleRemove(index: number) {
    setWorkflow((current) =>
      current
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({
          ...item,
          sequence: itemIndex + 1,
        })),
    );
  }

  function handleMoveUp(index: number) {
    if (index === 0) {
      return;
    }

    setWorkflow((current) => {
      const next = [...current];

      [next[index - 1], next[index]] = [next[index], next[index - 1]];

      return next.map((item, itemIndex) => ({
        ...item,
        sequence: itemIndex + 1,
      }));
    });
  }

  function handleMoveDown(index: number) {
    setWorkflow((current) => {
      if (index >= current.length - 1) {
        return current;
      }

      const next = [...current];

      [next[index], next[index + 1]] = [next[index + 1], next[index]];

      return next.map((item, itemIndex) => ({
        ...item,
        sequence: itemIndex + 1,
      }));
    });
  }

  return (
    <main className="min-h-screen bg-[#070b1a] text-white">
      <AdminHeader
        title="Product Workflow"
        subtitle="Configure product production workflow"
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">Product</p>

            <h2 className="mt-1 text-2xl font-bold">{product.name}</h2>

            <p className="mt-1 text-sm text-gray-400">
              {product.version} · {product.body}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/products')}
            className="rounded-lg border border-blue-800/50 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
          >
            Back to Products
          </button>
        </div>

        {/* Add process */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-semibold">Add Production Process</h3>

          <p className="mt-1 text-sm text-gray-400">
            Tambahkan process ke workflow product.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <select
              value={selectedProcessId}
              onChange={(event) => setSelectedProcessId(event.target.value)}
              className="flex-1 rounded-lg border border-blue-900/50 bg-[#0a1024] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="">Select production process</option>

              {processes.map((process) => (
                <option
                  key={process._id}
                  value={process._id}
                  disabled={!process.active}
                >
                  {process.code} — {process.name}
                  {!process.active ? ' (Inactive)' : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleAddProcess}
              disabled={!selectedProcessId}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add Process
            </button>
          </div>
        </section>

        {/* Error */}
        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {/* Workflow */}
        <section className="rounded-2xl border border-white/10 bg-[#0a1024]">
          <div className="border-b border-white/10 px-6 py-5">
            <h3 className="text-lg font-semibold">Production Workflow</h3>

            <p className="mt-1 text-sm text-gray-400">
              Atur urutan proses produksi product.
            </p>
          </div>

          {workflow.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-4xl">⚙️</div>

              <p className="mt-4 text-gray-400">
                Belum ada production process.
              </p>

              <p className="mt-1 text-sm text-gray-600">
                Tambahkan process menggunakan form di atas.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {workflow.map((item, index) => (
                <div
                  key={`${item.process._id}-${index}`}
                  className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/20 font-bold text-blue-300">
                    {index + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.process.name}</p>

                    <p className="mt-1 text-xs text-gray-500">
                      {item.process.code}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-20"
                      title="Move up"
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === workflow.length - 1}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-20"
                      title="Move down"
                    >
                      ↓
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemove(index)}
                      className="rounded-lg border border-red-900/50 px-3 py-2 text-sm text-red-400 transition hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              {workflow.length} process
              {workflow.length !== 1 ? 'es' : ''} dalam workflow
            </p>

            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-6 py-3 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Workflow'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
