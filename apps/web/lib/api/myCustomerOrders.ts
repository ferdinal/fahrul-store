import { apiFetch } from '@/lib/api';

import type { CustomerOrder } from '@/lib/api/customerOrders';

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export interface CreateMyCustomerOrderInput {
  orderDate: string;
  orderBy:
    | 'Big cartel'
    | 'Shopee internasional'
    | 'Shopee Indonesia'
    | 'Tiktok'
    | 'Etsy'
    | 'Complain'
    | 'Additional Order';
  shippingMethod: 'regular' | 'express';
  items: {
    product: string;
    quantity: number;
    price: number;
  }[];
}

export async function getMyCustomerOrders(): Promise<CustomerOrder[]> {
  const response = await apiFetch<ApiResponse<CustomerOrder[]>>(
    '/api/my-customer-orders',
  );

  return response.data;
}

export async function getMyCustomerOrder(id: string): Promise<CustomerOrder> {
  const response = await apiFetch<ApiResponse<CustomerOrder>>(
    `/api/my-customer-orders/${id}`,
  );

  return response.data;
}

export async function createMyCustomerOrder(
  input: CreateMyCustomerOrderInput,
): Promise<CustomerOrder> {
  const response = await apiFetch<ApiResponse<CustomerOrder>>(
    '/api/my-customer-orders',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}
