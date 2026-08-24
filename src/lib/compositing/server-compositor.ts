import { createCanvas, loadImage } from "canvas";
import { resolveOverlayDraws, type TextOverlay } from "./overlay-layout";

export async function compositeAvatar(
  framePngBuffer: Buffer,
  photoBuffer: Buffer,
  photoArea: { x: number; y: number; w: number; h: number },
  overlays: TextOverlay[],
  overlayValues: Record<string, string>,
): Promise<Buffer> {
  const frame = await loadImage(framePngBuffer);
  const photo = await loadImage(photoBuffer);

  const canvas = createCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d");

  const px = (photoArea.x / 100) * frame.width;
  const py = (photoArea.y / 100) * frame.height;
  const pw = (photoArea.w / 100) * frame.width;
  const ph = (photoArea.h / 100) * frame.height;
  ctx.drawImage(photo, px, py, pw, ph);

  ctx.drawImage(frame, 0, 0);

  const draws = resolveOverlayDraws(overlays, overlayValues, frame.width, frame.height);
  for (const draw of draws) {
    ctx.fillStyle = draw.color;
    ctx.font = `${draw.fontSize}px sans-serif`;
    // node-canvas's fillText draws literal characters, not markup — no
    // separate XML escaping step is needed here (unlike an SVG-string
    // compositor), but values still pass through resolveOverlayDraws
    // unmodified, never interpolated into an executable string.
    ctx.fillText(draw.text, draw.x, draw.y);
  }

  return canvas.toBuffer("image/png");
}
