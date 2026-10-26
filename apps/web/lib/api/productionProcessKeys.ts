export const productionProcessKeys = {
  all: ['production-processes'] as const,

  list: () => [...productionProcessKeys.all, 'list'] as const,

  detail: (id: string) => [...productionProcessKeys.all, 'detail', id] as const,
};
