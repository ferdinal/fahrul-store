import { apiFetch } from '@/lib/api';

export type OperatorUser = {
  _id: string;
  username: string;
  email?: string;
  role?: 'operator';
};

export type ProductionLot = {
  _id: string;
  lotCode: string;
  quantity: number;
  availableQuantity: number;
  sourceStepId?: string | null;
  status?: string;
};

export type OperatorStep = {
  _id: string;
  process?: string;
  processName?: string;
  processCode?: string;
  sequence?: number;
  dependsOn?: string[];
  status: string;
  ownerOperator?: string | null;
  claimedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  quantityProcessed?: number;
  quantityGood?: number;
  quantityScrap?: number;
  assignments?: Array<{
    assignedOperator?: string;
    quantity?: number;
    sourceTransfer?: string;
    assignedAt?: string;
    notes?: string;
  }>;
};

export type OperatorOrder = {
  _id: string;
  orderNumber: string;
  quantity: number;
  status: string;
  product?: { _id?: string; name?: string } | string | null;
  batch?: { _id?: string; batchNumber?: string } | string | null;
  steps?: OperatorStep[];
};

export type OperatorWorkItem = {
  order: OperatorOrder;
  step: OperatorStep;
  inputLots: ProductionLot[];
  outputLots?: ProductionLot[];
  availableQuantity: number;
  outputAvailableQuantity?: number;
  canStart?: boolean;
  blockedReason?: string;
};

export type IncomingTransfer = {
  transfer: {
    _id: string;
    quantity: number;
    sourceStepId: string;
    assignedOperator?: string;
    transferredAt?: string;
    notes?: string;
  };
  order: OperatorOrder;
  sourceStep: OperatorStep | null;
  eligibleSteps: OperatorStep[];
};

type ApiResponse<T> = { success: boolean; message?: string; data: T };

export type RecordProductionInput = {
  idempotencyKey: string;
  notes?: string;
  completeStep: boolean;
  allocations: Array<{
    inputLot: string;
    quantityProcessed: number;
    goodQuantity: number;
    scrapQuantity: number;
  }>;
};

export type CreateAssignmentInput = {
  targetOperatorIds: string[];
  sourceLotId: string;
  quantity: number;
  idempotencyKey: string;
  notes?: string;
};

export async function getAvailableWork(): Promise<OperatorWorkItem[]> {
  const response = await apiFetch<ApiResponse<OperatorWorkItem[]>>(
    '/api/operator-work/available',
  );
  return response.data;
}

export async function getMyWork(): Promise<OperatorWorkItem[]> {
  const response = await apiFetch<ApiResponse<OperatorWorkItem[]>>(
    '/api/operator-work/mine',
  );
  return response.data;
}

export async function getOperators(): Promise<OperatorUser[]> {
  const response = await apiFetch<ApiResponse<OperatorUser[]>>(
    '/api/operator-work/operators',
  );
  return response.data;
}

export async function getIncomingTransfers(): Promise<IncomingTransfer[]> {
  const response = await apiFetch<ApiResponse<IncomingTransfer[]>>(
    '/api/operator-work/incoming-transfers',
  );
  return response.data;
}

export async function startOperatorWork(
  orderId: string,
  stepId: string,
): Promise<void> {
  await apiFetch<ApiResponse<unknown>>(
    `/api/operator-work/orders/${orderId}/steps/${stepId}/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
}

export async function recordProductionResult(
  orderId: string,
  stepId: string,
  input: RecordProductionInput,
): Promise<void> {
  await apiFetch<ApiResponse<unknown>>(
    `/api/production-orders/${orderId}/steps/${stepId}/results`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export async function createNextAssignment(
  orderId: string,
  sourceStepId: string,
  input: CreateAssignmentInput,
): Promise<void> {
  await apiFetch<ApiResponse<unknown>>(
    `/api/operator-work/orders/${orderId}/steps/${sourceStepId}/assignments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export async function selectTransferProcesses(
  transferId: string,
  stepIds: string[],
): Promise<void> {
  await apiFetch<ApiResponse<unknown>>(
    `/api/operator-work/transfers/${transferId}/select-processes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepIds }),
    },
  );
}

export async function completeProductionOrder(
  orderId: string,
  stepId: string,
): Promise<void> {
  await apiFetch<ApiResponse<unknown>>(
    `/api/production-orders/${orderId}/steps/${stepId}/complete-production`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
}

export async function completeProductionStep(
  orderId: string,
  stepId: string,
): Promise<void> {
  await apiFetch<ApiResponse<unknown>>(
    `/api/production-orders/${orderId}/steps/${stepId}/complete-step`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
}
