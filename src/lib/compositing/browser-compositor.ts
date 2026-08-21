import { resolveOverlayDraws, type TextOverlay } from "./overlay-layout";

export async function renderPreview(
  canvas: HTMLCanvasElement,
  frameImg: HTMLImageElement,
  photoImg: HTMLImageElement,
  photoArea: { x: number; y: number; w: number; h: number },
  overlays: TextOverlay[],
  overlayValues: Record<string, string>,
): Promise<void> {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const px = (photoArea.x / 100) * canvas.width;
  const py = (photoArea.y / 100) * canvas.height;
  const pw = (photoArea.w / 100) * canvas.width;
  const ph = (photoArea.h / 100) * canvas.height;
  ctx.drawImage(photoImg, px, py, pw, ph);

  ctx.drawImage(frameImg, 0, 0);

  const draws = resolveOverlayDraws(overlays, overlayValues, canvas.width, canvas.height);
  for (const draw of draws) {
    ctx.fillStyle = draw.color;
    ctx.font = `${draw.fontSize}px sans-serif`;
    ctx.fillText(draw.text, draw.x, draw.y);
  }
}
