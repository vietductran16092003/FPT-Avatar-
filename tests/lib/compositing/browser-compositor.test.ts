import { describe, it, expect, vi } from "vitest";
import { renderPreview } from "../../../src/lib/compositing/browser-compositor";

function fakeCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    font: "",
  };
  return { canvas: { width: 200, height: 200, getContext: () => ctx }, ctx };
}

describe("renderPreview", () => {
  it("draws the photo into photoArea, then the frame, then each overlay with a value", async () => {
    const { canvas, ctx } = fakeCanvas();
    const frameImg = {} as HTMLImageElement;
    const photoImg = {} as HTMLImageElement;

    await renderPreview(
      canvas as any, frameImg, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 90, fontSize: 16, color: "#fff" }],
      { slogan: "Dream Big" },
    );

    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, photoImg, 0, 0, 100, 100);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, frameImg, 0, 0);
    expect(ctx.fillText).toHaveBeenCalledWith("Dream Big", 100, 180);
  });

  it("draws no text when overlayValues has no matching value", async () => {
    const { canvas, ctx } = fakeCanvas();

    await renderPreview(
      canvas as any, {} as HTMLImageElement, {} as HTMLImageElement,
      { x: 0, y: 0, w: 50, h: 50 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 90, fontSize: 16, color: "#fff" }],
      {},
    );

    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
