export type PendingGenLayerWrite = {
  hash: string;
  label: string;
  reference?: string;
};

export function readPendingGenLayerWrite(
  storageKey: string,
): PendingGenLayerWrite | null {
  if (typeof window === "undefined") return null;

  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    if (
      typeof value === "object" &&
      value !== null &&
      "hash" in value &&
      "label" in value &&
      typeof value.hash === "string" &&
      /^0x[a-fA-F0-9]+$/.test(value.hash) &&
      typeof value.label === "string" &&
      value.label.length > 0
    ) {
      return {
        hash: value.hash,
        label: value.label,
        reference: "reference" in value && typeof value.reference === "string" ? value.reference : undefined,
      };
    }
  } catch {
    // A malformed browser entry must never prevent the page from loading.
  }

  return null;
}

export function savePendingGenLayerWrite(
  storageKey: string,
  value: PendingGenLayerWrite,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

export function clearPendingGenLayerWrite(storageKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
}
