export interface PhotoTransform {
  scale: number;
  ox: number;
  oy: number;
}

export const IDENTITY_TRANSFORM: PhotoTransform = { scale: 1, ox: 0, oy: 0 };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const MAX_PAN = 0.45;

// Client and server must agree on these bounds — the server clamps whatever
// the client sends so a stale/tampered transform can't push the photo
// arbitrarily far outside its frame.
export function clampTransform(transform: PhotoTransform): PhotoTransform {
  const clampNum = (v: number, min: number, max: number, fallback: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    scale: clampNum(transform.scale, MIN_ZOOM, MAX_ZOOM, 1),
    ox: clampNum(transform.ox, -MAX_PAN, MAX_PAN, 0),
    oy: clampNum(transform.oy, -MAX_PAN, MAX_PAN, 0),
  };
}

export interface PhotoPlacement {
  px: number;
  py: number;
  pw: number;
  ph: number;
  dx: number;
  dy: number;
  drawW: number;
  drawH: number;
}

// Shared by the fabric.js client preview and the server compositor so the
// downloaded image matches what the user saw pixel-for-pixel: both sides
// resolve the same photoArea percentages + pan/zoom transform into the same
// draw rectangle, just at different canvasWidth/canvasHeight.
export function resolvePhotoPlacement(
  photoArea: { x: number; y: number; w: number; h: number },
  photoNaturalWidth: number,
  photoNaturalHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  transform: PhotoTransform = IDENTITY_TRANSFORM,
): PhotoPlacement {
  const px = (photoArea.x / 100) * canvasWidth;
  const py = (photoArea.y / 100) * canvasHeight;
  const pw = (photoArea.w / 100) * canvasWidth;
  const ph = (photoArea.h / 100) * canvasHeight;

  const coverScale = Math.max(pw / photoNaturalWidth, ph / photoNaturalHeight) * transform.scale;
  const drawW = photoNaturalWidth * coverScale;
  const drawH = photoNaturalHeight * coverScale;
  const dx = px + (pw - drawW) / 2 + transform.ox * pw;
  const dy = py + (ph - drawH) / 2 + transform.oy * ph;

  return { px, py, pw, ph, dx, dy, drawW, drawH };
}
