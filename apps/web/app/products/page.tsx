'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

import { AdminHeader } from '@/components/layout/AdminHeader';

import {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
  type Product,
} from '@/lib/api/products';

import { productKeys } from '@/lib/api/productKeys';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  // =========================
  // Products - TanStack Query
  // =========================

  const {
    data: products = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: productKeys.list(),
    queryFn: getProducts,
  });

  // =========================
  // Search
  // =========================

  const [search, setSearch] = useState('');

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return products;
    }

    // Support multiple keywords.
    //
    // Contoh:
    // "V2 25 Kg"
    //
    // Akan menjadi:
    // ["v2", "25", "kg"]
    //
    // Semua keyword harus ditemukan pada:
    // name + version + body
    const keywords = keyword
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    return products.filter((product) => {
      const searchableText = [
        product.name ?? '',
        product.version ?? '',
        product.body ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return keywords.every((item) => searchableText.includes(item));
    });
  }, [products, search]);

  const hasSearch = search.trim() !== '';

  function clearSearch() {
    setSearch('');
  }

  // =========================
  // Export Excel
  // =========================

  function handleExportExcel() {
    if (filteredProducts.length === 0) {
      setNotification({
        type: 'error',
        message: 'Tidak ada product untuk diexport.',
      });

      return;
    }

    const exportData = filteredProducts.map((product) => ({
      Name: product.name,
      Version: product.version,
      Body: product.body,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    worksheet['!cols'] = [
      {
        wch: 35,
      },
      {
        wch: 20,
      },
      {
        wch: 35,
      },
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    XLSX.writeFile(workbook, 'products.xlsx');

    setNotification({
      type: 'success',
      message: `${filteredProducts.length} product berhasil diexport ke Excel.`,
    });
  }

  // =========================
  // Add / Edit Modal
  // =========================

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [version, setVersion] = useState('');
  const [body, setBody] = useState('');

  // =========================
  // Notification
  // =========================

  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // =========================
  // Delete Product
  // =========================

  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  // =========================
  // Create Product
  // =========================

  const createProductMutation = useMutation({
    mutationFn: createProduct,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productKeys.list(),
      });

      setNotification({
        type: 'success',
        message: 'Product berhasil ditambahkan.',
      });

      closeModal();
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Gagal menambahkan product.',
      });
    },
  });

  // =========================
  // Update Product
  // =========================

  const updateProductMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        version: string;
        body: string;
      };
    }) => updateProduct(id, input),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productKeys.list(),
      });

      setNotification({
        type: 'success',
        message: 'Product berhasil diperbarui.',
      });

      closeModal();
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Gagal memperbarui product.',
      });
    },
  });

  // =========================
  // Delete Product
  // =========================

  const deleteProductMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => deleteProduct(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productKeys.list(),
      });

      setNotification({
        type: 'success',
        message: 'Product berhasil dihapus.',
      });

      setDeletingProduct(null);
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Gagal menghapus product.',
      });
    },
  });

  // =========================
  // Form
  // =========================

  function resetForm() {
    setVersion('');
    setBody('');
    setEditingProduct(null);
  }

  function openAddModal() {
    resetForm();
    setShowModal(true);
  }

  function closeModal() {
    if (createProductMutation.isPending || updateProductMutation.isPending) {
      return;
    }

    setShowModal(false);
    resetForm();
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setVersion(product.version);
    setBody(product.body);
    setShowModal(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = {
      version: version.trim(),
      body: body.trim(),
    };

    if (!input.version || !input.body) {
      setNotification({
        type: 'error',
        message: 'Version dan body wajib diisi.',
      });

      return;
    }

    if (editingProduct) {
      updateProductMutation.mutate({
        id: editingProduct._id,
        input,
      });

      return;
    }

    createProductMutation.mutate(input);
  }

  // =========================
  // Delete
  // =========================

  function openDeleteModal(product: Product) {
    setDeletingProduct(product);
  }

  function closeDeleteModal() {
    if (deleteProductMutation.isPending) {
      return;
    }

    setDeletingProduct(null);
  }

  function handleDelete() {
    if (!deletingProduct) {
      return;
    }

    deleteProductMutation.mutate({
      id: deletingProduct._id,
    });
  }

  const submitting =
    createProductMutation.isPending || updateProductMutation.isPending;

  return (
    <main className="min-h-screen bg-[#070b1a] text-white">
      {/* Navbar */}
      <AdminHeader
        title="Product Management"
        subtitle="Manage miniature products"
      />

      {/* Content */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Products</h2>

            <p className="mt-1 text-sm text-gray-400">
              Manage products and their versions.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={loading || filteredProducts.length === 0}
              className="rounded-lg border border-green-800/50 bg-green-950/20 px-5 py-3 text-sm font-semibold text-green-300 transition hover:bg-green-950/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export Excel
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-semibold shadow-lg shadow-blue-950/30 transition hover:opacity-90"
            >
              + Add Product
            </button>
          </div>
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
            {error instanceof Error ? error.message : 'Failed to load products'}
          </div>
        )}

        {/* Search */}
        <div className="mb-6 rounded-xl border border-blue-900/40 bg-[#0a1024] p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-white">Search Products</h3>

              <p className="mt-1 text-xs text-gray-500">
                Search berdasarkan name, version, atau body.
              </p>
            </div>

            <div className="text-sm text-gray-500">
              Showing{' '}
              <span className="font-semibold text-white">
                {filteredProducts.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-white">
                {products.length}
              </span>{' '}
              products
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                🔍
              </span>

              <input
                id="productSearch"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product name, version, atau body..."
                className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
              />
            </div>

            {hasSearch && (
              <button
                type="button"
                onClick={clearSearch}
                className="shrink-0 rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-900 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {hasSearch && (
            <p className="mt-3 text-xs text-gray-500">
              Search: <span className="text-gray-300">{search}</span>
            </p>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024] shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="border-b border-blue-900/40 bg-[#0d1530]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Name
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Version
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Body
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
                      colSpan={4}
                      className="px-6 py-12 text-center text-gray-400"
                    >
                      Loading products...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-gray-400"
                    >
                      {hasSearch
                        ? 'No products match the current search.'
                        : 'No products found.'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr
                      key={product._id}
                      className="transition hover:bg-blue-950/20"
                    >
                      <td className="px-6 py-4 font-medium">{product.name}</td>

                      <td className="px-6 py-4 text-gray-400">
                        {product.version}
                      </td>

                      <td className="px-6 py-4 text-gray-400">
                        {product.body}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(product)}
                          className="mr-2 rounded-md border border-blue-800/50 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-950"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/products/${product._id}/workflow`)
                          }
                          className="mr-2 rounded-lg border border-purple-800/50 px-3 py-2 text-sm text-purple-300 transition hover:bg-purple-950/40"
                        >
                          Workflow
                        </button>

                        <button
                          type="button"
                          onClick={() => openDeleteModal(product)}
                          className="rounded-md border border-red-800/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950"
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

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-blue-900/50 bg-[#0a1024] shadow-2xl shadow-black/50">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-blue-900/40 px-6 py-5">
              <div>
                <h3 className="text-lg font-bold">
                  {editingProduct ? 'Edit Product' : 'Add Product'}
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                  Name will be generated automatically from version and body.
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
              {/* Version */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Version
                </label>

                <input
                  type="text"
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  required
                  placeholder="Contoh: V1"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Body */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Body
                </label>

                <input
                  type="text"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  required
                  placeholder="Contoh: AE86"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Preview Name */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Name
                </label>

                <div className="rounded-lg border border-blue-900/30 bg-[#070b1a] px-4 py-3 text-sm text-gray-400">
                  {version.trim() || body.trim()
                    ? `${version.trim()} ${body.trim()}`.trim()
                    : '-'}
                </div>

                <p className="mt-1.5 text-xs text-gray-600">
                  Name dibuat otomatis oleh backend.
                </p>
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
                    : editingProduct
                      ? 'Save Changes'
                      : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-[#0a1024] shadow-2xl shadow-black/50">
            <div className="p-6">
              {/* Icon */}
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-950 text-xl text-red-400">
                !
              </div>

              <h3 className="text-lg font-bold text-white">Delete Product?</h3>

              <p className="mt-2 text-sm leading-6 text-gray-400">
                Apakah kamu yakin ingin menghapus product{' '}
                <span className="font-semibold text-white">
                  {deletingProduct.name}
                </span>
                ?
              </p>

              <p className="mt-2 text-xs text-red-400">
                Data product yang dihapus tidak dapat dikembalikan.
              </p>

              {/* Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleteProductMutation.isPending}
                  className="flex-1 rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteProductMutation.isPending}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteProductMutation.isPending
                    ? 'Deleting...'
                    : 'Delete Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
