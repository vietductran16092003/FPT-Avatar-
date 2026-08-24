"use client";

import { useEffect, useRef, useState } from "react";
import { renderPreview } from "@/lib/compositing/browser-compositor";
import type { TextOverlay } from "@/lib/compositing/overlay-layout";
import { PublicLangProvider, usePublicLang } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

export interface Template {
  id: string;
  name: string;
  frameImageUrl: string;
  overlayConfig: { photoArea: { x: number; y: number; w: number; h: number }; textOverlays: TextOverlay[] };
}

function clampPan(v: number): number {
  return Math.max(-0.45, Math.min(0.45, v));
}

export function AvatarCreator({ slug, templates }: { slug: string; templates: Template[] }) {
  return (
    <PublicLangProvider>
      <AvatarCreatorInner slug={slug} templates={templates} />
    </PublicLangProvider>
  );
}

function AvatarCreatorInner({ slug, templates }: { slug: string; templates: Template[] }) {
  const { t } = usePublicLang();
  const [selectedId, setSelectedId] = useState(templates[0].id);
  const [overlayValues, setOverlayValues] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoImg, setPhotoImg] = useState<HTMLImageElement | null>(null);
  const [frameImg, setFrameImg] = useState<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, ox: 0, oy: 0 });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOx: 0, startOy: 0 });

  const selected = templates.find(t => t.id === selectedId)!;

  function selectTemplate(id: string) {
    setSelectedId(id);
    setOverlayValues({});
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`Ảnh vượt quá 10MB, vui lòng chọn ảnh nhỏ hơn.`);
      e.target.value = "";
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
    setTransform({ scale: 1, ox: 0, oy: 0 });
  }

  useEffect(() => {
    if (!photoFile) {
      setPhotoImg(null);
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    const img = new Image();
    img.onload = () => setPhotoImg(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setFrameImg(img);
    img.src = selected.frameImageUrl;
  }, [selected.frameImageUrl]);

  useEffect(() => {
    if (!canvasRef.current || !frameImg || !photoImg) return;
    renderPreview(canvasRef.current, frameImg, photoImg, selected.overlayConfig.photoArea, selected.overlayConfig.textOverlays, overlayValues, transform);
  }, [frameImg, photoImg, selected, overlayValues, transform]);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!photoImg) return;
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOx: transform.ox, startOy: transform.oy };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current.dragging || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const nx = clampPan(dragRef.current.startOx + (e.clientX - dragRef.current.startX) / rect.width);
    const ny = clampPan(dragRef.current.startOy + (e.clientY - dragRef.current.startY) / rect.height);
    setTransform(tr => ({ ...tr, ox: nx, oy: ny }));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current.dragging = false;
    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released — nothing to do
    }
  }

  const stepsComplete =
    !!photoFile &&
    selected.overlayConfig.textOverlays.every(o => !!(overlayValues[o.key] && overlayValues[o.key].trim()));

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 p-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-8">
        <div>
          <div className="mb-1 text-[15px] font-bold">{t("stepUpload")}</div>
          <div className="mb-3 text-[13px] text-muted-foreground">{t("stepUploadHint")}</div>
          {photoError && <p role="alert" className="mb-2 text-sm text-destructive">{photoError}</p>}
          <label htmlFor="photo-input" className="cursor-pointer">
            {photoFile ? (
              <div className="flex items-center gap-3">
                <img src={photoPreviewUrl ?? undefined} alt="" className="size-20 rounded-full border border-border object-cover" />
                <span className="text-sm font-semibold text-primary">{t("changePhoto")}</span>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border bg-muted/40 p-8 text-center">
                <div className="mb-1 text-sm font-bold">{t("dropTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("dropSub")}</div>
              </div>
            )}
          </label>
          <input id="photo-input" aria-label={t("stepUpload")} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoChange} />
        </div>

        <div>
          <div className="mb-3 text-[15px] font-bold">{t("stepTemplate")}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => selectTemplate(tpl.id)}
                className={cn(
                  "flex flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition-colors",
                  selectedId === tpl.id ? "border-primary" : "border-border hover:border-primary/50",
                )}
              >
                <div className="relative aspect-square bg-[repeating-conic-gradient(#eef1f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                  <img src={tpl.frameImageUrl} alt="" className="h-full w-full object-contain" />
                </div>
                <div className="truncate p-2 text-center text-xs font-semibold">{tpl.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 text-[15px] font-bold">{t("stepOverlay")}</div>
          <div className="flex flex-col gap-3">
            {selected.overlayConfig.textOverlays.map(overlay => (
              <div key={overlay.key} className="space-y-1">
                <label htmlFor={`overlay-${overlay.key}`} className="text-xs font-semibold text-muted-foreground">
                  {overlay.label}
                </label>
                {overlay.type === "select" ? (
                  <select
                    id={`overlay-${overlay.key}`}
                    value={overlayValues[overlay.key] ?? ""}
                    onChange={e => setOverlayValues(v => ({ ...v, [overlay.key]: e.target.value }))}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  >
                    <option value="" disabled>—</option>
                    {(overlay.options ?? []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`overlay-${overlay.key}`}
                    value={overlayValues[overlay.key] ?? ""}
                    placeholder={overlay.placeholder}
                    onChange={e => setOverlayValues(v => ({ ...v, [overlay.key]: e.target.value }))}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 text-[15px] font-bold">{t("previewTitle")}</div>
        <div ref={stageRef} className="relative mb-2 aspect-square overflow-hidden rounded-xl" style={{ boxShadow: "inset 0 0 0 1px rgba(16,30,46,.16)" }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={800}
            className="h-full w-full touch-none"
            style={{ cursor: photoImg ? "grab" : "default" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>
        {photoImg && (
          <div className="mb-3 flex items-center gap-2">
            <button type="button" onClick={() => setTransform(tr => ({ ...tr, scale: Math.max(MIN_ZOOM, +(tr.scale - ZOOM_STEP).toFixed(2)) }))} className="flex size-7 items-center justify-center rounded-lg border border-input text-sm font-bold">−</button>
            <input
              type="range"
              aria-label="Zoom"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={transform.scale}
              onChange={e => setTransform(tr => ({ ...tr, scale: Number(e.target.value) }))}
              className="flex-1"
            />
            <button type="button" onClick={() => setTransform(tr => ({ ...tr, scale: Math.min(MAX_ZOOM, +(tr.scale + ZOOM_STEP).toFixed(2)) }))} className="flex size-7 items-center justify-center rounded-lg border border-input text-sm font-bold">+</button>
          </div>
        )}
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t("previewNote")}</p>
        <button
          type="button"
          disabled={!stepsComplete}
          className="mb-2 w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {t("downloadButton")}
        </button>
      </div>
    </div>
  );
}
