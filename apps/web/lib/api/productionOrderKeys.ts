export const productionOrderKeys = {
  all: ['production-orders'] as const,

  list: () => [...productionOrderKeys.all, 'list'] as const,

  detail: (id: string) => [...productionOrderKeys.all, 'detail', id] as const,
};
