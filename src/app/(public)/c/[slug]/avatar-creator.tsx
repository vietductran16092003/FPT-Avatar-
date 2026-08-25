"use client";

import { useEffect, useRef, useState } from "react";
import { useAvatarCanvas, CANVAS_SIZE } from "./use-avatar-canvas";
import { resolveOverlayDraws, type TextOverlay } from "@/lib/compositing/overlay-layout";
import { PublicLangProvider, usePublicLang } from "@/lib/public-i18n";
import { pickLocalized, type DisplayConfigLike } from "@/lib/localized-content";
import { cn } from "@/lib/utils";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

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
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { setPhoto, setFrame, setOverlays, getTransform, zoomBy, ZOOM_STEP } = useAvatarCanvas(canvasRef);

  const selected = templates.find(t => t.id === selectedId)!;

  function selectTemplate(id: string) {
    setSelectedId(id);
    setOverlayValues({});
    setResultUrl(null);
  }

  function stagePhotoFile(file: File) {
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`Ảnh vượt quá 10MB, vui lòng chọn ảnh nhỏ hơn.`);
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
    setResultUrl(null);
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
    const draws = resolveOverlayDraws(selected.overlayConfig.textOverlays, overlayValues, CANVAS_SIZE, CANVAS_SIZE, lang);
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
    <div className="mx-auto max-w-5xl p-6 pb-24 lg:pb-6">
      {campaignTitle && (
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight">{campaignTitle}</h1>
      )}
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
      <div className={cn("flex flex-col gap-8", mobileView === "preview" && "hidden lg:flex")}>
        <div>
          <div className="mb-1 text-lg font-extrabold tracking-tight">{t("stepUpload")}</div>
          <div className="mb-3 text-[13px] text-muted-foreground">{t("stepUploadHint")}</div>
          {photoError && <p role="alert" className="mb-2 text-sm text-destructive">{photoError}</p>}
          <label
            htmlFor="photo-input"
            data-testid="photo-dropzone"
            className="cursor-pointer"
            onDragOver={e => {
              e.preventDefault();
              setIsDraggingPhoto(true);
            }}
            onDragLeave={() => setIsDraggingPhoto(false)}
            onDrop={handlePhotoDrop}
          >
            {photoFile ? (
              <div className="flex items-center gap-3">
                <img src={photoPreviewUrl ?? undefined} alt="" className="size-20 rounded-full border border-border object-cover" />
                <span className="text-sm font-semibold text-primary">{t("changePhoto")}</span>
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
                  isDraggingPhoto ? "border-primary bg-primary/10" : "border-border bg-muted/40",
                )}
              >
                <div className="mb-1 text-base font-bold">{t("dropTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("dropSub")}</div>
              </div>
            )}
          </label>
          <input ref={photoInputRef} id="photo-input" aria-label={t("stepUpload")} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoChange} />
        </div>

        <div>
          <div className="mb-3 text-lg font-extrabold tracking-tight">{t("stepTemplate")}</div>
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
          <div className="mb-3 text-lg font-extrabold tracking-tight">{t("stepOverlay")}</div>
          <div className="flex flex-col gap-3">
            {selected.overlayConfig.textOverlays.map(overlay => (
              <div key={overlay.key} className="space-y-1">
                <label htmlFor={`overlay-${overlay.key}`} className="text-xs font-bold tracking-wide text-muted-foreground">
                  {overlay.label}
                </label>
                {overlay.type === "select" || overlay.type === "yearsSince" ? (
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

      <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", mobileView === "edit" && "hidden lg:block")}>
        <button type="button" onClick={() => setMobileView("edit")} className="mb-3 text-xs font-semibold text-muted-foreground lg:hidden">
          {t("backToEdit")}
        </button>
        <div className="mb-3 text-lg font-extrabold tracking-tight">{t("previewTitle")}</div>
        <div className="relative mx-auto mb-2 w-full max-w-[480px] overflow-hidden rounded-xl" style={{ aspectRatio: "1 / 1", boxShadow: "inset 0 0 0 1px rgba(16,30,46,.16)" }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="h-full w-full touch-none"
            style={{ cursor: photoImg ? "grab" : "default" }}
          />
        </div>
        {photoImg && (
          <div className="mb-3 flex items-center justify-center gap-2">
            <button type="button" onClick={() => zoomBy(-ZOOM_STEP)} className="flex size-7 items-center justify-center rounded-lg border border-input text-sm font-bold">−</button>
            <span className="text-xs text-muted-foreground">{t("zoomHint")}</span>
            <button type="button" onClick={() => zoomBy(ZOOM_STEP)} className="flex size-7 items-center justify-center rounded-lg border border-input text-sm font-bold">+</button>
          </div>
        )}
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t("previewNote")}</p>
        {downloadError && <p role="alert" className="mb-2 text-sm text-destructive">{downloadError}</p>}
        <button
          type="button"
          disabled={!stepsComplete || downloading}
          onClick={handleDownload}
          className="mb-2 hidden w-full rounded-full bg-gradient-to-b from-[#FF5A01] to-[#FDAE15] px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 lg:block"
        >
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
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2 border-t border-border bg-background p-3 lg:hidden">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className="flex-1 rounded-full border border-[#FF5A01] bg-[#FFE7CF] px-3 py-3 text-xs font-bold text-[#FF5A01]"
        >
          {photoFile ? t("changePhotoButton") : t("uploadPhotoButton")}
        </button>
        <button
          type="button"
          onClick={() => setMobileView("preview")}
          className="flex-1 rounded-full border border-[#FF5A01] bg-[#FFE7CF] px-3 py-3 text-xs font-bold text-[#FF5A01]"
        >
          {t("previewLabel")}
        </button>
        <button
          type="button"
          disabled={!stepsComplete || downloading}
          onClick={handleDownload}
          className="flex-1 rounded-full bg-gradient-to-b from-[#FF5A01] to-[#FDAE15] px-3 py-3 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          {t("downloadButton")}
        </button>
      </div>
    </div>
  );
}
