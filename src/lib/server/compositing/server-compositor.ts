import { createCanvas, loadImage } from "canvas";
import { resolveOverlayDraws, type TextOverlay } from "@/lib/compositing/overlay-layout";
import { resolvePhotoPlacement, IDENTITY_TRANSFORM, type PhotoTransform } from "@/lib/compositing/photo-placement";

export async function compositeAvatar(
  framePngBuffer: Buffer,
  photoBuffer: Buffer,
  photoArea: { x: number; y: number; w: number; h: number },
  overlays: TextOverlay[],
  overlayValues: Record<string, string>,
  lang: "vi" | "en" = "vi",
  transform: PhotoTransform = IDENTITY_TRANSFORM,
): Promise<Buffer> {
  const frame = await loadImage(framePngBuffer);
  const photo = await loadImage(photoBuffer);

  const canvas = createCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d");

  // Same cover-fit + pan/zoom math the client preview uses (photo-placement.ts)
  // so the server-rendered download matches what the user saw pixel-for-pixel.
  const { px, py, pw, ph, dx, dy, drawW, drawH } = resolvePhotoPlacement(
    photoArea, photo.width, photo.height, frame.width, frame.height, transform,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ctx.drawImage(photo, dx, dy, drawW, drawH);
  ctx.restore();

  ctx.drawImage(frame, 0, 0);

  const draws = resolveOverlayDraws(overlays, overlayValues, frame.width, frame.height, lang);
  for (const draw of draws) {
    ctx.save();
    ctx.fillStyle = draw.color;
    ctx.font = `${draw.fontSize}px sans-serif`;
    // Rotate around the draw's own anchor point rather than the canvas
    // origin, then draw at (0,0) in that rotated frame — mathematically
    // identical to the old unrotated fillText(text, x, y) when rotation is
    // 0, so every pre-existing overlay renders exactly as before.
    ctx.translate(draw.x, draw.y);
    ctx.rotate((draw.rotation * Math.PI) / 180);
    // node-canvas's fillText draws literal characters, not markup — no
    // separate XML escaping step is needed here (unlike an SVG-string
    // compositor), but values still pass through resolveOverlayDraws
    // unmodified, never interpolated into an executable string.
    ctx.fillText(draw.text, 0, 0);
    ctx.restore();
  }

  return canvas.toBuffer("image/png");
}
