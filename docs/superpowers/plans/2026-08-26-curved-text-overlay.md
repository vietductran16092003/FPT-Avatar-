# Curved Text Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins mark any template text overlay as "curved" so the resolved text (e.g. "N NĂM LÀM FPT") is drawn character-by-character along a circular arc — matching the ribbon shape in the client's reference image — instead of only as a straight, optionally-rotated line.

**Architecture:** One pure function (`resolveOverlayDraws` in `overlay-layout.ts`) already converts a `TextOverlay[]` + submitted values into a flat `ResolvedDraw[]` (one draw = one thing to paint) consumed identically by the client preview (Fabric.js) and the server download (node-canvas). We extend that function so a `curve`-tagged overlay expands into **N single-character `ResolvedDraw`s positioned along an arc** instead of one whole-string draw. Because both renderers already loop over `ResolvedDraw[]` and paint each entry the same way regardless of string length, **neither renderer's drawing loop needs to change** — only the two call sites need to pass in a `measureChar` function (each using its own canvas context, since glyph widths differ between the browser and node-canvas). A new admin-only `CurveTextPicker` component (mirroring the existing `PhotoAreaPicker` drag pattern) lets admins set the arc's center/radius/angle/direction visually.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Vitest + Testing Library (jsdom, backed by the real `canvas` npm package so `HTMLCanvasElement.getContext("2d")` works in tests), Fabric.js (client canvas), node-canvas (server canvas).

**Spec:** `docs/superpowers/specs/2026-08-26-curved-text-overlay-design.md`

## Global Constraints

- `curve` is optional on `TextOverlay` — every existing overlay (no `curve`) must render byte-for-byte identical to today. No migration, no schema change (still inside the `Template.overlayConfig` Json column).
- `radius` is a percentage of **frame width**; `centerX` is % of width, `centerY` is % of height — matching the existing `x`/`y` convention on `TextOverlay`. The circle stays a true circle in pixel space (not an ellipse) even when the frame isn't square, because both the horizontal and vertical offset from center reuse the same width-derived `radiusPx`.
- Character widths for arc-length math are measured by a `measureChar(char, fontSize) => number` function supplied by each caller (client canvas 2d context vs. server node-canvas context) — `overlay-layout.ts` never guesses a width itself, per the spec's "no approximation" requirement. A default approximation (`fontSize * 0.6`) exists only as a safety net for callers that omit it.
- Admin configures the curve visually (drag two handles on the frame image), not via raw number inputs — see spec "Admin UI — CurveTextPicker".
- Direction (`"cw" | "ccw"`) is an explicit admin choice, not inferred from position.

---

### Task 1: Curved draw math in `overlay-layout.ts`

**Files:**
- Modify: `src/lib/compositing/overlay-layout.ts` (whole file, currently 57 lines)
- Test: `tests/lib/compositing/overlay-layout.test.ts`

**Interfaces:**
- Consumes: nothing new (pure math, no dependencies beyond `Math`).
- Produces:
  - `export interface OverlayCurve { centerX: number; centerY: number; radius: number; angle: number; direction: "cw" | "ccw"; }`
  - `TextOverlay.curve?: OverlayCurve` (new optional field on the existing interface)
  - `export type MeasureChar = (char: string, fontSize: number) => number;`
  - `resolveOverlayDraws(overlays: TextOverlay[], values: Record<string,string>, width: number, height: number, lang?: "vi"|"en", measureChar?: MeasureChar): ResolvedDraw[]` — signature gains a 6th optional parameter; all 5 existing call sites keep compiling unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/compositing/overlay-layout.test.ts` (keep every existing `describe` block above untouched):

```ts
import type { ResolvedDraw, MeasureChar } from "../../../src/lib/compositing/overlay-layout";

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/compositing/overlay-layout.test.ts`
Expected: FAIL — `TextOverlay` has no `curve` property (TS error) and/or `resolveOverlayDraws` does not accept a 6th argument / does not expand characters.

- [ ] **Step 3: Implement**

Replace the full contents of `src/lib/compositing/overlay-layout.ts` with:

```ts
export interface OverlayCurve {
  centerX: number; // % of frame width — arc center
  centerY: number; // % of frame height — arc center
  radius: number;  // % of frame width — arc radius (kept width-based so the
                    // arc stays a true circle even on a non-square frame)
  angle: number;   // degrees, math convention (0=right, -90=up) — angle of
                    // the MIDPOINT of the resolved text along the arc
  direction: "cw" | "ccw"; // reading direction along the arc
}

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
  // Clockwise degrees around (x,y), for ribbon-style diagonal banners baked
  // into a frame's artwork (e.g. Frame 29's "N NĂM LÀM FPT" ribbon). Omitted
  // or 0 draws upright, matching every overlay before this field existed.
  rotation?: number;
  // Optional: draw the resolved text one character at a time along a
  // circular arc instead of as a single straight/rotated string. When set,
  // x/y/rotation above are ignored for this overlay (kept in the data,
  // just unused for drawing).
  curve?: OverlayCurve;
}

