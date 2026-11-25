/**
 * In-memory store for Baileys message retries.
 *
 * WhatsApp asks the linked device to resend when a peer cannot decrypt.
 * Without getMessage (or Baileys 7's enableRecentMessageCache), the phone
 * shows "Waiting for this message. This may take a while."
 *
 * Spidernet (Baileys 7) gets this via enableRecentMessageCache=true default.
 * Finora is on Baileys 6 — we mirror that with an explicit store + getMessage.
 */

export type StoredWaMessage = Record<string, unknown>;

export type RecentMessageStore = {
  remember: (id: string | null | undefined, message: StoredWaMessage | null | undefined) => void;
  get: (id: string | null | undefined) => StoredWaMessage | undefined;
  size: () => number;
  clear: () => void;
};

export type RecentMessageStoreOptions = {
  /** Max retained messages (oldest dropped). Default 200. */
  maxEntries?: number;
};

export function createRecentMessageStore(
  options: RecentMessageStoreOptions = {}
): RecentMessageStore {
  const maxEntries = Math.max(1, options.maxEntries ?? 200);
  const map = new Map<string, StoredWaMessage>();

  return {
    remember(id, message) {
      if (!id || !message || typeof message !== "object") return;
      // Refresh insertion order for LRU-ish eviction
      if (map.has(id)) map.delete(id);
      map.set(id, message);
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    get(id) {
      if (!id) return undefined;
      const hit = map.get(id);
      if (!hit) return undefined;
      // Touch for LRU
      map.delete(id);
      map.set(id, hit);
      return hit;
    },
    size: () => map.size,
    clear: () => map.clear(),
  };
}

/** Baileys getMessage adapter — returns undefined when unknown (retry skipped). */
export function bindGetMessage(store: RecentMessageStore) {
  return async (key: { id?: string | null }) => {
    const found = store.get(key?.id);
    return found as never;
  };
}
