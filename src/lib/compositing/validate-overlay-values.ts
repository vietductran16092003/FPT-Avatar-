import type { TextOverlay } from "./overlay-layout";

export function validateOverlayValues(
  overlays: TextOverlay[],
  values: Record<string, string>,
): { valid: boolean; error?: string } {
  const knownKeys = new Set(overlays.map(o => o.key));

  for (const key of Object.keys(values)) {
    if (!knownKeys.has(key)) {
      return { valid: false, error: `Unknown overlay key: ${key}` };
    }
  }

  for (const overlay of overlays) {
    if ((overlay.type === "select" || overlay.type === "yearsSince") && values[overlay.key] !== undefined) {
      if (!overlay.options?.includes(values[overlay.key])) {
        return { valid: false, error: `Invalid value for select overlay "${overlay.key}"` };
      }
    }
  }

  return { valid: true };
}
