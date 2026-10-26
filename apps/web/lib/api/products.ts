import { apiFetch } from '@/lib/api';

export interface ProductionProcess {
  _id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductWorkflowItem {
  process: ProductionProcess;
  sequence: number;
}

export interface Product {
  _id: string;
  name: string;
  version: string;
  body: string;
  workflow?: ProductWorkflowItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  version: string;
  body: string;
}

export interface UpdateProductInput {
  version: string;
  body: string;
}

export interface UpdateProductWorkflowInput {
  workflow: {
    process: string;
    sequence: number;
  }[];
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export async function getProducts(): Promise<Product[]> {
  const response = await apiFetch<ApiResponse<Product[]>>('/api/products');

  return response.data;
}

export async function getProduct(id: string): Promise<Product> {
  const response = await apiFetch<ApiResponse<Product>>(`/api/products/${id}`);

  return response.data;
}

export async function createProduct(
  input: CreateProductInput,
): Promise<Product> {
  const response = await apiFetch<ApiResponse<Product>>('/api/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  const response = await apiFetch<ApiResponse<Product>>(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function updateProductWorkflow(
  id: string,
  input: UpdateProductWorkflowInput,
): Promise<Product> {
  const response = await apiFetch<ApiResponse<Product>>(
    `/api/products/${id}/workflow`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await apiFetch<ApiResponse<null>>(`/api/products/${id}`, {
    method: 'DELETE',
  });
}
