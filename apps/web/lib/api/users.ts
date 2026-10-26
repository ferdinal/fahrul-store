import { apiFetch } from '@/lib/api';

export interface User {
  _id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  password?: string;
  role?: string;
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export async function getUsers(): Promise<User[]> {
  const response = await apiFetch<ApiResponse<User[]>>('/api/users');

  return response.data;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const response = await apiFetch<ApiResponse<User>>('/api/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<User> {
  const response = await apiFetch<ApiResponse<User>>(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch<ApiResponse<null>>(`/api/users/${id}`, {
    method: 'DELETE',
  });
}