export interface ResolvedDraw {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  rotation: number;
}

// Measures a single character's rendered width in px at a given font size.
// Text-rendering differs between the browser's canvas (client preview) and
// node-canvas (server download), so overlay-layout.ts never guesses this
// itself — each caller measures with its own canvas 2d context so curved
// text lines up the same way in both places.
export type MeasureChar = (char: string, fontSize: number) => number;

// Safety-net default for callers that don't care about curved overlays (or
// haven't wired a real measurer yet) — a rough monospace approximation.
const DEFAULT_MEASURE_CHAR: MeasureChar = (_char, fontSize) => fontSize * 0.6;

// FPT's founding-anniversary phrasing: a join year of the current year (or
// next) still counts as year 1 — never "0 years" — so tenure is floored at 1
// rather than computed as an inclusive year count.
function formatYearsSince(joinYear: string, lang: "vi" | "en"): string {
  const num = Number(joinYear);
  const years = Number.isFinite(num) ? Math.max(1, new Date().getFullYear() - num) : 1;
  if (lang === "en") {
    return years === 1 ? "1 YEAR WITH FPT" : `${years} YEARS WITH FPT`;
  }
  return `${years} NĂM LÀM FPT`;
}

// Lays `text` out one character at a time along a circular arc: each
// character becomes its own ResolvedDraw, spaced by its measured width so
// letters don't overlap or gap unevenly, centered on curve.angle, and
// rotated to stay tangent to the circle (upright, facing outward).
function resolveCurvedDraws(
  text: string,
  curve: OverlayCurve,
  fontSize: number,
  color: string,
  width: number,
  height: number,
  measureChar: MeasureChar,
): ResolvedDraw[] {
  const centerX = (curve.centerX / 100) * width;
  const centerY = (curve.centerY / 100) * height;
  const radiusPx = (curve.radius / 100) * width;
  const chars = Array.from(text);

  const charAngles = chars.map(ch => {
    const widthPx = measureChar(ch, fontSize);
    return radiusPx > 0 ? (widthPx / radiusPx) * (180 / Math.PI) : 0;
  });
  const totalAngle = charAngles.reduce((sum, a) => sum + a, 0);
  const sign = curve.direction === "cw" ? 1 : -1;

  let cursor = curve.angle - sign * (totalAngle / 2);
  const draws: ResolvedDraw[] = [];
  for (let i = 0; i < chars.length; i++) {
    const half = charAngles[i] / 2;
    const angleDeg = cursor + sign * half;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = centerX + radiusPx * Math.cos(angleRad);
    const y = centerY + radiusPx * Math.sin(angleRad);
    const rotation = angleDeg + 90 + (curve.direction === "ccw" ? 180 : 0);
    draws.push({ text: chars[i], x, y, fontSize, color, rotation });
    cursor += sign * charAngles[i];
  }
  return draws;
}

