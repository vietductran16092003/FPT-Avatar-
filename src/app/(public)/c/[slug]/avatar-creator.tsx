"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Camera, Eye, Download } from "lucide-react";
import { useAvatarCanvas, CANVAS_SIZE } from "./use-avatar-canvas";
import { resolveOverlayDraws, type TextOverlay, type MeasureChar } from "@/lib/compositing/overlay-layout";
import { MIN_ZOOM, MAX_ZOOM } from "@/lib/compositing/photo-placement";
import { PublicLangProvider, usePublicLang } from "@/lib/public-i18n";
import { pickLocalized, type DisplayConfigLike } from "@/lib/localized-content";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics/ga4-client";

// Lazily-created, reused canvas 2d context for measuring curved-overlay
// character widths in the browser — mirrors server-compositor.ts's use of
// node-canvas's ctx.measureText, so client preview and server download lay
// out curved text the same way (each side measures with its own engine
// rather than sharing a guessed width).
let measureCanvasCtx: CanvasRenderingContext2D | null | undefined;
const measureCharWithCanvas: MeasureChar = (char, fontSize) => {
  if (measureCanvasCtx === undefined) {
    measureCanvasCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCanvasCtx) return fontSize * 0.6;
  measureCanvasCtx.font = `${fontSize}px sans-serif`;
  return measureCanvasCtx.measureText(char).width;
};

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ZOOM_STEP = 0.1;

export interface Template {
  id: string;
  name: string;
  frameImageUrl: string;
  overlayConfig: { photoArea: { x: number; y: number; w: number; h: number }; textOverlays: TextOverlay[] };
}

export function AvatarCreator({
  slug,
  templates,
  displayConfig,
}: {
  slug: string;
  templates: Template[];
  displayConfig?: DisplayConfigLike;
}) {
  return (
    <PublicLangProvider>
      <AvatarCreatorInner slug={slug} templates={templates} displayConfig={displayConfig} />
    </PublicLangProvider>
  );
}

// Pill button used for select-type overlay fields (e.g. "join year") — an
// outlined orange pill while empty, a solid orange-gradient pill once a
// value is picked, matching the client's reference design.
function PillSelect({
  id,
  value,
  options,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const filled = !!value;
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          "w-full appearance-none rounded-full border-2 px-5 py-3 text-center text-sm font-extrabold uppercase tracking-wide outline-none transition-colors",
          filled
            ? "border-transparent bg-gradient-to-b from-[#FF5A01] to-[#FDAE15] text-white"
            : "border-[#FF5A01] bg-white text-[#FF5A01]",
        )}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className={cn("pointer-events-none absolute right-5 top-1/2 size-4 -translate-y-1/2", filled ? "text-white" : "text-[#FF5A01]")} />
    </div>
  );
}

