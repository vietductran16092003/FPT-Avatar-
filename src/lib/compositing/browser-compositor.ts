import { resolveOverlayDraws, type TextOverlay } from "./overlay-layout";

export interface PhotoTransform {
  scale: number;
  ox: number;
  oy: number;
}

const IDENTITY_TRANSFORM: PhotoTransform = { scale: 1, ox: 0, oy: 0 };

export async function renderPreview(
  canvas: HTMLCanvasElement,
  frameImg: HTMLImageElement,
  photoImg: HTMLImageElement,
  photoArea: { x: number; y: number; w: number; h: number },
  overlays: TextOverlay[],
  overlayValues: Record<string, string>,
  transform: PhotoTransform = IDENTITY_TRANSFORM,
): Promise<void> {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const px = (photoArea.x / 100) * canvas.width;
  const py = (photoArea.y / 100) * canvas.height;
  const pw = (photoArea.w / 100) * canvas.width;
  const ph = (photoArea.h / 100) * canvas.height;

  if (photoImg.naturalWidth > 0 && photoImg.naturalHeight > 0) {
    const coverScale = Math.max(pw / photoImg.naturalWidth, ph / photoImg.naturalHeight) * transform.scale;
    const drawW = photoImg.naturalWidth * coverScale;
    const drawH = photoImg.naturalHeight * coverScale;
    const dx = px + (pw - drawW) / 2 + transform.ox * pw;
    const dy = py + (ph - drawH) / 2 + transform.oy * ph;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.drawImage(photoImg, dx, dy, drawW, drawH);
    ctx.restore();
  }

  ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

  const draws = resolveOverlayDraws(overlays, overlayValues, canvas.width, canvas.height);
  for (const draw of draws) {
    ctx.fillStyle = draw.color;
    ctx.font = `${draw.fontSize}px sans-serif`;
    ctx.fillText(draw.text, draw.x, draw.y);
  }
}
