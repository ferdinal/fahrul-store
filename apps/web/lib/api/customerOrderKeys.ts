export const customerOrderKeys = {
  all: ['customer-orders'] as const,

  list: () => [...customerOrderKeys.all, 'list'] as const,

  detail: (id: string) => [...customerOrderKeys.all, 'detail', id] as const,
};
