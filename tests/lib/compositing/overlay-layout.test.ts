import { describe, it, expect } from "vitest";
import { resolveOverlayDraws, type TextOverlay, type ResolvedDraw, type MeasureChar } from "../../../src/lib/compositing/overlay-layout";

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

describe("resolveOverlayDraws — curved text", () => {
  const baseCurve = { centerX: 50, centerY: 50, radius: 10, angle: 0, direction: "cw" as const };
  const overlay: TextOverlay = {
    key: "ribbon",
    label: "Ribbon",
    labelEn: "Ribbon",
    type: "text",
    x: 50,
    y: 50,
    fontSize: 20,
    color: "#fff",
    curve: baseCurve,
  };
  // Every character is 50px wide regardless of font size — isolates the
  // arc-layout math from real font metrics.
  const fixedWidthMeasure: MeasureChar = () => 50;

  it("returns one draw per character instead of one draw for the whole string", () => {
    const draws = resolveOverlayDraws([overlay], { ribbon: "AB" }, 1000, 1000, "vi", fixedWidthMeasure);
    expect(draws).toHaveLength(2);
    expect(draws.map(d => d.text)).toEqual(["A", "B"]);
  });

  it("places every character exactly `radius` pixels from the curve's center", () => {
    const draws = resolveOverlayDraws([overlay], { ribbon: "AVATAR" }, 1000, 1000, "vi", fixedWidthMeasure);
    const centerX = 500;
    const centerY = 500;
    const radiusPx = 100;
    for (const d of draws) {
      expect(Math.hypot(d.x - centerX, d.y - centerY)).toBeCloseTo(radiusPx, 5);
    }
  });

  it("centers the text symmetrically on curve.angle when all characters share the same width", () => {
    const draws = resolveOverlayDraws([overlay], { ribbon: "AB" }, 1000, 1000, "vi", fixedWidthMeasure);
    const angleOf = (d: ResolvedDraw) => (Math.atan2(d.y - 500, d.x - 500) * 180) / Math.PI;
    const midpoint = (angleOf(draws[0]) + angleOf(draws[1])) / 2;
    expect(midpoint).toBeCloseTo(baseCurve.angle, 5);
  });

  it("orders characters clockwise (increasing angle) when direction is 'cw'", () => {
    const draws = resolveOverlayDraws([overlay], { ribbon: "AB" }, 1000, 1000, "vi", fixedWidthMeasure);
    const angleOf = (d: ResolvedDraw) => Math.atan2(d.y - 500, d.x - 500);
    expect(angleOf(draws[1])).toBeGreaterThan(angleOf(draws[0]));
  });

  it("orders characters counter-clockwise (decreasing angle) when direction is 'ccw'", () => {
    const ccwOverlay: TextOverlay = { ...overlay, curve: { ...baseCurve, direction: "ccw" } };
    const draws = resolveOverlayDraws([ccwOverlay], { ribbon: "AB" }, 1000, 1000, "vi", fixedWidthMeasure);
    const angleOf = (d: ResolvedDraw) => Math.atan2(d.y - 500, d.x - 500);
    expect(angleOf(draws[1])).toBeLessThan(angleOf(draws[0]));
  });

  it("rotates each character tangent to the circle, flipped 180° for 'ccw' so text isn't upside down", () => {
    const cwDraws = resolveOverlayDraws([overlay], { ribbon: "A" }, 1000, 1000, "vi", fixedWidthMeasure);
    const ccwOverlay: TextOverlay = { ...overlay, curve: { ...baseCurve, direction: "ccw" } };
    const ccwDraws = resolveOverlayDraws([ccwOverlay], { ribbon: "A" }, 1000, 1000, "vi", fixedWidthMeasure);
    expect(Math.abs(cwDraws[0].rotation - ccwDraws[0].rotation)).toBeCloseTo(180, 5);
  });

  it("scales the radius from frame width even on a non-square frame, so the arc stays a true circle", () => {
    const draws = resolveOverlayDraws([overlay], { ribbon: "AVATAR" }, 1000, 400, "vi", fixedWidthMeasure);
    const centerX = 500;
    const centerY = 200; // 50% of height=400, NOT width
    const radiusPx = 100; // 10% of width=1000
    for (const d of draws) {
      expect(Math.hypot(d.x - centerX, d.y - centerY)).toBeCloseTo(radiusPx, 5);
    }
  });

  it("falls back to an approximate fontSize-based char width when no measureChar is passed", () => {
    const draws = resolveOverlayDraws([overlay], { ribbon: "AB" }, 1000, 1000);
    expect(draws).toHaveLength(2);
    expect(Number.isFinite(draws[0].x)).toBe(true);
    expect(Number.isFinite(draws[0].rotation)).toBe(true);
  });

  it("leaves non-curved overlays completely unaffected by the measureChar parameter", () => {
    const straight: TextOverlay = { key: "slogan", label: "S", labelEn: "S", type: "text", x: 10, y: 90, fontSize: 16, color: "#000" };
    const draws = resolveOverlayDraws([straight], { slogan: "Dream Big" }, 1000, 800, "vi", fixedWidthMeasure);
    expect(draws).toEqual([{ text: "Dream Big", x: 100, y: 720, fontSize: 16, color: "#000", rotation: 0 }]);
  });
});
