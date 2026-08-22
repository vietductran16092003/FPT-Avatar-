export interface ComponentPreset {
  key: string;
  type: "select" | "text";
  label: string;
  labelEn: string;
  options?: string[];
  placeholder?: string;
}

function joinYearOptions(): string[] {
  const currentYear = new Date().getFullYear();
  const years: string[] = [];
  for (let year = currentYear; year >= 1988; year--) years.push(String(year));
  return years;
}

export const COMPONENT_PRESETS: ComponentPreset[] = [
  {
    key: "joinYear",
    type: "select",
    label: "NÄƒm gia nháº­p FPT",
    labelEn: "Year joined FPT",
    options: joinYearOptions(),
  },
  {
    key: "unit",
    type: "select",
    label: "ÄÆ¡n vá»‹ cÃ´ng tÃ¡c",
    labelEn: "Business unit",
    options: ["FPT Software", "FPT Telecom", "FPT IS", "FPT Education", "FPT Retail", "KhÃ¡c"],
  },
  {
    key: "slogan",
    type: "text",
    label: "CÃ¢u chÃ¢m ngÃ´n",
    labelEn: "Personal slogan",
    placeholder: "VD: Dream Big, Move Fast",
  },
  {
    key: "signature",
    type: "text",
    label: "Chá»¯ kÃ½ / TÃªn hiá»ƒn thá»‹",
    labelEn: "Display name / signature",
    placeholder: "VD: Nguyá»…n VÄƒn A",
  },
];
