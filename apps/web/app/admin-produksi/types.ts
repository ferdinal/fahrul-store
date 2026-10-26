export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type ProductionRequirement = {
  product: {
    _id: string;
    name: string;
    version?: string;
    body?: string;
  };
  demandQuantity: number;
  inventory: {
    physicalQuantity: number;
    allocatedQuantity: number;
    availableQuantity: number;
  };
  production: {
    plannedQuantity: number;
    inProgressQuantity: number;
    totalQuantity: number;
  };
  totalSupply: number;
  productionNeed: number;
};

export type Operator = {
  _id: string;
  username: string;
  email?: string;
  role: string;
};

export type UnitRange = {
  start: number;
  end: number;
};

export type UnassignedOrder = {
  _id: string;
  orderNumber: string;
  quantity: number;
  status: string;
  product?: {
    _id?: string;
    name?: string;
    version?: string;
  } | null;
  batch?: {
    _id?: string;
    batchNumber?: string;
  } | null;
  step: {
    _id: string;
    processName: string;
    processCode: string;
    status: string;
  };
  assignedRanges: UnitRange[];
  remainingRanges: UnitRange[];
};

export const panelClass = 'rounded-2xl border border-blue-900/40 bg-[#0a1024]';

export const fieldClass =
  'min-h-12 w-full rounded-xl border border-blue-900/50 bg-[#070b1a] px-3 py-3 text-base text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50';

export const labelClass = 'block text-sm font-medium text-gray-300';

export function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Terjadi kesalahan. Silakan coba lagi.';
}

export function parseRanges(value: string): UnitRange[] {
  const tokens = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('Masukkan rentang unit, misalnya 1-40.');
  }

  const ranges = tokens
    .map((token) => {
      const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);

      if (!match) {
        throw new Error(`Format rentang "${token}" tidak valid.`);
      }

      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start
      ) {
        throw new Error(`Rentang "${token}" tidak valid.`);
      }

      return { start, end };
    })
    .sort((a, b) => a.start - b.start);

  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];

    if (previous && current && current.start <= previous.end) {
      throw new Error('Rentang unit tidak boleh tumpang tindih.');
    }
  }

  return ranges;
}

export function countRanges(ranges: UnitRange[]) {
  return ranges.reduce((sum, range) => sum + range.end - range.start + 1, 0);
}

export function formatRanges(ranges: UnitRange[]) {
  if (ranges.length === 0) return '—';

  return ranges
    .map((range) =>
      range.start === range.end
        ? String(range.start)
        : `${range.start}-${range.end}`,
    )
    .join(', ');
}
