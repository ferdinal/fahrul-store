export const inventoryKeys = {
  all: ['inventory'] as const,

  list: () => [...inventoryKeys.all, 'list'] as const,

  detail: (productId: string) =>
    [...inventoryKeys.all, 'detail', productId] as const,

  movements: (productId: string) =>
    [...inventoryKeys.all, 'movements', productId] as const,
};
