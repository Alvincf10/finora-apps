/** Escape user input before embedding in a MongoDB / JS RegExp. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitize a search query for `$regex`: trim, length-cap, escape metacharacters.
 * Returns null when empty after trim.
 */
export function sanitizeSearchQuery(
  raw: string | null | undefined,
  maxLen = 80
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().slice(0, maxLen);
  if (!trimmed) return null;
  return escapeRegex(trimmed);
}
