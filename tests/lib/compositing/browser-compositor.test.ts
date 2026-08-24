// tests/lib/compositing/browser-compositor.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderPreview } from "../../../src/lib/compositing/browser-compositor";

function fakeCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillStyle: "",
    font: "",
  };
  return { canvas: { width: 200, height: 200, getContext: () => ctx }, ctx };
}

describe("renderPreview", () => {
  it("draws the photo cover-fit into photoArea (identity transform, photo already matches box size), then the frame, then each overlay with a value", async () => {
    const { canvas, ctx } = fakeCanvas();
    const frameImg = {} as HTMLImageElement;
    const photoImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

    await renderPreview(
      canvas as any, frameImg, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 90, fontSize: 16, color: "#fff" }],
      { slogan: "Dream Big" },
    );

    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, photoImg, 0, 0, 100, 100);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, frameImg, 0, 0, 200, 200);
    expect(ctx.fillText).toHaveBeenCalledWith("Dream Big", 100, 180);
  });

  it("draws no text when overlayValues has no matching value", async () => {
    const { canvas, ctx } = fakeCanvas();

    await renderPreview(
      canvas as any, {} as HTMLImageElement, { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement,
      { x: 0, y: 0, w: 50, h: 50 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 90, fontSize: 16, color: "#fff" }],
      {},
    );

    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("zooms the photo around the photoArea center when scale > 1, with identity pan", async () => {
    const { canvas, ctx } = fakeCanvas();
    const photoImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

    await renderPreview(
      canvas as any, {} as HTMLImageElement, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [], {},
      { scale: 2, ox: 0, oy: 0 },
    );

    // photoArea box is 100x100 (50% of 200); at scale 2 the drawn image is 200x200,
    // centered on the box: dx = 0 + (100-200)/2 = -50, dy = -50.
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, photoImg, -50, -50, 200, 200);
  });

  it("pans the photo by ox/oy as a fraction of the photoArea box size", async () => {
    const { canvas, ctx } = fakeCanvas();
    const photoImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

    await renderPreview(
      canvas as any, {} as HTMLImageElement, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [], {},
      { scale: 1, ox: 0.1, oy: -0.2 },
    );

    // box is 100x100; ox 0.1 -> +10px, oy -0.2 -> -20px, on top of the identity dx/dy of 0,0.
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, photoImg, 10, -20, 100, 100);
  });

  it("clips the photo to the photoArea rectangle before drawing it", async () => {
    const { canvas, ctx } = fakeCanvas();
    const photoImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

    await renderPreview(
      canvas as any, {} as HTMLImageElement, photoImg,
      { x: 10, y: 20, w: 50, h: 50 },
      [], {},
    );

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.rect).toHaveBeenCalledWith(20, 40, 100, 100);
    expect(ctx.clip).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it("skips drawing the photo (no NaN/Infinity to drawImage) when the image has not yet decoded (naturalWidth/naturalHeight 0), but still draws the frame", async () => {
    const { canvas, ctx } = fakeCanvas();
    const frameImg = {} as HTMLImageElement;
    const photoImg = { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;

    await renderPreview(
      canvas as any, frameImg, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [], {},
    );

    expect(ctx.drawImage).not.toHaveBeenCalledWith(photoImg, expect.anything(), expect.anything(), expect.anything(), expect.anything());
    expect(ctx.drawImage).toHaveBeenCalledWith(frameImg, 0, 0, 200, 200);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });
});
