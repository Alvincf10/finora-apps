import { describe, expect, it } from "vitest";
import {
  bindGetMessage,
  createRecentMessageStore,
} from "@/lib/whatsapp/recent-message-store";

describe("createRecentMessageStore", () => {
  it("remembers and returns messages by id", () => {
    const store = createRecentMessageStore();
    store.remember("abc", { conversation: "hi" });
    expect(store.get("abc")).toEqual({ conversation: "hi" });
    expect(store.size()).toBe(1);
  });

  it("ignores empty id or empty message", () => {
    const store = createRecentMessageStore();
    store.remember(null, { conversation: "x" });
    store.remember("id", null);
    store.remember("", { conversation: "x" });
    expect(store.size()).toBe(0);
  });

  it("evicts oldest when over maxEntries", () => {
    const store = createRecentMessageStore({ maxEntries: 2 });
    store.remember("a", { conversation: "1" });
    store.remember("b", { conversation: "2" });
    store.remember("c", { conversation: "3" });
    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")).toEqual({ conversation: "2" });
    expect(store.get("c")).toEqual({ conversation: "3" });
  });

  it("get refreshes LRU so hot ids survive eviction", () => {
    const store = createRecentMessageStore({ maxEntries: 2 });
    store.remember("a", { conversation: "1" });
    store.remember("b", { conversation: "2" });
    expect(store.get("a")).toEqual({ conversation: "1" });
    store.remember("c", { conversation: "3" });
    expect(store.get("a")).toEqual({ conversation: "1" });
    expect(store.get("b")).toBeUndefined();
  });
});

describe("bindGetMessage", () => {
  it("returns stored content for Baileys retry lookups", async () => {
    const store = createRecentMessageStore();
    store.remember("mid", { conversation: "Vira · ok" });
    const getMessage = bindGetMessage(store);
    await expect(getMessage({ id: "mid" })).resolves.toEqual({
      conversation: "Vira · ok",
    });
    await expect(getMessage({ id: "missing" })).resolves.toBeUndefined();
    await expect(getMessage({ id: null })).resolves.toBeUndefined();
  });
});
