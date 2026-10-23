import type { ApiResponse } from "@/types";

export async function api<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await response.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error.message);
  }
  return json.data;
}
