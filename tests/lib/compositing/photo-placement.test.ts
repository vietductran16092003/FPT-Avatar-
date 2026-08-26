import { describe, it, expect } from "vitest";
import { resolvePhotoPlacement, clampTransform, MIN_ZOOM, MAX_ZOOM, MAX_PAN } from "../../../src/lib/compositing/photo-placement";

describe("resolvePhotoPlacement", () => {
  it("cover-fits a square photo into a square photoArea box at identity transform", () => {
    const placement = resolvePhotoPlacement({ x: 0, y: 0, w: 50, h: 50 }, 100, 100, 200, 200);
    expect(placement).toEqual({ px: 0, py: 0, pw: 100, ph: 100, dx: 0, dy: 0, drawW: 100, drawH: 100 });
  });

  it("cover-fits a non-square photo, cropping the taller/wider dimension", () => {
    // Box is 100x100; photo is 200x100 (2:1) — cover-fit scales by the box's
    // shorter-relative dimension (height: 100/100=1) so width overflows and
    // gets centered/cropped, matching object-fit: cover.
    const placement = resolvePhotoPlacement({ x: 0, y: 0, w: 50, h: 50 }, 200, 100, 200, 200);
    expect(placement.drawW).toBe(200);
    expect(placement.drawH).toBe(100);
    expect(placement.dx).toBe(0 + (100 - 200) / 2);
  });

  it("zooms around the photoArea center when scale > 1, with identity pan", () => {
    const placement = resolvePhotoPlacement({ x: 0, y: 0, w: 50, h: 50 }, 100, 100, 200, 200, { scale: 2, ox: 0, oy: 0 });
    expect(placement.drawW).toBe(200);
    expect(placement.drawH).toBe(200);
    expect(placement.dx).toBe(-50);
    expect(placement.dy).toBe(-50);
  });

  it("pans by ox/oy as a fraction of the photoArea box size", () => {
    const placement = resolvePhotoPlacement({ x: 0, y: 0, w: 50, h: 50 }, 100, 100, 200, 200, { scale: 1, ox: 0.1, oy: -0.2 });
    expect(placement.dx).toBe(10);
    expect(placement.dy).toBe(-20);
  });

  it("scales photoArea percentages by the given canvas size, independent of resolution", () => {
    const small = resolvePhotoPlacement({ x: 10, y: 10, w: 50, h: 50 }, 100, 100, 200, 200);
    const large = resolvePhotoPlacement({ x: 10, y: 10, w: 50, h: 50 }, 500, 500, 1000, 1000);
    // Same percentages at 5x the resolution and a 5x-larger (proportional) photo
    // must resolve to a placement that is exactly 5x every small-canvas value.
    expect(large).toEqual({
      px: small.px * 5, py: small.py * 5, pw: small.pw * 5, ph: small.ph * 5,
      dx: small.dx * 5, dy: small.dy * 5, drawW: small.drawW * 5, drawH: small.drawH * 5,
    });
  });
});

describe("clampTransform", () => {
  it("passes through values already within bounds", () => {
    expect(clampTransform({ scale: 1.5, ox: 0.1, oy: -0.1 })).toEqual({ scale: 1.5, ox: 0.1, oy: -0.1 });
  });

  it("clamps scale to [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(clampTransform({ scale: 0.2, ox: 0, oy: 0 }).scale).toBe(MIN_ZOOM);
    expect(clampTransform({ scale: 99, ox: 0, oy: 0 }).scale).toBe(MAX_ZOOM);
  });

  it("clamps ox/oy to [-MAX_PAN, MAX_PAN]", () => {
    expect(clampTransform({ scale: 1, ox: -5, oy: 5 })).toEqual({ scale: 1, ox: -MAX_PAN, oy: MAX_PAN });
  });

  it("falls back to identity components for non-finite input (NaN/Infinity)", () => {
    expect(clampTransform({ scale: NaN, ox: Infinity, oy: -Infinity })).toEqual({ scale: 1, ox: 0, oy: 0 });
  });
});
