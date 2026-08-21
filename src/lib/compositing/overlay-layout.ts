export interface TextOverlay {
  key: string;
  label: string;
  labelEn: string;
  type: "select" | "text";
  options?: string[];
  placeholder?: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export interface ResolvedDraw {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export function resolveOverlayDraws(
  overlays: TextOverlay[],
  values: Record<string, string>,
  width: number,
  height: number,
): ResolvedDraw[] {
  return overlays
    .filter(o => values[o.key])
    .map(o => ({
      text: values[o.key],
      x: (o.x / 100) * width,
      y: (o.y / 100) * height,
      fontSize: o.fontSize,
      color: o.color,
    }));
}
