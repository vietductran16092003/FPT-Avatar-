"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { Canvas, FabricImage, FabricText, Rect } from "fabric";
import { resolvePhotoPlacement, clampTransform, IDENTITY_TRANSFORM, type PhotoTransform } from "@/lib/compositing/photo-placement";
import type { ResolvedDraw } from "@/lib/compositing/overlay-layout";

// Fixed internal working resolution for the interactive preview. The final
// downloaded image is always re-rendered server-side at the frame's native
// resolution (server-compositor.ts), so this canvas never needs to be
// high-res and the client never exports pixels from it — see the
// Client-Preview/Server-Render split in the design.
export const CANVAS_SIZE = 800;
const ZOOM_STEP = 0.1;

interface PhotoArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PinchState {
  pointers: Map<number, { x: number; y: number }>;
  startDist: number;
  startMid: { x: number; y: number };
  startScale: number;
  startLeft: number;
  startTop: number;
}

export function useAvatarCanvas(canvasElRef: RefObject<HTMLCanvasElement | null>) {
  const fabricRef = useRef<Canvas | null>(null);
  const photoObjRef = useRef<FabricImage | null>(null);
  const frameObjRef = useRef<FabricImage | null>(null);
  const textObjsRef = useRef<FabricText[]>([]);
  const photoAreaRef = useRef<PhotoArea>({ x: 0, y: 0, w: 100, h: 100 });

  // Reads the photo object's current scale/position back into our
  // percentage-based {scale, ox, oy} convention — the inverse of
  // resolvePhotoPlacement. Kept unclamped; callers clamp as needed.
  const deriveRawTransform = useCallback((photo: FabricImage, area: PhotoArea): PhotoTransform => {
    const natW = photo.width;
    const natH = photo.height;
    const px = (area.x / 100) * CANVAS_SIZE;
    const py = (area.y / 100) * CANVAS_SIZE;
    const pw = (area.w / 100) * CANVAS_SIZE;
    const ph = (area.h / 100) * CANVAS_SIZE;
    const baseCoverScale = Math.max(pw / natW, ph / natH);

    const drawW = natW * (photo.scaleX ?? baseCoverScale);
    const drawH = natH * (photo.scaleY ?? baseCoverScale);
    const scale = (photo.scaleX ?? baseCoverScale) / baseCoverScale;
    const ox = ((photo.left ?? px) - px - (pw - drawW) / 2) / pw;
    const oy = ((photo.top ?? py) - py - (ph - drawH) / 2) / ph;

    return { scale, ox, oy };
  }, []);

  const getTransform = useCallback((): PhotoTransform => {
    const photo = photoObjRef.current;
    if (!photo) return IDENTITY_TRANSFORM;
    return clampTransform(deriveRawTransform(photo, photoAreaRef.current));
  }, [deriveRawTransform]);

  // Re-applies the clamped transform to the fabric object so the user can
  // never drag/pinch the photo further than the server-side bounds allow.
  const clampPhotoObject = useCallback(() => {
    const photo = photoObjRef.current;
    const canvas = fabricRef.current;
    if (!photo || !canvas) return;
    const area = photoAreaRef.current;
    const clamped = clampTransform(deriveRawTransform(photo, area));
    const placement = resolvePhotoPlacement(area, photo.width, photo.height, CANVAS_SIZE, CANVAS_SIZE, clamped);
    photo.set({
      scaleX: placement.drawW / photo.width,
      scaleY: placement.drawH / photo.height,
      left: placement.dx,
      top: placement.dy,
    });
    canvas.requestRenderAll();
  }, [deriveRawTransform]);

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    const canvas = new Canvas(el, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      selection: false,
      enableRetinaScaling: false,
    });
    fabricRef.current = canvas;

    // Decouple the on-screen (CSS) size from the internal working
    // resolution: fabric otherwise sets the canvas's inline CSS width/height
    // to match CANVAS_SIZE in pixels, which fights the "%"-based responsive
    // sizing from the surrounding layout. "100%" here just fills whatever
    // box the CSS layout gives it — object coordinates stay in the fixed
    // CANVAS_SIZE logical space.
    for (const node of [canvas.lowerCanvasEl, canvas.upperCanvasEl, canvas.lowerCanvasEl.parentElement as HTMLElement]) {
      node.style.width = "100%";
      node.style.height = "100%";
    }

    canvas.on("object:moving", () => clampPhotoObject());

    const upperCanvasEl = canvas.upperCanvasEl;
    upperCanvasEl.style.touchAction = "none";

    let pinch: PinchState | null = null;

    function handlePointerDown(e: PointerEvent) {
      if (!pinch) pinch = { pointers: new Map(), startDist: 0, startMid: { x: 0, y: 0 }, startScale: 1, startLeft: 0, startTop: 0 };
      pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinch.pointers.size === 2) {
        const photo = photoObjRef.current;
        if (!photo) return;
        const [a, b] = Array.from(pinch.pointers.values());
        pinch.startDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinch.startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        pinch.startScale = photo.scaleX ?? 1;
        pinch.startLeft = photo.left ?? 0;
        pinch.startTop = photo.top ?? 0;
        // Hand off exclusively to the pinch handler below so it doesn't
        // fight with fabric's own single-pointer drag mid-gesture.
        photo.set({ lockMovementX: true, lockMovementY: true });
      }
    }

    function handlePointerMove(e: PointerEvent) {
      if (!pinch || !pinch.pointers.has(e.pointerId)) return;
      pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.pointers.size < 2) return;

      const photo = photoObjRef.current;
      const canvas = fabricRef.current;
      if (!photo || !canvas) return;

      const [a, b] = Array.from(pinch.pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scaleDelta = pinch.startDist > 0 ? dist / pinch.startDist : 1;
      const rect = upperCanvasEl.getBoundingClientRect();
      const screenToCanvas = rect.width > 0 ? CANVAS_SIZE / rect.width : 1;

      photo.set({
        scaleX: pinch.startScale * scaleDelta,
        scaleY: pinch.startScale * scaleDelta,
        left: pinch.startLeft + (mid.x - pinch.startMid.x) * screenToCanvas,
        top: pinch.startTop + (mid.y - pinch.startMid.y) * screenToCanvas,
      });
      clampPhotoObject();
    }

    function handlePointerUp(e: PointerEvent) {
      pinch?.pointers.delete(e.pointerId);
      if (pinch && pinch.pointers.size < 2) {
        photoObjRef.current?.set({ lockMovementX: false, lockMovementY: false });
      }
    }

    upperCanvasEl.addEventListener("pointerdown", handlePointerDown);
    upperCanvasEl.addEventListener("pointermove", handlePointerMove);
    upperCanvasEl.addEventListener("pointerup", handlePointerUp);
    upperCanvasEl.addEventListener("pointercancel", handlePointerUp);

    return () => {
      upperCanvasEl.removeEventListener("pointerdown", handlePointerDown);
      upperCanvasEl.removeEventListener("pointermove", handlePointerMove);
      upperCanvasEl.removeEventListener("pointerup", handlePointerUp);
      upperCanvasEl.removeEventListener("pointercancel", handlePointerUp);
      canvas.dispose();
      fabricRef.current = null;
      photoObjRef.current = null;
      frameObjRef.current = null;
      textObjsRef.current = [];
    };
    // canvasElRef.current is a stable DOM node for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampPhotoObject]);

  const setPhoto = useCallback((img: HTMLImageElement, area: PhotoArea) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    photoAreaRef.current = area;

    if (photoObjRef.current) {
      canvas.remove(photoObjRef.current);
      photoObjRef.current = null;
    }

    const placement = resolvePhotoPlacement(area, img.naturalWidth, img.naturalHeight, CANVAS_SIZE, CANVAS_SIZE, IDENTITY_TRANSFORM);
    const px = (area.x / 100) * CANVAS_SIZE;
    const py = (area.y / 100) * CANVAS_SIZE;
    const pw = (area.w / 100) * CANVAS_SIZE;
    const ph = (area.h / 100) * CANVAS_SIZE;

    const photo = new FabricImage(img, {
      left: placement.dx,
      top: placement.dy,
      originX: "left",
      originY: "top",
      scaleX: placement.drawW / img.naturalWidth,
      scaleY: placement.drawH / img.naturalHeight,
      selectable: true,
      hasControls: false,
      hasBorders: false,
      lockRotation: true,
      hoverCursor: "grab",
      moveCursor: "grabbing",
      // fabric defaults every object (including clipPaths) to center-origin —
      // left/top throughout this file assume top-left origin, so it must be
      // set explicitly wherever an object is positioned this way.
      clipPath: new Rect({ left: px, top: py, width: pw, height: ph, originX: "left", originY: "top", absolutePositioned: true }),
    });

    canvas.add(photo);
    canvas.sendObjectToBack(photo);
    photoObjRef.current = photo;
    canvas.setActiveObject(photo);
    canvas.requestRenderAll();
  }, []);

  const setFrame = useCallback((img: HTMLImageElement) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (frameObjRef.current) {
      canvas.remove(frameObjRef.current);
      frameObjRef.current = null;
    }

    const frame = new FabricImage(img, {
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      scaleX: CANVAS_SIZE / img.naturalWidth,
      scaleY: CANVAS_SIZE / img.naturalHeight,
      selectable: false,
      evented: false,
    });

    canvas.add(frame);
    canvas.bringObjectToFront(frame);
    frameObjRef.current = frame;
    textObjsRef.current.forEach(t => canvas.bringObjectToFront(t));
    canvas.requestRenderAll();
  }, []);

  const setOverlays = useCallback((draws: ResolvedDraw[]) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    textObjsRef.current.forEach(t => canvas.remove(t));
    textObjsRef.current = draws.map(d => {
      const text = new FabricText(d.text, {
        left: d.x,
        top: d.y,
        originX: "center",
        originY: "center",
        fontSize: d.fontSize,
        fill: d.color,
        fontFamily: "sans-serif",
        selectable: false,
        evented: false,
      });
      canvas.add(text);
      canvas.bringObjectToFront(text);
      return text;
    });
    canvas.requestRenderAll();
  }, []);

  // Mouse users have no pinch gesture, so a step control is kept for desktop
  // parity with the touch pinch-zoom (both end up going through clampPhotoObject).
  const zoomBy = useCallback((delta: number) => {
    const photo = photoObjRef.current;
    if (!photo) return;
    const area = photoAreaRef.current;
    const current = clampTransform(deriveRawTransform(photo, area));
    const next = clampTransform({ ...current, scale: current.scale + delta });
    const placement = resolvePhotoPlacement(area, photo.width, photo.height, CANVAS_SIZE, CANVAS_SIZE, next);
    photo.set({
      scaleX: placement.drawW / photo.width,
      scaleY: placement.drawH / photo.height,
      left: placement.dx,
      top: placement.dy,
    });
    fabricRef.current?.requestRenderAll();
  }, [deriveRawTransform]);

  return { setPhoto, setFrame, setOverlays, getTransform, zoomBy, ZOOM_STEP };
}