function AvatarCreatorInner({
  slug,
  templates,
  displayConfig,
}: {
  slug: string;
  templates: Template[];
  displayConfig?: DisplayConfigLike;
}) {
  const { t, lang } = usePublicLang();
  const [selectedId, setSelectedId] = useState(templates[0].id);
  const [overlayValues, setOverlayValues] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoImg, setPhotoImg] = useState<HTMLImageElement | null>(null);
  const [frameImg, setFrameImg] = useState<HTMLImageElement | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { setPhoto, setFrame, setOverlays, getTransform, zoomTo } = useAvatarCanvas(canvasRef);

  const selected = templates.find(t => t.id === selectedId)!;

  // Fires once per mount, not per template switch — this event marks a
  // visitor landing on the campaign's tool, before any template is chosen.
  useEffect(() => {
    trackEvent("campaign_view", { campaign_slug: slug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTemplate(id: string) {
    setSelectedId(id);
    setOverlayValues({});
    setResultUrl(null);
    trackEvent("template_select", { campaign_slug: slug, template_id: id });
  }

  function stagePhotoFile(file: File) {
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`Ảnh vượt quá 10MB, vui lòng chọn ảnh nhỏ hơn.`);
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
    setResultUrl(null);
    setZoom(MIN_ZOOM);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    stagePhotoFile(file);
    if (file.size > MAX_PHOTO_BYTES) e.target.value = "";
  }

  function handlePhotoDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (file) stagePhotoFile(file);
  }

  function handleZoomChange(next: number) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    setZoom(clamped);
    zoomTo(clamped);
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
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setFrameImg(img);
    };
    img.src = selected.frameImageUrl;
    return () => {
      cancelled = true;
    };
  }, [selected.frameImageUrl]);

  // Photo/frame/overlay layers are pushed into the fabric canvas imperatively
  // via the hook rather than declaratively re-rendered — fabric owns the
  // interactive pan/zoom state for the photo layer between these updates.
  useEffect(() => {
    if (!photoImg) return;
    setPhoto(photoImg, selected.overlayConfig.photoArea);
  }, [photoImg, selected, setPhoto]);

  useEffect(() => {
    if (!frameImg) return;
    setFrame(frameImg);
  }, [frameImg, setFrame]);

  useEffect(() => {
    const draws = resolveOverlayDraws(selected.overlayConfig.textOverlays, overlayValues, CANVAS_SIZE, CANVAS_SIZE, lang, measureCharWithCanvas);
    setOverlays(draws);
  }, [selected, overlayValues, lang, setOverlays]);

  async function handleDownload() {
    if (!photoFile) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const form = new FormData();
      form.set("templateId", selected.id);
      form.set("photo", photoFile);
      form.set("overlayValues", JSON.stringify(overlayValues));
      form.set("language", lang);
      form.set("transform", JSON.stringify(getTransform()));

      const res = await fetch(`/api/campaigns/${slug}/generate`, { method: "POST", body: form });
      if (!res.ok) {
        if (res.status === 401) {
          setDownloadError(t("sessionExpired"));
          return;
        }
        const data = await res.json().catch(() => null);
        setDownloadError(data?.error ?? t("errorGeneric"));
        return;
      }
      const { resultUrl: url } = await res.json();
      setResultUrl(url);
      // overlayValues is spread directly (not nested) so each field — e.g.
      // "unit", "joinYear", or any admin-defined key — becomes its own GA4
      // event parameter, ready to register as a custom dimension per field
      // rather than only a fixed, hardcoded set.
      trackEvent("avatar_download", { campaign_slug: slug, template_id: selected.id, ...overlayValues });

      const blobRes = await fetch(url);
      const blob = await blobRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${slug}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError(t("errorGeneric"));
    } finally {
      setDownloading(false);
    }
  }

  const stepsComplete =
    !!photoFile &&
    selected.overlayConfig.textOverlays.every(o => !!(overlayValues[o.key] && overlayValues[o.key].trim()));

  const campaignTitle = displayConfig ? pickLocalized(displayConfig, "title", lang) : "";

  return (
    <div className="mx-auto max-w-lg p-6">
      {campaignTitle && (
        <h1 className="mb-6 text-center text-2xl font-extrabold tracking-tight">{campaignTitle}</h1>
      )}

      {templates.length > 1 && (
        <div className="mb-8">
          <div className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("stepTemplate")}</div>
          <div className="grid grid-cols-3 gap-3">
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
      )}

      <div className="rounded-2xl border-2 border-dashed border-[#FDAE15]/60 bg-card p-6 shadow-sm">
        {photoError && <p role="alert" className="mb-3 text-sm text-destructive">{photoError}</p>}

        {view === "edit" && (
          <div className="mb-4 flex flex-col gap-4">
            {selected.overlayConfig.textOverlays.map(overlay => (
              <div key={overlay.key} className="space-y-1">
                {overlay.type === "select" || overlay.type === "yearsSince" ? (
                  <PillSelect
                    id={`overlay-${overlay.key}`}
                    value={overlayValues[overlay.key] ?? ""}
                    options={overlay.options ?? []}
                    placeholder={overlay.label}
                    onChange={v => setOverlayValues(vals => ({ ...vals, [overlay.key]: v }))}
                  />
                ) : (
                  <>
                    <label htmlFor={`overlay-${overlay.key}`} className="text-xs font-bold tracking-wide text-muted-foreground">
                      {overlay.label}
                    </label>
                    <input
                      id={`overlay-${overlay.key}`}
                      value={overlayValues[overlay.key] ?? ""}
                      placeholder={overlay.placeholder}
                      onChange={e => setOverlayValues(v => ({ ...v, [overlay.key]: e.target.value }))}
                      className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* The canvas element stays mounted at this same position for the
            component's whole lifetime — the fabric.js Canvas in
            useAvatarCanvas binds to it once on mount and never re-attaches,
            so it must never be conditionally unmounted/remounted (e.g. by
            branching between two different wrapper element types). The
            dropzone label is an absolutely-positioned sibling instead,
            shown only until a photo is staged. */}
        <div
          className={cn(
            "relative mx-auto aspect-square w-full overflow-hidden rounded-full transition-colors",
            !photoFile && isDraggingPhoto && "ring-4 ring-primary/40",
          )}
          style={{ boxShadow: "inset 0 0 0 1px rgba(16,30,46,.16)" }}
        >
          {/* Shown only until a real photo is staged — lets the frame + text
              ribbon be visible from the very first render instead of hiding
              behind an opaque dropzone, matching the reference mockup. */}
          {!photoFile && (
            <img src="/avatar-placeholder.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="relative h-full w-full touch-none"
            style={{ cursor: photoImg ? "grab" : "default" }}
          />
          {!photoFile && (
            <label
              htmlFor="photo-input"
              data-testid="photo-dropzone"
              className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/10 text-center text-xs font-semibold text-white"
              onDragOver={e => {
                e.preventDefault();
                setIsDraggingPhoto(true);
              }}
              onDragLeave={() => setIsDraggingPhoto(false)}
              onDrop={handlePhotoDrop}
            >
              {t("dropTitle")}
            </label>
          )}
        </div>
        <input ref={photoInputRef} id="photo-input" aria-label={t("stepUpload")} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoChange} />

        {photoFile && view === "edit" && (
          <div className="mt-4 flex items-center gap-3 rounded-full bg-[#FFE7CF] p-1.5">
            <button type="button" aria-label="-" onClick={() => handleZoomChange(zoom - ZOOM_STEP)} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FDD8B4] text-sm font-bold text-[#C25A00]">−</button>
            <input
              type="range"
              aria-label={t("zoomHint")}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={e => handleZoomChange(Number(e.target.value))}
              className="h-1.5 flex-1 accent-[#FF5A01]"
            />
            <button type="button" aria-label="+" onClick={() => handleZoomChange(zoom + ZOOM_STEP)} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FDD8B4] text-sm font-bold text-[#C25A00]">+</button>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 px-4 py-3 text-xs font-extrabold uppercase tracking-wide transition-colors",
            view === "edit"
              ? "border-transparent bg-gradient-to-b from-[#FF5A01] to-[#FDAE15] text-white"
              : "border-[#FF5A01] bg-[#FFE7CF] text-[#FF5A01]",
          )}
        >
          <Camera className="size-4" />
          {photoFile ? t("changePhotoButton") : t("uploadPhotoButton")}
        </button>
        {photoFile && (
          <button
            type="button"
            onClick={() => setView(v => (v === "edit" ? "preview" : "edit"))}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 px-4 py-3 text-xs font-extrabold uppercase tracking-wide transition-colors",
              view === "preview"
                ? "border-transparent bg-gradient-to-b from-[#FF5A01] to-[#FDAE15] text-white"
                : "border-[#FF5A01] bg-[#FFE7CF] text-[#FF5A01]",
            )}
          >
            <Eye className="size-4" />
            {view === "edit" ? t("previewLabel") : t("backToEdit")}
          </button>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("previewNote")}</p>
      {downloadError && <p role="alert" className="mb-2 text-sm text-destructive">{downloadError}</p>}
      <button
        type="button"
        disabled={!stepsComplete || downloading}
        onClick={handleDownload}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#FF5A01] to-[#FDAE15] px-4 py-3.5 text-sm font-extrabold uppercase tracking-wide text-primary-foreground transition-opacity disabled:opacity-40"
      >
        <Download className="size-4" />
        {t("downloadButton")}
      </button>

      {resultUrl && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 text-xs font-bold text-muted-foreground">{t("shareTitle")}</div>
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <button
              type="button"
              onClick={() => navigator.share({ title: "Avatar Frame Platform", url: resultUrl })}
              className="w-full rounded-lg border border-input px-4 py-2 text-sm font-semibold"
            >
              {t("shareTitle")}
            </button>
          ) : (
            <div className="flex gap-2">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(resultUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-9 items-center justify-center rounded-lg bg-muted text-xs font-bold text-secondary"
              >
                Facebook
              </a>
              <a
                href={`https://zalo.me/share?u=${encodeURIComponent(resultUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-9 items-center justify-center rounded-lg bg-muted text-xs font-bold text-emerald-600"
              >
                Zalo
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(resultUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-9 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground"
              >
                LinkedIn
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
