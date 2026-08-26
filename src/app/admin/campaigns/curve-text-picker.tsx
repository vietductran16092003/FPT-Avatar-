"use client";

import { useRef, useEffect } from "react";
import type { OverlayCurve } from "@/lib/compositing/overlay-layout";

export function CurveTextPicker({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string | null;
  value: OverlayCurve;
  onChange: (next: OverlayCurve) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeListeners = useRef<{ onMove: (e: PointerEvent) => void; onUp: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (activeListeners.current) {
        window.removeEventListener("pointermove", activeListeners.current.onMove);
        window.removeEventListener("pointerup", activeListeners.current.onUp);
      }
    };
  }, []);

  function startCenterDrag(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();

    function onMove(ev: PointerEvent) {
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const centerX = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const centerY = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      onChange({ ...value, centerX, centerY });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      activeListeners.current = null;
    }
    activeListeners.current = { onMove, onUp };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startAnchorDrag(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();

    function onMove(ev: PointerEvent) {
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const px = ((ev.clientX - rect.left) / rect.width) * 100;
      const py = ((ev.clientY - rect.top) / rect.height) * 100;
      const dx = px - value.centerX;
      const dy = py - value.centerY;
      const radius = Math.max(1, Math.hypot(dx, dy));
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      onChange({ ...value, radius, angle });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      activeListeners.current = null;
    }
    activeListeners.current = { onMove, onUp };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const angleRad = (value.angle * Math.PI) / 180;
  const anchorX = value.centerX + value.radius * Math.cos(angleRad);
  const anchorY = value.centerY + value.radius * Math.sin(angleRad);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        data-testid="curve-text-picker"
        className="relative aspect-square w-full max-w-xs overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(#eef1f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <p className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
            Tải ảnh khung lên để đặt đường cong chữ
          </p>
        )}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <circle
            cx={value.centerX}
            cy={value.centerY}
            r={value.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            strokeDasharray="2,2"
            vectorEffect="non-scaling-stroke"
            className="text-primary/60"
          />
          <line
            x1={value.centerX}
            y1={value.centerY}
            x2={anchorX}
            y2={anchorY}
            stroke="currentColor"
            strokeWidth={0.3}
            vectorEffect="non-scaling-stroke"
            className="text-primary/60"
          />
        </svg>
        <div
          data-testid="curve-center-handle"
          onPointerDown={startCenterDrag}
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-primary"
          style={{ left: `${value.centerX}%`, top: `${value.centerY}%` }}
        />
        <div
          data-testid="curve-anchor-handle"
          onPointerDown={startAnchorDrag}
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-move border-2 border-white bg-secondary"
          style={{ left: `${anchorX}%`, top: `${anchorY}%` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">Chiều đọc chữ:</span>
        <button
          type="button"
          onClick={() => onChange({ ...value, direction: value.direction === "cw" ? "ccw" : "cw" })}
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold"
        >
          {value.direction === "cw" ? "Thuận kim đồng hồ" : "Ngược kim đồng hồ"}
        </button>
      </div>
    </div>
  );
}
