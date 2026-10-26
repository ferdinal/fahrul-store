export const productionBatchKeys = {
  all: ['production-batches'] as const,

  list: () => [...productionBatchKeys.all, 'list'] as const,

  detail: (id: string) => [...productionBatchKeys.all, 'detail', id] as const,
};
