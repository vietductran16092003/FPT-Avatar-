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
    label: "Năm gia nhập FPT",
    labelEn: "Year joined FPT",
    options: joinYearOptions(),
  },
  {
    key: "unit",
    type: "select",
    label: "Đơn vị công tác",
    labelEn: "Business unit",
    options: ["FPT Software", "FPT Telecom", "FPT IS", "FPT Education", "FPT Retail", "Khác"],
  },
  {
    key: "slogan",
    type: "text",
    label: "Câu châm ngôn",
    labelEn: "Personal slogan",
    placeholder: "VD: Dream Big, Move Fast",
  },
  {
    key: "signature",
    type: "text",
    label: "Chữ ký / Tên hiển thị",
    labelEn: "Display name / signature",
    placeholder: "VD: Nguyễn Văn A",
  },
];
