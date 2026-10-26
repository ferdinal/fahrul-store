import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type CustomerOrderStatus =
  | 'pending'
  | 'partial'
  | 'fulfilled'
  | 'cancelled'
  | 'delivered'
  | 'completed';

export interface CustomerOrderBuyer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface CustomerOrderShippingAddress {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface CustomerOrderProduct {
  _id: string;
  name: string;
  version: string;
  body: string;
}

export interface CustomerOrderItem {
  _id: string;
  product: CustomerOrderProduct;
  productName: string;
  productOptionName: string;
  quantity: number;
  fulfilledQuantity: number;
  allocatedQuantity: number;
  price: number;
  total: number;
}

export interface CustomerOrder {
  _id: string;
  orderNumber: string;
  orderBy: string;
  buyer: CustomerOrderBuyer;
  orderDate: string;
  fulfillmentDueDate: string;
  status: CustomerOrderStatus;
  paymentStatus: string;
  shippingStatus: string;
  shippingMethod: string;
  packagingCode: string;
  shippingAddress: CustomerOrderShippingAddress;
  currency: string;
  subtotal: number;
  shippingCost: number;
  tax: number;
  discount: number;
  total: number;
  note: string;

  completionNotes: string;
  completedAt?: string | null;

  items: CustomerOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerOrderInput {
  buyer: CustomerOrderBuyer;

  orderDate: string;
  orderBy: string;

  shippingMethod: 'regular' | 'express';

  items: {
    product: string;
    productName: string;
    productOptionName: string;
    quantity: number;
    price: number;
    total: number;
  }[];
}

export interface UpdateCustomerOrderInput {
  orderNumber: string;

  buyer: CustomerOrderBuyer;

  orderDate: string;
  fulfillmentDueDate: string;

  status?: CustomerOrderStatus;

  paymentStatus?: string;
  shippingStatus?: string;
  shippingMethod?: string;

  shippingAddress: CustomerOrderShippingAddress;

  currency?: string;

  subtotal?: number;
  shippingCost?: number;
  tax?: number;
  discount?: number;
  total?: number;

  note?: string;

  items: {
    product: string;
    productName: string;
    productOptionName: string;
    quantity: number;
    fulfilledQuantity?: number;
    price: number;
    total: number;
  }[];
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export interface CustomerOrderAllocationItem {
  itemId: string;
  quantity: number;
}

export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const response = await apiFetch<ApiResponse<CustomerOrder[]>>(
    '/api/customer-orders',
  );

  return response.data;
}

export async function getCustomerOrder(id: string): Promise<CustomerOrder> {
  const response = await apiFetch<ApiResponse<CustomerOrder>>(
    `/api/customer-orders/${id}`,
  );

  return response.data;
}

export async function createCustomerOrder(
  input: CreateCustomerOrderInput,
): Promise<CustomerOrder> {
  const response = await apiFetch<ApiResponse<CustomerOrder>>(
    '/api/customer-orders',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function updateCustomerOrder(
  id: string,
  input: UpdateCustomerOrderInput,
): Promise<CustomerOrder> {
  const response = await apiFetch<ApiResponse<CustomerOrder>>(
    `/api/customer-orders/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function deleteCustomerOrder(id: string): Promise<void> {
  await apiFetch<ApiResponse<null>>(`/api/customer-orders/${id}`, {
    method: 'DELETE',
  });
}

/**
 * CSV Import Preview
 */

export interface CustomerOrderImportItemPreview {
  productName: string;
  productOptionName: string;
  quantity: number;
  price: number;
  total: number;

  matched: boolean;

  product: CustomerOrderProduct | null;
}

export interface CustomerOrderImportOrderPreview {
  orderNumber: string;

  buyer: CustomerOrderBuyer;

  orderDate: string;

  paymentStatus: string;
  shippingStatus: string;
  shippingMethod: string;

  shippingAddress: CustomerOrderShippingAddress;

  currency: string;

  subtotal: number;
  shippingCost: number;
  tax: number;
  discount: number;
  total: number;

  note: string;

  items: CustomerOrderImportItemPreview[];

  valid: boolean;

  errors: string[];
}

export interface CustomerOrderImportPreview {
  summary: {
    totalOrders: number;
    validOrders: number;
    invalidOrders: number;
  };

  orders: CustomerOrderImportOrderPreview[];
}

export interface FulfillCustomerOrderItemInput {
  itemId: string;
  quantity: number;
}

export interface FulfillCustomerOrderInput {
  items: FulfillCustomerOrderItemInput[];
}

export async function previewCustomerOrderCsv(
  file: File,
): Promise<CustomerOrderImportPreview> {
  const token = useAuthStore.getState().accessToken;

  const formData = new FormData();

  formData.append('file', file);

  const response = await fetch(
    `${API_URL}/api/customer-orders/import/preview`,
    {
      method: 'POST',

      headers: {
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },

      body: formData,
    },
  );

  let data: {
    success?: boolean;
    message?: string;
    data?: CustomerOrderImportPreview;
  };

  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid server response');
  }

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }

    throw new Error(data.message ?? 'Gagal preview CSV');
  }

  if (!data.data) {
    throw new Error('Preview CSV tidak tersedia');
  }

  return data.data;
}

/**
 * CSV Import
 */

export interface CustomerOrderImportResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;

  errors?: {
    rowNumber?: number;
    message: string;
  }[];

  orders?: {
    _id: string;
    orderNumber: string;
  }[];
}

export async function importCustomerOrderCsv(
  file: File,
  fulfillmentDueDate: string,
  orderNumbersToImport: string[],
): Promise<CustomerOrderImportResult> {
  const token = useAuthStore.getState().accessToken;

  const formData = new FormData();

  formData.append('file', file);
  formData.append('fulfillmentDueDate', fulfillmentDueDate);
  formData.append('orderNumbersToImport', JSON.stringify(orderNumbersToImport));

  const response = await fetch(`${API_URL}/api/customer-orders/import`, {
    method: 'POST',

    headers: {
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },

    body: formData,
  });

  let data: {
    success?: boolean;
    message?: string;
    data?: CustomerOrderImportResult;
  };

  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid server response');
  }

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }

    throw new Error(data.message ?? 'Gagal import customer order');
  }

  if (!data.data) {
    throw new Error('Hasil import customer order tidak tersedia');
  }

  return data.data;
}

export async function fulfillCustomerOrder(
  id: string,
  input: FulfillCustomerOrderInput,
): Promise<CustomerOrder> {
  const response = await apiFetch<ApiResponse<CustomerOrder>>(
    `/api/customer-orders/${id}/fulfill`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export async function allocateCustomerOrder(
  id: string,
  items: CustomerOrderAllocationItem[],
) {
  return apiFetch<{
    success: boolean;
    message: string;
    data: CustomerOrder;
  }>(`/api/customer-orders/${id}/allocate`, {
    method: 'POST',
    body: JSON.stringify({
      items,
    }),
  });
}

export interface UpdateCustomerOrderStatusInput {
  status: 'delivered' | 'completed';
  completionNotes?: string;
}

export async function updateCustomerOrderStatus(
  id: string,
  input: UpdateCustomerOrderStatusInput,
): Promise<CustomerOrder> {
  const response = await apiFetch<ApiResponse<CustomerOrder>>(
    `/api/customer-orders/${id}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );

  return response.data;
}

export interface UpdateCustomerOrderInput {
  orderNumber: string;
  orderBy: string;

  buyer: CustomerOrderBuyer;

  orderDate: string;
  fulfillmentDueDate: string;

  // Properti lainnya tetap seperti kode sebelumnya.
}
