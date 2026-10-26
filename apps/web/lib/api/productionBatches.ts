import { apiFetch } from '@/lib/api';

export type ProductionBatchStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface ProductionBatch {
  _id: string;
  batchNumber: string;
  status: ProductionBatchStatus;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionBatchInput {
  status?: ProductionBatchStatus;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  notes?: string;
}

export interface UpdateProductionBatchInput {
  status?: ProductionBatchStatus;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  notes?: string;
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export async function getProductionBatches(): Promise<ProductionBatch[]> {
  const response = await apiFetch<ApiResponse<ProductionBatch[]>>(
    '/api/production-batches',
  );

  return response.data;
}

export async function getProductionBatch(id: string): Promise<ProductionBatch> {
  const response = await apiFetch<ApiResponse<ProductionBatch>>(
    `/api/production-batches/${id}`,
  );

  return response.data;
}

export async function createProductionBatch(
  input: CreateProductionBatchInput,
): Promise<ProductionBatch> {
  const response = await apiFetch<ApiResponse<ProductionBatch>>(
    '/api/production-batches',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function updateProductionBatch(
  id: string,
  input: UpdateProductionBatchInput,
): Promise<ProductionBatch> {
  const response = await apiFetch<ApiResponse<ProductionBatch>>(
    `/api/production-batches/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function deleteProductionBatch(id: string): Promise<void> {
  await apiFetch<ApiResponse<null>>(`/api/production-batches/${id}`, {
    method: 'DELETE',
  });
}
