import { AsyncLocalStorage } from "node:async_hooks";

type CacheStore = Map<string, Promise<unknown>>;

const als = new AsyncLocalStorage<CacheStore>();

/** Run an async unit with a request-scoped memo map (dedupe overlapping loaders). */
export function runWithRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  return als.run(new Map(), fn);
}

/**
 * Memoize `factory` for the lifetime of the current `runWithRequestCache` scope.
 * Outside a scope, behaves as a passthrough (no global leak).
 */
export function requestCached<T>(
  key: string,
  factory: () => Promise<T>
): Promise<T> {
  const store = als.getStore();
  if (!store) return factory();
  const hit = store.get(key);
  if (hit) return hit as Promise<T>;
  const promise = factory();
  store.set(key, promise);
  return promise;
}
