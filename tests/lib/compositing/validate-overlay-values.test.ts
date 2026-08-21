import { describe, it, expect } from "vitest";
import { validateOverlayValues } from "../../../src/lib/compositing/validate-overlay-values";
import type { TextOverlay } from "../../../src/lib/compositing/overlay-layout";

const overlays: TextOverlay[] = [
  { key: "joinYear", label: "Năm gia nhập", labelEn: "Join year", type: "select", options: ["2020", "2021"], x: 50, y: 80, fontSize: 24, color: "#fff" },
  { key: "slogan", label: "Khẩu hiệu", labelEn: "Slogan", type: "text", x: 10, y: 90, fontSize: 16, color: "#000" },
];

describe("validateOverlayValues", () => {
  it("accepts values whose keys are all declared on the template", () => {
    expect(validateOverlayValues(overlays, { joinYear: "2021" })).toEqual({ valid: true });
  });

  it("rejects an unknown key not declared on the template", () => {
    const result = validateOverlayValues(overlays, { unknownKey: "x" });
    expect(result.valid).toBe(false);
  });

  it("rejects a select overlay value not in its own options", () => {
    const result = validateOverlayValues(overlays, { joinYear: "1999" });
    expect(result.valid).toBe(false);
  });

  it("accepts any string for a free-text overlay", () => {
    expect(validateOverlayValues(overlays, { slogan: "Dream Big, Move Fast" })).toEqual({ valid: true });
  });
});
