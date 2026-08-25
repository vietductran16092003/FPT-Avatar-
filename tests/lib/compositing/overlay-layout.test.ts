import { describe, it, expect } from "vitest";
import { resolveOverlayDraws, type TextOverlay } from "../../../src/lib/compositing/overlay-layout";

const overlays: TextOverlay[] = [
  { key: "joinYear", label: "Năm gia nhập", labelEn: "Join year", type: "select", options: ["2020", "2021"], x: 50, y: 80, fontSize: 24, color: "#ffffff" },
  { key: "slogan", label: "Khẩu hiệu", labelEn: "Slogan", type: "text", x: 10, y: 90, fontSize: 16, color: "#000000" },
];

describe("resolveOverlayDraws", () => {
  it("converts percentage coordinates to pixels for a 1000x800 canvas", () => {
    const draws = resolveOverlayDraws(overlays, { joinYear: "2021" }, 1000, 800);
    expect(draws).toEqual([{ text: "2021", x: 500, y: 640, fontSize: 24, color: "#ffffff", rotation: 0 }]);
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

describe("resolveOverlayDraws — yearsSince", () => {
  const yearsSinceOverlay: TextOverlay = {
    key: "joinYear",
    label: "NĂM GIA NHẬP FPT",
    labelEn: "YEAR YOU JOINED FPT",
    type: "yearsSince",
    options: ["1988", "2025", "2026"],
    x: 50,
    y: 85,
    fontSize: 24,
    color: "#ffffff",
  };
  const currentYear = new Date().getFullYear();

  it("computes tenure as currentYear - joinYear, floored at 1 (VI, plural-invariant)", () => {
    const draws = resolveOverlayDraws([yearsSinceOverlay], { joinYear: "1988" }, 1000, 800, "vi");
    expect(draws[0].text).toBe(`${currentYear - 1988} NĂM LÀM FPT`);
  });

  it("floors a same-year or future join year at 1, never 0 (VI)", () => {
    const draws = resolveOverlayDraws([yearsSinceOverlay], { joinYear: String(currentYear) }, 1000, 800, "vi");
    expect(draws[0].text).toBe("1 NĂM LÀM FPT");
  });

  it("uses singular 'YEAR' (no S) for exactly 1 year (EN)", () => {
    const draws = resolveOverlayDraws([yearsSinceOverlay], { joinYear: String(currentYear - 1) }, 1000, 800, "en");
    expect(draws[0].text).toBe("1 YEAR WITH FPT");
  });

  it("uses plural 'YEARS' for more than 1 year (EN)", () => {
    const draws = resolveOverlayDraws([yearsSinceOverlay], { joinYear: "1988" }, 1000, 800, "en");
    expect(draws[0].text).toBe(`${currentYear - 1988} YEARS WITH FPT`);
  });

  it("defaults to vi when lang is omitted", () => {
    const draws = resolveOverlayDraws([yearsSinceOverlay], { joinYear: "1988" }, 1000, 800);
    expect(draws[0].text).toBe(`${currentYear - 1988} NĂM LÀM FPT`);
  });
});
