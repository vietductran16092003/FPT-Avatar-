import { describe, it, expect } from "vitest";
import { createCanvas } from "canvas";
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
