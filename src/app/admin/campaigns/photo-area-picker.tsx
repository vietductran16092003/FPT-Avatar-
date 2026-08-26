"use client";

import { useRef } from "react";

export interface PhotoArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SIZE = 5;

export function PhotoAreaPicker({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string | null;
  value: PhotoArea;
  onChange: (next: PhotoArea) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  function startDrag(mode: "move" | "resize", e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = value;
    const rect = containerRef.current?.getBoundingClientRect();

    function onMove(ev: PointerEvent) {
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;
      if (mode === "move") {
        const x = Math.min(100 - start.w, Math.max(0, start.x + dxPct));
        const y = Math.min(100 - start.h, Math.max(0, start.y + dyPct));
        onChange({ ...start, x, y });
      } else {
        const w = Math.min(100 - start.x, Math.max(MIN_SIZE, start.w + dxPct));
        const h = Math.min(100 - start.y, Math.max(MIN_SIZE, start.h + dyPct));
        onChange({ ...start, w, h });
      }
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={containerRef}
      data-testid="photo-area-picker"
      className="relative aspect-square w-full max-w-xs overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(#eef1f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <p className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
          Tải ảnh khung lên để chọn vùng ảnh cá nhân
        </p>
      )}
      <div
        data-testid="photo-area-box"
        onPointerDown={e => startDrag("move", e)}
        className="absolute cursor-move border-2 border-primary bg-primary/10"
        style={{ left: `${value.x}%`, top: `${value.y}%`, width: `${value.w}%`, height: `${value.h}%` }}
      >
        <div
          data-testid="photo-area-resize-handle"
          onPointerDown={e => startDrag("resize", e)}
          className="absolute -bottom-1.5 -right-1.5 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-primary"
        />
      </div>
    </div>
  );
}
