export interface DisplayConfigLike {
  title?: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  ctaLabel?: string;
  ctaEn?: string;
  badge?: string;
}

type LocalizableField = "title" | "description" | "ctaLabel";

function enKeyFor(field: LocalizableField): keyof DisplayConfigLike {
  if (field === "ctaLabel") return "ctaEn";
  return `${field}En` as keyof DisplayConfigLike;
}

export function pickLocalized(
  displayConfig: DisplayConfigLike | null | undefined,
  field: LocalizableField,
  lang: "vi" | "en",
): string {
  if (!displayConfig) return "";
  if (lang === "en") {
    const enValue = displayConfig[enKeyFor(field)];
    if (enValue) return enValue;
  }
  return displayConfig[field] ?? "";
}
