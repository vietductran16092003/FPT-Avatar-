export interface TextOverlay {
  key: string;
  label: string;
  labelEn: string;
  type: "select" | "text" | "yearsSince";
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

// FPT's founding-anniversary phrasing: a join year of the current year (or
// next) still counts as year 1 — never "0 years" — so tenure is floored at 1
// rather than computed as an inclusive year count.
function formatYearsSince(joinYear: string, lang: "vi" | "en"): string {
  const years = Math.max(1, new Date().getFullYear() - Number(joinYear));
  if (lang === "en") {
    return years === 1 ? "1 YEAR WITH FPT" : `${years} YEARS WITH FPT`;
  }
  return `${years} NĂM LÀM FPT`;
}

export function resolveOverlayDraws(
  overlays: TextOverlay[],
  values: Record<string, string>,
  width: number,
  height: number,
  lang: "vi" | "en" = "vi",
): ResolvedDraw[] {
  return overlays
    .filter(o => values[o.key])
    .map(o => ({
      text: o.type === "yearsSince" ? formatYearsSince(values[o.key], lang) : values[o.key],
      x: (o.x / 100) * width,
      y: (o.y / 100) * height,
      fontSize: o.fontSize,
      color: o.color,
    }));
}
