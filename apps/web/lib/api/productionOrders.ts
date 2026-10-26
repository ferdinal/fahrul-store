import { apiFetch } from '@/lib/api';

export interface ProductionBatch {
  _id: string;
  batchNumber: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrderProduct {
  _id: string;
  name: string;
  version: string;
  body: string;
}

export interface ProductionOrder {
  _id: string;
  orderNumber: string;
  batch: ProductionBatch;
  product: ProductionOrderProduct;
  quantity: number;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  steps: ProductionStep[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionOrderInput {
  batch: string;
  product: string;
  quantity: number;
  status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
}

export interface UpdateProductionOrderInput {
  batch: string;
  product: string;
  quantity: number;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export interface ProductionStep {
  _id: string;
  process: string;
  processName: string;
  processCode: string;
  sequence: number;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  startedAt: string | null;
  completedAt: string | null;
  notes: string;
  quantityProcessed: number;
  quantityGood: number;
  quantityScrap: number;
}

export interface UpdateProductionOrderStepInput {
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';

  notes?: string;
}

export async function updateProductionOrderStep(
  orderId: string,
  stepId: string,
  input: UpdateProductionOrderStepInput,
): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<ProductionOrder>>(
    `/api/production-orders/${orderId}/steps/${stepId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function getProductionOrders(): Promise<ProductionOrder[]> {
  const response = await apiFetch<ApiResponse<ProductionOrder[]>>(
    '/api/production-orders',
  );

  return response.data;
}

export async function getProductionOrder(id: string): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<ProductionOrder>>(
    `/api/production-orders/${id}`,
  );

  return response.data;
}

export async function createProductionOrder(
  input: CreateProductionOrderInput,
): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<ProductionOrder>>(
    '/api/production-orders',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function updateProductionOrder(
  id: string,
  input: UpdateProductionOrderInput,
): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<ProductionOrder>>(
    `/api/production-orders/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function deleteProductionOrder(id: string): Promise<void> {
  await apiFetch<ApiResponse<null>>(`/api/production-orders/${id}`, {
    method: 'DELETE',
  });
}
