"use client";

import useSWR, { mutate, preload, type SWRConfiguration } from "swr";
import { api } from "@/lib/client-api";

const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 8_000,
  keepPreviousData: true,
  errorRetryCount: 2,
};

async function fetcher<T>(path: string): Promise<T> {
  return api<T>(path);
}

/** Shared SWR fetcher for Finora JSON APIs (`{ success, data }`). */
export function useApi<T>(
  path: string | null,
  config?: SWRConfiguration<T, Error>
) {
  return useSWR<T, Error>(path, fetcher, {
    ...defaultConfig,
    ...config,
  });
}

export function prefetchApi(path: string) {
  return preload(path, fetcher);
}

export function invalidateApi(path?: string) {
  if (path) return mutate(path);
  return mutate(() => true, undefined, { revalidate: true });
}

/** Warm bottom-tab destinations after shell mounts. */
export function prefetchPrimaryTabs() {
  void prefetchApi("/api/dashboard?scope=core");
  void prefetchApi("/api/action-center");
  void prefetchApi("/api/transactions?limit=50&skip=0");
}
