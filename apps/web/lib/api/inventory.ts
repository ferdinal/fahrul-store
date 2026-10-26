import { apiFetch } from '@/lib/api';

export interface InventoryProduct {
  _id: string;
  name: string;
  version: string;
  body: string;
}

export interface FinishedGoodsInventory {
  _id: string;
  product: InventoryProduct;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  _id: string;
  product: InventoryProduct;
  type: 'IN' | 'OUT';
  quantity: number;
  referenceType: 'production_order';
  referenceId: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export interface FinishedGoodsInventory {
  _id: string;
  product: {
    _id: string;
    name: string;
    version: string;
    body: string;
  };
  quantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export async function getInventory(): Promise<FinishedGoodsInventory[]> {
  const response =
    await apiFetch<ApiResponse<FinishedGoodsInventory[]>>('/api/inventory');

  return response.data;
}

// export async function getInventoryByProduct(
//   productId: string,
// ): Promise<FinishedGoodsInventory> {
//   const response = await apiFetch<ApiResponse<FinishedGoodsInventory>>(
//     `/api/inventory/${productId}`,
//   );

//   return response.data;
// }

export async function getStockMovements(
  productId: string,
): Promise<StockMovement[]> {
  const response = await apiFetch<ApiResponse<StockMovement[]>>(
    `/api/inventory/${productId}/movements`,
  );

  return response.data;
}

export async function getInventoryByProduct(
  productId: string,
): Promise<FinishedGoodsInventory> {
  const response = await apiFetch<{
    success?: boolean;
    message?: string;
    data: FinishedGoodsInventory;
  }>(`/api/inventory/${productId}`);

  return response.data;
}