export function resolveOverlayDraws(
  overlays: TextOverlay[],
  values: Record<string, string>,
  width: number,
  height: number,
  lang: "vi" | "en" = "vi",
  measureChar: MeasureChar = DEFAULT_MEASURE_CHAR,
): ResolvedDraw[] {
  return overlays
    .filter(o => values[o.key])
    .flatMap((o): ResolvedDraw[] => {
      const text = o.type === "yearsSince" ? formatYearsSince(values[o.key], lang) : values[o.key];
      if (o.curve) {
        return resolveCurvedDraws(text, o.curve, o.fontSize, o.color, width, height, measureChar);
      }
      return [
        {
          text,
          x: (o.x / 100) * width,
          y: (o.y / 100) * height,
          fontSize: o.fontSize,
          color: o.color,
          rotation: o.rotation ?? 0,
        },
      ];
    });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/compositing/overlay-layout.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Type-check and run the full unit suite to confirm no regression in other consumers**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: no new TypeScript errors from this file; all pre-existing tests still pass (the two pre-existing `avatar-creator.tsx` TS errors mentioned in project history are unrelated to this file and may still be present — do not fix them as part of this task).

- [ ] **Step 6: Commit**

```bash
git add src/lib/compositing/overlay-layout.ts tests/lib/compositing/overlay-layout.test.ts
git commit -m "feat: add curved text layout to resolveOverlayDraws"
```

---

### Task 2: Wire curved measurement into the server download (`server-compositor.ts`)

**Files:**
- Modify: `src/lib/server/compositing/server-compositor.ts:1-54`
- Test: `tests/lib/compositing/server-compositor.test.ts`

**Interfaces:**
- Consumes: `resolveOverlayDraws(..., measureChar?)` and `type MeasureChar` from Task 1 (`src/lib/compositing/overlay-layout.ts`).
- Produces: none new — `compositeAvatar`'s existing exported signature is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/compositing/server-compositor.test.ts` (inside the existing `describe("compositeAvatar", ...)` block, after the last `it`):

```ts
  it("renders a curved overlay one character at a time without throwing, honoring the curve config", async () => {
    const frame = solidPng(200, 200, "rgba(0,0,0,0)");
    const photo = solidPng(50, 50, "#0000ff");

    const result = await compositeAvatar(
      frame, photo, { x: 0, y: 0, w: 50, h: 50 },
      [
        {
          key: "ribbon",
          label: "R",
          labelEn: "R",
          type: "text",
          x: 50,
          y: 50,
          fontSize: 20,
          color: "#ffffff",
          curve: { centerX: 50, centerY: 50, radius: 30, angle: -90, direction: "cw" },
        },
      ],
      { ribbon: "FPT 38" },
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    const decoded = await loadImage(result);
    expect(decoded.width).toBe(200);
    expect(decoded.height).toBe(200);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/compositing/server-compositor.test.ts`
Expected: FAIL — TypeScript error, `curve` is not assignable (until Task 1 lands) or, if Task 1 is already merged, the test still passes trivially today because `resolveOverlayDraws` silently ignores `curve` without a real `measureChar` wired in `compositeAvatar` — confirm by temporarily checking the rendered buffer differs from a straight-text render, OR simply proceed (this test is primarily a non-throwing smoke test; its main purpose is to fail loudly if the wiring in Step 3 is missing a required import). If it already passes before Step 3, that's expected — the real regression guard is Step 4's full-suite run after wiring.

- [ ] **Step 3: Implement**

In `src/lib/server/compositing/server-compositor.ts`, update the import and the draws line:

```ts
import { createCanvas, loadImage } from "canvas";
import { resolveOverlayDraws, type TextOverlay, type MeasureChar } from "@/lib/compositing/overlay-layout";
import { resolvePhotoPlacement, IDENTITY_TRANSFORM, type PhotoTransform } from "@/lib/compositing/photo-placement";
```

Then, inside `compositeAvatar`, replace:

```ts
  const draws = resolveOverlayDraws(overlays, overlayValues, frame.width, frame.height, lang);
```

with:

```ts
  // node-canvas's own text metrics — measured here rather than approximated,
  // so curved overlays lay out characters using this environment's real
  // glyph widths (see overlay-layout.ts's MeasureChar contract).
  const measureChar: MeasureChar = (char, fontSize) => {
    ctx.font = `${fontSize}px sans-serif`;
    return ctx.measureText(char).width;
  };
  const draws = resolveOverlayDraws(overlays, overlayValues, frame.width, frame.height, lang, measureChar);
```

Leave the `for (const draw of draws) { ... }` loop immediately below completely unchanged — it already paints one `ResolvedDraw` at a time regardless of whether `draw.text` is a whole string or a single character.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/compositing/server-compositor.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/compositing/server-compositor.ts tests/lib/compositing/server-compositor.test.ts
git commit -m "feat: measure curved overlay text with node-canvas in server-compositor"
```

---

### Task 3: Wire curved measurement into the client preview (`avatar-creator.tsx`)

**Files:**
- Modify: `src/app/(public)/c/[slug]/avatar-creator.tsx:1-11` (imports) and `:195-198` (the overlay-resolving effect)
- Test: `tests/app/avatar-creator.test.tsx`

**Interfaces:**
- Consumes: `resolveOverlayDraws(..., measureChar?)` and `type MeasureChar` from Task 1. Also confirms `useAvatarCanvas`'s existing `setOverlays(draws: ResolvedDraw[])` (from `use-avatar-canvas.ts`, unmodified) needs no change, since it already renders one `FabricText` per `ResolvedDraw` regardless of string length.
- Produces: none new.

- [ ] **Step 1: Write the failing test**

Append to `tests/app/avatar-creator.test.tsx`, inside the `describe("AvatarCreator", ...)` block, after the last `it`:

```ts
  it("renders without crashing when a template overlay uses a curved layout", async () => {
    const curvedTemplate: Template = {
      id: "t3",
      name: "Khung cong",
      frameImageUrl: "http://storage/frames/curved.png",
      overlayConfig: {
        photoArea: { x: 10, y: 10, w: 60, h: 60 },
        textOverlays: [
          {
            key: "ribbon",
            label: "Ruy băng",
            labelEn: "Ribbon",
            type: "text",
            x: 50,
            y: 50,
            fontSize: 20,
            color: "#fff",
            curve: { centerX: 50, centerY: 20, radius: 35, angle: -90, direction: "cw" },
          },
        ],
      },
    };
    renderCreator([curvedTemplate]);

    await userEvent.type(screen.getByLabelText("Ruy băng"), "FPT 38");

    expect(screen.getByLabelText("Ruy băng")).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/app/avatar-creator.test.tsx`
Expected: FAIL — TypeScript error on the `curve` field until Task 1 is merged; if Task 1 is already merged, this test may already pass (it's a smoke test) — that's fine, proceed to Step 3 to add the real client-side measurement wiring, then re-run in Step 4 to confirm nothing broke.

- [ ] **Step 3: Implement**

In `src/app/(public)/c/[slug]/avatar-creator.tsx`, update the import line:

```ts
import { resolveOverlayDraws, type TextOverlay, type MeasureChar } from "@/lib/compositing/overlay-layout";
```

Add this helper near the top of the file, after the existing imports and before `MAX_PHOTO_BYTES`:

```ts
// Lazily-created, reused canvas 2d context for measuring curved-overlay
// character widths in the browser — mirrors server-compositor.ts's use of
// node-canvas's ctx.measureText, so client preview and server download lay
// out curved text the same way (each side measures with its own engine
// rather than sharing a guessed width).
let measureCanvasCtx: CanvasRenderingContext2D | null | undefined;
const measureCharWithCanvas: MeasureChar = (char, fontSize) => {
  if (measureCanvasCtx === undefined) {
    measureCanvasCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCanvasCtx) return fontSize * 0.6;
  measureCanvasCtx.font = `${fontSize}px sans-serif`;
  return measureCanvasCtx.measureText(char).width;
};
```

Then replace the overlay-resolving effect:

```ts
  useEffect(() => {
    const draws = resolveOverlayDraws(selected.overlayConfig.textOverlays, overlayValues, CANVAS_SIZE, CANVAS_SIZE, lang);
    setOverlays(draws);
  }, [selected, overlayValues, lang, setOverlays]);
```

with:

```ts
  useEffect(() => {
    const draws = resolveOverlayDraws(selected.overlayConfig.textOverlays, overlayValues, CANVAS_SIZE, CANVAS_SIZE, lang, measureCharWithCanvas);
    setOverlays(draws);
  }, [selected, overlayValues, lang, setOverlays]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/avatar-creator.test.tsx`
Expected: PASS (all tests, old and new — the pre-existing tests must still pass unchanged since non-curved overlays render identically).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/c/[slug]/avatar-creator.tsx" tests/app/avatar-creator.test.tsx
git commit -m "feat: measure curved overlay text with the browser canvas in avatar-creator preview"
```

---

### Task 4: `CurveTextPicker` admin component

**Files:**
- Create: `src/app/admin/campaigns/curve-text-picker.tsx`
- Test: `tests/app/admin/curve-text-picker.test.tsx`

**Interfaces:**
- Consumes: `type OverlayCurve` from `src/lib/compositing/overlay-layout.ts` (Task 1).
- Produces: `export function CurveTextPicker({ imageUrl, value, onChange }: { imageUrl: string | null; value: OverlayCurve; onChange: (next: OverlayCurve) => void })` — a standalone component with no dependency on `template-form.tsx`, so it can be tested in isolation.

- [ ] **Step 1: Write the failing test**

Create `tests/app/admin/curve-text-picker.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CurveTextPicker } from "../../../src/app/admin/campaigns/curve-text-picker";

afterEach(() => cleanup());

function stubRect(el: Element, width: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => {},
  });
}

describe("CurveTextPicker", () => {
  it("shows a hint instead of an image when no frame image is available yet", () => {
    render(<CurveTextPicker imageUrl={null} value={{ centerX: 50, centerY: 50, radius: 20, angle: -90, direction: "cw" }} onChange={() => {}} />);
    expect(screen.getByText("Tải ảnh khung lên để đặt đường cong chữ")).toBeTruthy();
  });

  it("positions the center and anchor handles per the current value", () => {
    render(<CurveTextPicker imageUrl="http://frame.png" value={{ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "cw" }} onChange={() => {}} />);
    const center = screen.getByTestId("curve-center-handle");
    expect(center.style.left).toBe("50%");
    expect(center.style.top).toBe("50%");
    const anchor = screen.getByTestId("curve-anchor-handle");
    expect(anchor.style.left).toBe("70%"); // centerX + radius*cos(0deg) = 50+20
    expect(anchor.style.top).toBe("50%");  // centerY + radius*sin(0deg) = 50+0
  });

  it("dragging the center handle updates centerX/centerY without changing radius/angle", () => {
    const onChange = vi.fn();
    render(<CurveTextPicker imageUrl="http://frame.png" value={{ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "cw" }} onChange={onChange} />);
    const container = screen.getByTestId("curve-text-picker");
    stubRect(container, 200, 200);
    const center = screen.getByTestId("curve-center-handle");

    fireEvent.pointerDown(center, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 160, clientY: 40 });

    expect(onChange).toHaveBeenLastCalledWith({ centerX: 80, centerY: 20, radius: 20, angle: 0, direction: "cw" });
  });

  it("dragging the anchor handle recomputes radius/angle from the pointer position without changing centerX/centerY", () => {
    const onChange = vi.fn();
    render(<CurveTextPicker imageUrl="http://frame.png" value={{ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "cw" }} onChange={onChange} />);
    const container = screen.getByTestId("curve-text-picker");
    stubRect(container, 200, 200);
    const anchor = screen.getByTestId("curve-anchor-handle");

    fireEvent.pointerDown(anchor, { clientX: 140, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 50 });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.centerX).toBe(50);
    expect(lastCall.centerY).toBe(50);
    expect(lastCall.radius).toBeCloseTo(35.355, 2);
    expect(lastCall.angle).toBeCloseTo(-45, 2);
    expect(lastCall.direction).toBe("cw");
  });

  it("toggles direction between clockwise and counter-clockwise", () => {
    const onChange = vi.fn();
    render(<CurveTextPicker imageUrl="http://frame.png" value={{ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "cw" }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Thuận kim đồng hồ" }));

    expect(onChange).toHaveBeenLastCalledWith({ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "ccw" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/app/admin/curve-text-picker.test.tsx`
Expected: FAIL with "Cannot find module '../../../src/app/admin/campaigns/curve-text-picker'".

- [ ] **Step 3: Implement**

Create `src/app/admin/campaigns/curve-text-picker.tsx`:

```tsx
"use client";

import { useRef, useEffect } from "react";
import type { OverlayCurve } from "@/lib/compositing/overlay-layout";

export function CurveTextPicker({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string | null;
  value: OverlayCurve;
  onChange: (next: OverlayCurve) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeListeners = useRef<{ onMove: (e: PointerEvent) => void; onUp: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (activeListeners.current) {
        window.removeEventListener("pointermove", activeListeners.current.onMove);
        window.removeEventListener("pointerup", activeListeners.current.onUp);
      }
    };
  }, []);

  function startCenterDrag(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();

    function onMove(ev: PointerEvent) {
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const centerX = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const centerY = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      onChange({ ...value, centerX, centerY });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      activeListeners.current = null;
    }
    activeListeners.current = { onMove, onUp };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startAnchorDrag(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();

    function onMove(ev: PointerEvent) {
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const px = ((ev.clientX - rect.left) / rect.width) * 100;
      const py = ((ev.clientY - rect.top) / rect.height) * 100;
      const dx = px - value.centerX;
      const dy = py - value.centerY;
      const radius = Math.max(1, Math.hypot(dx, dy));
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      onChange({ ...value, radius, angle });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      activeListeners.current = null;
    }
    activeListeners.current = { onMove, onUp };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const angleRad = (value.angle * Math.PI) / 180;
  const anchorX = value.centerX + value.radius * Math.cos(angleRad);
  const anchorY = value.centerY + value.radius * Math.sin(angleRad);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        data-testid="curve-text-picker"
        className="relative aspect-square w-full max-w-xs overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(#eef1f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <p className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
            Tải ảnh khung lên để đặt đường cong chữ
          </p>
        )}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <circle
            cx={value.centerX}
            cy={value.centerY}
            r={value.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            strokeDasharray="2,2"
            vectorEffect="non-scaling-stroke"
            className="text-primary/60"
          />
          <line
            x1={value.centerX}
            y1={value.centerY}
            x2={anchorX}
            y2={anchorY}
            stroke="currentColor"
            strokeWidth={0.3}
            vectorEffect="non-scaling-stroke"
            className="text-primary/60"
          />
        </svg>
        <div
          data-testid="curve-center-handle"
          onPointerDown={startCenterDrag}
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-primary"
          style={{ left: `${value.centerX}%`, top: `${value.centerY}%` }}
        />
        <div
          data-testid="curve-anchor-handle"
          onPointerDown={startAnchorDrag}
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-move border-2 border-white bg-secondary"
          style={{ left: `${anchorX}%`, top: `${anchorY}%` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">Chiều đọc chữ:</span>
        <button
          type="button"
          onClick={() => onChange({ ...value, direction: value.direction === "cw" ? "ccw" : "cw" })}
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold"
        >
          {value.direction === "cw" ? "Thuận kim đồng hồ" : "Ngược kim đồng hồ"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/admin/curve-text-picker.test.tsx`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/campaigns/curve-text-picker.tsx tests/app/admin/curve-text-picker.test.tsx
git commit -m "feat: add CurveTextPicker admin drag-to-configure component"
```

---

### Task 5: Wire `CurveTextPicker` into `template-form.tsx`

**Files:**
- Modify: `src/app/admin/campaigns/template-form.tsx:1-245` (imports, `overlaysMatch`, and the per-overlay fieldset render block at lines 217-234)
- Test: `tests/app/admin/template-form.test.tsx`

**Interfaces:**
- Consumes: `CurveTextPicker` (Task 4) and `type OverlayCurve` (Task 1).
- Produces: none new — this is leaf UI wiring, nothing else depends on it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/app/admin/template-form.test.tsx`, inside the `describe("TemplateForm", ...)` block, after the last `it`:

```ts
  it("shows the curve picker instead of X/Y number inputs when 'Chữ theo đường cong' is checked, and submits the curve config", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung cong");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    await userEvent.click(screen.getByRole("button", { name: "Thêm trường overlay" }));
    await userEvent.type(screen.getByLabelText("Khóa (key)"), "ribbon");

    await userEvent.click(screen.getByLabelText("Chữ theo đường cong"));

    expect(screen.getByTestId("curve-text-picker")).toBeTruthy();
    expect(screen.queryByLabelText("X")).toBeNull();
    expect(screen.queryByLabelText("Y")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([
          expect.objectContaining({
            key: "ribbon",
            curve: { centerX: 50, centerY: 50, radius: 30, angle: -90, direction: "cw" },
          }),
        ]),
      }),
    }));
  });

  it("reverts to X/Y number inputs and drops the curve config when the checkbox is unticked", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung cong");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    await userEvent.click(screen.getByRole("button", { name: "Thêm trường overlay" }));
    await userEvent.type(screen.getByLabelText("Khóa (key)"), "ribbon");
    const curveCheckbox = screen.getByLabelText("Chữ theo đường cong");

    await userEvent.click(curveCheckbox);
    expect(screen.getByTestId("curve-text-picker")).toBeTruthy();

    await userEvent.click(curveCheckbox);
    expect(screen.queryByTestId("curve-text-picker")).toBeNull();
    expect(screen.getByLabelText("X")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([
          expect.objectContaining({ key: "ribbon", curve: undefined }),
        ]),
      }),
    }));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app/admin/template-form.test.tsx`
Expected: FAIL — no element with label "Chữ theo đường cong" exists yet.

- [ ] **Step 3: Implement**

In `src/app/admin/campaigns/template-form.tsx`, update the import block (currently lines 1-11):

```tsx
import { useEffect, useState, FormEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TextOverlay, OverlayCurve } from "@/lib/compositing/overlay-layout";
import { COMPONENT_PRESETS, type ComponentPreset } from "@/lib/component-presets";
import { useAdminLang } from "@/lib/admin-i18n";
import { PhotoAreaPicker } from "./photo-area-picker";
import { CurveTextPicker } from "./curve-text-picker";
```

Add a default curve constant right after `const MAX_FRAME_IMAGE_BYTES = 5 * 1024 * 1024;`:

```tsx
const DEFAULT_CURVE: OverlayCurve = { centerX: 50, centerY: 50, radius: 30, angle: -90, direction: "cw" };
```

Update `overlaysMatch` (currently lines 51-64) to also compare `curve`, so toggling curve on/off correctly marks a preset overlay as "modified":

```tsx
function overlaysMatch(a: TextOverlay, b: TextOverlay): boolean {
  return (
    a.key === b.key &&
    a.label === b.label &&
    a.labelEn === b.labelEn &&
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.placeholder === b.placeholder &&
    JSON.stringify(a.options ?? []) === JSON.stringify(b.options ?? []) &&
    JSON.stringify(a.curve ?? null) === JSON.stringify(b.curve ?? null)
  );
}
```

Finally, replace the X/Y grid block inside the per-overlay fieldset (currently lines 217-234):

```tsx
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`overlay-x-${index}`}>X</Label>
                <Input id={`overlay-x-${index}`} type="number" value={overlay.x} onChange={e => updateOverlay(index, { x: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`overlay-y-${index}`}>Y</Label>
                <Input id={`overlay-y-${index}`} type="number" value={overlay.y} onChange={e => updateOverlay(index, { y: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`overlay-fontsize-${index}`}>Cỡ chữ</Label>
                <Input id={`overlay-fontsize-${index}`} type="number" value={overlay.fontSize} onChange={e => updateOverlay(index, { fontSize: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`overlay-color-${index}`}>Màu chữ</Label>
                <Input id={`overlay-color-${index}`} type="color" value={overlay.color} onChange={e => updateOverlay(index, { color: e.target.value })} />
              </div>
            </div>
```

with:

```tsx
            <label htmlFor={`overlay-curved-${index}`} className="flex items-center gap-2 text-sm">
              <input
                id={`overlay-curved-${index}`}
                type="checkbox"
                checked={!!overlay.curve}
                onChange={e => updateOverlay(index, { curve: e.target.checked ? DEFAULT_CURVE : undefined })}
              />
              Chữ theo đường cong
            </label>

            {overlay.curve ? (
              <CurveTextPicker
                imageUrl={framePreviewUrl}
                value={overlay.curve}
                onChange={curve => updateOverlay(index, { curve })}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`overlay-x-${index}`}>X</Label>
                  <Input id={`overlay-x-${index}`} type="number" value={overlay.x} onChange={e => updateOverlay(index, { x: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`overlay-y-${index}`}>Y</Label>
                  <Input id={`overlay-y-${index}`} type="number" value={overlay.y} onChange={e => updateOverlay(index, { y: Number(e.target.value) })} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`overlay-fontsize-${index}`}>Cỡ chữ</Label>
                <Input id={`overlay-fontsize-${index}`} type="number" value={overlay.fontSize} onChange={e => updateOverlay(index, { fontSize: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`overlay-color-${index}`}>Màu chữ</Label>
                <Input id={`overlay-color-${index}`} type="color" value={overlay.color} onChange={e => updateOverlay(index, { color: e.target.value })} />
              </div>
            </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/admin/template-form.test.tsx`
Expected: PASS (all tests, old and new — every pre-existing test must still pass since unchecked overlays keep the same X/Y inputs with the same labels).

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS across the whole suite (`overlay-layout.test.ts`, `server-compositor.test.ts`, `avatar-creator.test.tsx`, `template-form.test.tsx`, `curve-text-picker.test.tsx`, and every other pre-existing test file untouched by this plan).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/campaigns/template-form.tsx tests/app/admin/template-form.test.tsx
git commit -m "feat: wire CurveTextPicker into the admin template form"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only, no code changes).

**Interfaces:**
- Consumes: the full feature from Tasks 1-5.
- Produces: nothing — this task's only deliverable is a confirmation that the feature works through the real UI, since no automated test spins up the dev server or does pixel-level comparison between client preview and server download.

- [ ] **Step 1: Start the dev server**

Ensure Postgres + MinIO are running (`docker compose -f docker-compose.dev.yml up -d` from the project root if not already up), then:

Run: `npm run dev`

- [ ] **Step 2: Create a curved overlay via the admin UI**

1. Sign in as admin at `/admin/login`.
2. Open `/admin/campaigns`, create or edit a campaign, then create or edit a template with a frame image uploaded.
3. Add a text overlay (e.g. key `ribbon`, label "Ruy băng"), tick "Chữ theo đường cong".
4. Drag the center handle to roughly the top-center of the frame, drag the anchor handle to set a radius that visually matches the frame's ribbon curve, leave direction as "Thuận kim đồng hồ".
5. Save the template.

- [ ] **Step 3: Verify the public preview renders the curve**

1. Open the campaign's public page (`/c/<slug>`), fill in the `ribbon` field with a short phrase (e.g. "FPT 38 NĂM").
2. Confirm the live canvas preview shows the text following the arc, not a straight line.

- [ ] **Step 4: Verify the downloaded image matches**

1. Upload a photo, click download.
2. Open the downloaded PNG and confirm the curved text in the file visually matches what the preview showed (same arc position, same character spacing/order) — exact pixel match isn't required (see spec's Client-Preview/Server-Render split), but the arc shape, direction, and rough position must agree.

- [ ] **Step 5: Verify a non-curved overlay in the same template is unaffected**

1. On the same template, ensure any other overlay field that was never marked "curved" still renders as a straight line in both the preview and the download, unchanged from before this feature existed.

- [ ] **Step 6: Stop the dev server**

No commit for this task — it's a verification checklist. If any step reveals a bug, fix it as a small follow-up patch to the relevant file from Tasks 1-5, re-run that task's tests, and re-verify from Step 2.
