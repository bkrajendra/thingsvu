import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextValue {
  tenantId: string;
  schemaName: string;
  slug: string;
}

const storage = new AsyncLocalStorage<TenantContextValue>();

export const TenantContext = {
  run<T>(value: TenantContextValue, fn: () => T): T {
    return storage.run(value, fn);
  },
  get(): TenantContextValue | undefined {
    return storage.getStore();
  },
  getOrThrow(): TenantContextValue {
    const value = storage.getStore();
    if (!value) throw new Error('No tenant context set for this request');
    return value;
  },
};
