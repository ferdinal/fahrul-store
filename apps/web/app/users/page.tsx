'use client';

import { useState } from 'react';
// import { useRouter } from 'next/navigation';
import { AdminHeader } from '@/components/layout/AdminHeader';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userKeys } from '@/lib/api/userKeys';

import {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  type User,
} from '@/lib/api/users';

export default function UsersPage() {
  // const router = useRouter();
  const queryClient = useQueryClient();

  // =========================
  // Users - TanStack Query
  // =========================

  const {
    data: users = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: userKeys.list(),
    queryFn: getUsers,
  });

  // =========================
  // Add User Modal
  // =========================

  const createUserMutation = useMutation({
    mutationFn: createUser,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userKeys.list(),
      });

      setNotification({
        type: 'success',
        message: 'User berhasil ditambahkan.',
      });

      setShowAddModal(false);
      resetForm();
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Gagal menambahkan user.',
      });
    },
  });

  const [showAddModal, setShowAddModal] = useState(false);

  // Add User Form
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');

  // const [saving, setSaving] = useState(false);

  // =========================
  // Notification
  // =========================

  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // =========================
  // Edit User
  // =========================

  const updateUserMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        username: string;
        email: string;
        role: string;
        password?: string;
      };
    }) => updateUser(id, input),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userKeys.list(),
      });

      setNotification({
        type: 'success',
        message: 'User berhasil diperbarui.',
      });

      closeEditModal();
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Gagal memperbarui user.',
      });
    },
  });

  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('user');

  // const [updating, setUpdating] = useState(false);

  // =========================
  // Delete User
  // =========================

  const deleteUserMutation = useMutation({
    mutationFn: ({ id }: { id: string; username: string }) => deleteUser(id),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: userKeys.list(),
      });

      setNotification({
        type: 'success',
        message: `User "${variables.username}" berhasil dihapus.`,
      });

      setDeletingUser(null);
    },

    onError: (error) => {
      setNotification({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Gagal menghapus user.',
      });
    },
  });

  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  // const [deleting, setDeleting] = useState(false);

  // =========================
  // Edit Modal
  // =========================

  function openEditModal(user: User) {
    setEditingUser(user);

    setEditUsername(user.username);
    setEditEmail(user.email);
    setEditPassword('');
    setEditRole(user.role);
  }

  function closeEditModal() {
    if (updateUserMutation.isPending) return;

    setEditingUser(null);
    setEditUsername('');
    setEditEmail('');
    setEditPassword('');
    setEditRole('user');
  }

  async function handleEditUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!editingUser) return;

    const input: {
      username: string;
      email: string;
      role: string;
      password?: string;
    } = {
      username: editUsername,
      email: editEmail,
      role: editRole,
    };

    if (editPassword.trim() !== '') {
      input.password = editPassword;
    }

    updateUserMutation.mutate({
      id: editingUser._id,
      input,
    });
  }

  // =========================
  // Delete Modal
  // =========================

  function openDeleteModal(user: User) {
    setDeletingUser(user);
  }

  function closeDeleteModal() {
    if (deleteUserMutation.isPending) return;

    setDeletingUser(null);
  }

  function handleDeleteUser() {
    if (!deletingUser) return;

    deleteUserMutation.mutate({
      id: deletingUser._id,
      username: deletingUser.username,
    });
  }

  // =========================
  // Add User
  // =========================

  function resetForm() {
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('user');
  }

  function openAddModal() {
    resetForm();
    setShowAddModal(true);
  }

  function closeAddModal() {
    if (createUserMutation.isPending) return;

    setShowAddModal(false);
    resetForm();
  }

  function handleAddUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    createUserMutation.mutate({
      username,
      email,
      password,
      role,
    });
  }

  // =========================
  // Logout
  // =========================

  // function handleLogout() {
  //   localStorage.removeItem('accessToken');
  //   localStorage.removeItem('user');

  //   router.replace('/login');
  // }

  return (
    <main className="min-h-screen bg-[#070b1a] text-white">
      {/* Navbar */}
      {/* <nav className="border-b border-blue-900/40 bg-[#0a1024]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-red-500">FS</span>{' '}
              <span className="text-blue-400">User Management</span>
            </h1>
            <p className="text-xs text-gray-500">Manage application users</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg border border-blue-800/50 px-3 py-2 text-sm text-blue-300 transition hover:bg-blue-950"
            >
              Dashboard
            </button>

            <button
              onClick={handleLogout}
              className="rounded-lg border border-red-800/50 px-3 py-2 text-sm text-red-400 transition hover:bg-red-950"
            >
              Logout
            </button>
          </div>
        </div>
      </nav> */}

      <AdminHeader
        title="User Management"
        subtitle="Manage application users"
      />

      {/* Content */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Users</h2>

            <p className="mt-1 text-sm text-gray-400">
              Manage users and their access roles.
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3 text-sm font-semibold shadow-lg shadow-blue-950/30 transition hover:opacity-90"
          >
            + Add User
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

        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error instanceof Error ? error.message : 'Failed to load users'}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-blue-900/40 bg-[#0a1024] shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="border-b border-blue-900/40 bg-[#0d1530]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Username
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Email
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Role
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Created
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
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-gray-400"
                    >
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user, index) => (
                    <tr
                      key={user._id ?? `${user.username}-${index}`}
                      className="transition hover:bg-blue-950/20"
                    >
                      <td className="px-6 py-4 font-medium">{user.username}</td>

                      <td className="px-6 py-4 text-gray-400">{user.email}</td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            user.role === 'admin'
                              ? 'bg-red-950 text-red-300'
                              : 'bg-blue-950 text-blue-300'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString('id-ID')}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openEditModal(user)}
                          className="mr-2 rounded-md border border-blue-800/50 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-950"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => openDeleteModal(user)}
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

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-blue-900/50 bg-[#0a1024] shadow-2xl shadow-black/50">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-blue-900/40 px-6 py-5">
              <div>
                <h3 className="text-lg font-bold">Add User</h3>

                <p className="mt-1 text-xs text-gray-500">
                  Create a new application user.
                </p>
              </div>

              <button
                onClick={closeAddModal}
                disabled={createUserMutation.isPending}
                className="text-2xl text-gray-500 transition hover:text-white disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddUser} className="space-y-5 p-6">
              {/* Username */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Username
                </label>

                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="john"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Email
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="john@example.com"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Password */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {/* Role */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Role
                </label>

                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                  <option value="admin-produksi">Admin Produksi</option>
                </select>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={createUserMutation.isPending}
                  className="flex-1 rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>

                {/* <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Create User'}
                </button> */}
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="flex-1 rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createUserMutation.isPending ? 'Saving...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-blue-900/50 bg-[#0a1024] shadow-2xl shadow-black/50">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-blue-900/40 px-6 py-5">
              <div>
                <h3 className="text-lg font-bold">Edit User</h3>

                <p className="mt-1 text-xs text-gray-500">
                  Update user information.
                </p>
              </div>

              <button
                onClick={closeEditModal}
                disabled={updateUserMutation.isPending}
                className="text-2xl text-gray-500 transition hover:text-white disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditUser} className="space-y-5 p-6">
              {/* Username */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Username
                </label>

                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Email
                </label>

                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                />
              </div>

              {/* Password */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Password
                </label>

                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Leave empty to keep current password"
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500"
                />

                <p className="mt-1.5 text-xs text-gray-600">
                  Kosongkan jika password tidak ingin diubah.
                </p>
              </div>

              {/* Role */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Role
                </label>

                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                  <option value="admin-produksi">Admin Produksi</option>
                </select>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={updateUserMutation.isPending}
                  className="flex-1 rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="flex-1 rounded-lg bg-gradient-to-r from-red-600 to-blue-600 px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateUserMutation.isPending
                    ? 'Updating...'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-[#0a1024] shadow-2xl shadow-black/50">
            <div className="p-6">
              {/* Icon */}
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-950 text-xl text-red-400">
                !
              </div>

              <h3 className="text-lg font-bold text-white">Delete User?</h3>

              <p className="mt-2 text-sm leading-6 text-gray-400">
                Apakah kamu yakin ingin menghapus user{' '}
                <span className="font-semibold text-white">
                  {deletingUser.username}
                </span>
                ?
              </p>

              <p className="mt-2 text-xs text-red-400">
                Data user yang dihapus tidak dapat dikembalikan.
              </p>

              {/* Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleteUserMutation.isPending}
                  className="flex-1 rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={deleteUserMutation.isPending}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
