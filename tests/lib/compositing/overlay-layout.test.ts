import { describe, it, expect } from "vitest";
import { resolveOverlayDraws, type TextOverlay } from "../../../src/lib/compositing/overlay-layout";

const overlays: TextOverlay[] = [
  { key: "joinYear", label: "Năm gia nhập", labelEn: "Join year", type: "select", options: ["2020", "2021"], x: 50, y: 80, fontSize: 24, color: "#ffffff" },
  { key: "slogan", label: "Khẩu hiệu", labelEn: "Slogan", type: "text", x: 10, y: 90, fontSize: 16, color: "#000000" },
];

describe("resolveOverlayDraws", () => {
  it("converts percentage coordinates to pixels for a 1000x800 canvas", () => {
    const draws = resolveOverlayDraws(overlays, { joinYear: "2021" }, 1000, 800);
    expect(draws).toEqual([{ text: "2021", x: 500, y: 640, fontSize: 24, color: "#ffffff" }]);
  });

  it("skips overlays with no submitted value", () => {
    const draws = resolveOverlayDraws(overlays, {}, 1000, 800);
    expect(draws).toHaveLength(0);
  });

  it("includes multiple overlays that both have values", () => {
    const draws = resolveOverlayDraws(overlays, { joinYear: "2020", slogan: "Dream Big" }, 1000, 800);
    expect(draws.map(d => d.text)).toEqual(["2020", "Dream Big"]);
  });
});
