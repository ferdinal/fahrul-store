'use client';

import { FormEvent, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminHeader } from '@/components/layout/AdminHeader';

import {
  createProductionProcess,
  deleteProductionProcess,
  getProductionProcesses,
  updateProductionProcess,
  type ProductionProcess,
} from '@/lib/api/productionProcesses';

import { productionProcessKeys } from '@/lib/api/productionProcessKeys';

export default function ProductionProcessesPage() {
  const queryClient = useQueryClient();

  // =========================
  // Production Processes
  // =========================

  const {
    data: processes = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: productionProcessKeys.list(),
    queryFn: getProductionProcesses,
  });

  // =========================
  // Add / Edit Modal
  // =========================

  const [showModal, setShowModal] = useState(false);

  const [editingProcess, setEditingProcess] =
    useState<ProductionProcess | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  // =========================
  // Notification
  // =========================

  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // =========================
  // Delete
  // =========================

  const [deletingProcess, setDeletingProcess] =
    useState<ProductionProcess | null>(null);

  // =========================
  // Create
  // =========================

  const createMutation = useMutation({
    mutationFn: createProductionProcess,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionProcessKeys.list(),
      });

      setNotification({
        type: 'success',
        message: 'Production process berhasil ditambahkan.',
      });

      closeModal();
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Gagal menambahkan production process.',
      });
    },
  });

  // =========================
  // Update
  // =========================

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        name: string;
        code: string;
        description?: string;
        active?: boolean;
      };
    }) => updateProductionProcess(id, input),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionProcessKeys.list(),
      });

      setNotification({
        type: 'success',
        message: 'Production process berhasil diperbarui.',
      });

      closeModal();
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Gagal memperbarui production process.',
      });
    },
  });

  // =========================
  // Delete
  // =========================

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => deleteProductionProcess(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionProcessKeys.list(),
      });

      setNotification({
        type: 'success',
        message: 'Production process berhasil dihapus.',
      });

      setDeletingProcess(null);
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Gagal menghapus production process.',
      });
    },
  });

  // =========================
  // Form
  // =========================

  function resetForm() {
    setName('');
    setCode('');
    setDescription('');
    setActive(true);
    setEditingProcess(null);
  }

  function openAddModal() {
    resetForm();
    setShowModal(true);
  }

  function openEditModal(process: ProductionProcess) {
    setEditingProcess(process);
    setName(process.name);
    setCode(process.code);
    setDescription(process.description);
    setActive(process.active);
    setShowModal(true);
  }

  function closeModal() {
    if (createMutation.isPending || updateMutation.isPending) {
      return;
    }

    setShowModal(false);
    resetForm();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = {
      name: name.trim(),
      code: code.trim(),
      description: description.trim(),
      active,
    };

    if (!input.name || !input.code) {
      setNotification({
        type: 'error',
        message: 'Name dan code wajib diisi.',
      });

      return;
    }

    if (editingProcess) {
      updateMutation.mutate({
        id: editingProcess._id,
        input,
      });

      return;
    }

    createMutation.mutate(input);
  }

  // =========================
  // Delete
  // =========================

  function openDeleteModal(process: ProductionProcess) {
    setDeletingProcess(process);
  }

  function closeDeleteModal() {
    if (deleteMutation.isPending) {
      return;
    }

    setDeletingProcess(null);
  }

  function handleDelete() {
    if (!deletingProcess) {
      return;
    }

    deleteMutation.mutate({
      id: deletingProcess._id,
    });
  }

  const submitting = createMutation.isPending || updateMutation.isPending;

  return (
    <main className="min-h-screen bg-[#070b1a] text-white">
      {/* Header */}

      <AdminHeader
        title="Production Process"
        subtitle="Manage production processes"
      />

      {/* Content */}

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Production Processes</h2>

            <p className="mt-1 text-sm text-gray-400">
              Manage the master production processes.
            </p>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-semibold shadow-lg shadow-blue-950/30 transition hover:opacity-90"
          >
            + Add Process
          </button>
        </div>

        {/* Notification */}

        {notification && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              notification.type === 'success'
                ? 'border-green-800 bg-green-950/40 text-green-300'
                : 'border-red-800 bg-red-950/40 text-red-300'
            }`}
          >
            {notification.message}
          </div>
        )}

        {/* Error */}

        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error instanceof Error
              ? error.message
              : 'Failed to load production processes'}
          </div>
        )}

        {/* Table */}

        <div className="overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024] shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="border-b border-blue-900/40 bg-[#0d1530]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Name
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Code
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Description
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>

                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-blue-900/30">
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-gray-400"
                    >
                      Loading production processes...
                    </td>
                  </tr>
                ) : processes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-gray-400"
                    >
                      No production processes found.
                    </td>
                  </tr>
                ) : (
                  processes.map((process) => (
                    <tr
                      key={process._id}
                      className="transition hover:bg-blue-950/20"
                    >
                      <td className="px-6 py-4 font-medium">{process.name}</td>

                      <td className="px-6 py-4">
                        <span className="rounded-md bg-blue-950 px-2.5 py-1 text-xs font-semibold text-blue-300">
                          {process.code}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-gray-400">
                        {process.description || '-'}
                      </td>

                      <td className="px-6 py-4">
                        {process.active ? (
                          <span className="rounded-full bg-green-950 px-3 py-1 text-xs font-semibold text-green-300">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-400">
                            Inactive
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(process)}
                          className="mr-2 rounded-md border border-blue-800/50 px-3 py-1.5 text-xs text-blue-300 transition hover:bg-blue-950"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => openDeleteModal(process)}
                          className="rounded-md border border-red-800/50 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-950"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Add / Edit Modal */}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-blue-900/50 bg-[#0a1024] shadow-2xl shadow-black/50">
            {/* Header */}

            <div className="flex items-center justify-between border-b border-blue-900/40 px-6 py-5">
              <div>
                <h3 className="text-lg font-bold">
                  {editingProcess
                    ? 'Edit Production Process'
                    : 'Add Production Process'}
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                  Define a reusable production process.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="text-2xl text-gray-500 transition hover:text-white disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {/* Form */}

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {/* Name */}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Name
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  placeholder="Contoh: Painting"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Code */}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Code
                </label>

                <input
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  placeholder="Contoh: PAINTING"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm uppercase text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Description */}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Description
                </label>

                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="Deskripsi proses..."
                  className="w-full resize-none rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Active */}

              <div className="flex items-center justify-between rounded-lg border border-blue-900/30 bg-[#070b1a] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-300">Active</p>

                  <p className="mt-1 text-xs text-gray-600">
                    Process dapat digunakan dalam workflow.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActive((value) => !value)}
                  className={`relative h-6 w-11 rounded-full transition ${
                    active ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                  aria-label="Toggle active"
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                      active ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Buttons */}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting
                    ? 'Saving...'
                    : editingProcess
                      ? 'Save Changes'
                      : 'Create Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}

      {deletingProcess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-[#0a1024] shadow-2xl shadow-black/50">
            <div className="p-6">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-950 text-xl text-red-400">
                !
              </div>

              <h3 className="text-lg font-bold text-white">
                Delete Production Process?
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-400">
                Apakah kamu yakin ingin menghapus production process{' '}
                <span className="font-semibold text-white">
                  {deletingProcess.name}
                </span>
                ?
              </p>

              <p className="mt-2 text-xs text-red-400">
                Data production process yang dihapus tidak dapat dikembalikan.
              </p>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleteMutation.isPending}
                  className="flex-1 rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Process'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
