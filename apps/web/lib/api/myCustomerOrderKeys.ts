export const myCustomerOrderKeys = {
  all: ['my-customer-orders'] as const,

  lists: () => [...myCustomerOrderKeys.all, 'list'] as const,

  list: () => [...myCustomerOrderKeys.lists()] as const,

  details: () => [...myCustomerOrderKeys.all, 'detail'] as const,

  detail: (id: string) => [...myCustomerOrderKeys.details(), id] as const,
};
