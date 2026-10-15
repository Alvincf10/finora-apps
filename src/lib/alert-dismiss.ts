const STORAGE_KEY = "finora:dismissed-alerts";

type DismissMap = Record<string, number>;

function readMap(): DismissMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DismissMap;
  } catch {
    return {};
  }
}

function writeMap(map: DismissMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** Drop dismissals older than 45 days. */
function prune(map: DismissMap): DismissMap {
  const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
  const next: DismissMap = {};
  for (const [id, at] of Object.entries(map)) {
    if (at >= cutoff) next[id] = at;
  }
  return next;
}

export function getDismissedAlertIds(): Set<string> {
  return new Set(Object.keys(prune(readMap())));
}

export function dismissAlert(id: string) {
  const map = prune(readMap());
  map[id] = Date.now();
  writeMap(map);
}

export function clearDismissedAlerts() {
  localStorage.removeItem(STORAGE_KEY);
}
