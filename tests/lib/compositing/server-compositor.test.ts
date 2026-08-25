import { describe, it, expect } from "vitest";
import { createCanvas, loadImage } from "canvas";
import { compositeAvatar } from "../../../src/lib/compositing/server-compositor";

function solidPng(width: number, height: number, color: string): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

describe("compositeAvatar", () => {
  it("returns a PNG buffer sized to the frame image, with photo + overlay text drawn in", async () => {
    const frame = solidPng(200, 200, "rgba(0,0,0,0)");
    const photo = solidPng(100, 100, "#ff0000");

    const result = await compositeAvatar(
      frame,
      photo,
      { x: 10, y: 10, w: 50, h: 50 },
      [{ key: "slogan", label: "Khẩu hiệu", labelEn: "Slogan", type: "text", x: 50, y: 90, fontSize: 20, color: "#ffffff" }],
      { slogan: "Dream Big" },
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    const decoded = await import("canvas").then(({ loadImage }) => loadImage(result));
    expect(decoded.width).toBe(200);
    expect(decoded.height).toBe(200);
  });

  it("renders a yearsSince overlay's computed tenure text, honoring the lang argument", async () => {
    const frame = solidPng(50, 50, "rgba(0,0,0,0)");
    const photo = solidPng(20, 20, "#00ff00");

    const result = await compositeAvatar(
      frame, photo, { x: 0, y: 0, w: 20, h: 20 },
      [{ key: "joinYear", label: "NĂM GIA NHẬP FPT", labelEn: "YEAR YOU JOINED FPT", type: "yearsSince", options: ["1988"], x: 50, y: 50, fontSize: 10, color: "#000" }],
      { joinYear: "1988" },
      "en",
    );

    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("applies the pan transform to the downloaded image, matching what the client preview showed (regression: transform used to be silently ignored server-side)", async () => {
    const frame = solidPng(100, 100, "rgba(0,0,0,0)");
    const photo = solidPng(50, 50, "#ff0000");

    // photoArea is the left half of the frame (50x50px), photo naturally
    // fills it exactly at scale 1 — panning right by ox=0.2 (10px) should
    // uncover background on the left edge and still show red near the right.
    const result = await compositeAvatar(
      frame, photo, { x: 0, y: 0, w: 50, h: 50 }, [], {}, "vi",
      { scale: 1, ox: 0.2, oy: 0 },
    );

    const decoded = await loadImage(result);
    const readCanvas = createCanvas(100, 100);
    const rctx = readCanvas.getContext("2d");
    rctx.drawImage(decoded, 0, 0);

    const uncoveredLeftEdge = rctx.getImageData(2, 25, 1, 1).data;
    const stillInsidePhoto = rctx.getImageData(45, 25, 1, 1).data;

    expect(uncoveredLeftEdge[3]).toBe(0);
    expect([stillInsidePhoto[0], stillInsidePhoto[1], stillInsidePhoto[2]]).toEqual([255, 0, 0]);
  });

  it("defaults to the identity transform (no pan/zoom) when none is given", async () => {
    const frame = solidPng(100, 100, "rgba(0,0,0,0)");
    const photo = solidPng(50, 50, "#ff0000");

    const result = await compositeAvatar(frame, photo, { x: 0, y: 0, w: 50, h: 50 }, [], {});

    const decoded = await loadImage(result);
    const readCanvas = createCanvas(100, 100);
    const rctx = readCanvas.getContext("2d");
    rctx.drawImage(decoded, 0, 0);

    const insidePhotoArea = rctx.getImageData(25, 25, 1, 1).data;
    expect([insidePhotoArea[0], insidePhotoArea[1], insidePhotoArea[2]]).toEqual([255, 0, 0]);
  });

  it("escapes overlay values so raw markup cannot be injected into the drawn text", async () => {
    const frame = solidPng(50, 50, "rgba(0,0,0,0)");
    const photo = solidPng(20, 20, "#00ff00");

    const result = await compositeAvatar(
      frame, photo, { x: 0, y: 0, w: 20, h: 20 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 50, fontSize: 10, color: "#000" }],
      { slogan: "<script>alert(1)</script>" },
    );

    expect(Buffer.isBuffer(result)).toBe(true);
  });
});
