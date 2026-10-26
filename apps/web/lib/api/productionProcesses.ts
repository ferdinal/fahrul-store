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

export interface CreateProductionProcessInput {
  name: string;
  code: string;
  description?: string;
  active?: boolean;
}

export interface UpdateProductionProcessInput {
  name: string;
  code: string;
  description?: string;
  active?: boolean;
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export async function getProductionProcesses(): Promise<ProductionProcess[]> {
  const response = await apiFetch<ApiResponse<ProductionProcess[]>>(
    '/api/production-processes',
  );

  return response.data;
}

export async function createProductionProcess(
  input: CreateProductionProcessInput,
): Promise<ProductionProcess> {
  const response = await apiFetch<ApiResponse<ProductionProcess>>(
    '/api/production-processes',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function updateProductionProcess(
  id: string,
  input: UpdateProductionProcessInput,
): Promise<ProductionProcess> {
  const response = await apiFetch<ApiResponse<ProductionProcess>>(
    `/api/production-processes/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function deleteProductionProcess(id: string): Promise<void> {
  await apiFetch<ApiResponse<null>>(`/api/production-processes/${id}`, {
    method: 'DELETE',
  });
}
