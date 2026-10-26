import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ApiError {
  message?: string;
}

function buildApiUrl(endpoint: string): string {
  const baseUrl = API_URL.replace(/\/+$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Jika base URL adalah /api, hindari prefix /api ganda.
  if (baseUrl === '/api' && (path === '/api' || path.startsWith('/api/'))) {
    return `${baseUrl}${path.slice(4)}`;
  }

  return `${baseUrl}${path}`;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== 'undefined' ? useAuthStore.getState().accessToken : null;

  const response = await fetch(buildApiUrl(endpoint), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
      ...(options.headers ?? {}),
    },
  });

  let data: T | ApiError;

  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid server response');
  }

  if (!response.ok) {
    const error = data as ApiError;

    if (response.status === 401) {
      useAuthStore.getState().logout();
    }

    throw new Error(error.message ?? 'Something went wrong');
  }

  return data as T;
}
