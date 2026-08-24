"use client";

import { useEffect, useRef, useState } from "react";
import { renderPreview } from "@/lib/compositing/browser-compositor";
import type { TextOverlay } from "@/lib/compositing/overlay-layout";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Template {
  id: string;
  name: string;
  frameImageKey: string;
  overlayConfig: { photoArea: { x: number; y: number; w: number; h: number }; textOverlays: TextOverlay[] };
}

export function CampaignCompositor({ templates }: { templates: Template[] }) {
  const [selected, setSelected] = useState<Template | null>(null);
  const [overlayValues, setOverlayValues] = useState<Record<string, string>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameImgRef = useRef<HTMLImageElement | null>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!selected) return;
    const frameImg = new Image();
    frameImg.src = selected.frameImageKey;
    frameImgRef.current = frameImg;
  }, [selected]);

  useEffect(() => {
    if (!photoUrl) return;
    const photoImg = new Image();
    photoImg.src = photoUrl;
    photoImgRef.current = photoImg;
  }, [photoUrl]);

  useEffect(() => {
    if (!selected || !canvasRef.current || !frameImgRef.current || !photoImgRef.current) return;
    renderPreview(canvasRef.current, frameImgRef.current, photoImgRef.current, selected.overlayConfig.photoArea, selected.overlayConfig.textOverlays, overlayValues);
  }, [selected, overlayValues, photoUrl]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <div className="space-y-2">
        <Label>Chọn khung</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {templates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t)}
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition-colors",
                selected?.id === t.id ? "border-primary" : "border-border hover:border-primary/50",
              )}
            >
              <div className="relative aspect-square bg-gradient-to-br from-primary/20 to-secondary/10">
                <div className="absolute inset-[8%] rounded-lg border-[6px] border-primary/60" />
              </div>
              <div className="truncate p-2 text-center text-xs font-semibold">{t.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="photo-input">Ảnh cá nhân</Label>
        <Input
          id="photo-input"
          type="file"
          accept="image/*"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) setPhotoUrl(URL.createObjectURL(file));
          }}
        />
      </div>

      {selected?.overlayConfig.textOverlays.map(overlay => (
        <div key={overlay.key} className="space-y-2">
          <Label htmlFor={`overlay-${overlay.key}`}>{overlay.label}</Label>
          <Input
            id={`overlay-${overlay.key}`}
            placeholder={overlay.placeholder}
            onChange={e => setOverlayValues(v => ({ ...v, [overlay.key]: e.target.value }))}
          />
        </div>
      ))}

      <canvas ref={canvasRef} width={800} height={800} className="w-full rounded-md border" />
    </div>
  );
}
