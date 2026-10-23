/**
 * Cost calculation — USD from token counts and per-1M pricing.
 * Formula: (input×in + output×out + cacheRead×cr + cacheWrite×cw) / 1_000_000
 */

export function estimateCostUsd(usage, price) {
  const input = Number(usage?.input ?? 0) || 0;
  const output = Number(usage?.output ?? 0) || 0;
  const cacheRead = Number(usage?.cacheRead ?? 0) || 0;
  const cacheWrite = Number(usage?.cacheWrite ?? 0) || 0;
  const p = price ?? {};
  const usd =
    (input * (p.input ?? 0) +
      output * (p.output ?? 0) +
      cacheRead * (p.cacheRead ?? 0) +
      cacheWrite * (p.cacheWrite ?? 0)) /
    1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}

export function resolvePrice(pricing, provider, model) {
  const models = pricing?.models ?? {};
  const candidates = [
    model,
    provider && model ? `${provider}/${model}` : null,
    provider && model && !String(model).includes("/")
      ? `${provider}/${model}`
      : null,
  ].filter(Boolean);

  for (const key of candidates) {
    if (models[key]) return { key, price: models[key] };
  }
  // fuzzy: endswith model id
  const modelId = String(model ?? "").split("/").pop();
  for (const [key, price] of Object.entries(models)) {
    if (key === modelId || key.endsWith(`/${modelId}`)) {
      return { key, price };
    }
  }
  return { key: "default", price: pricing?.default ?? { input: 0, output: 0 } };
}
