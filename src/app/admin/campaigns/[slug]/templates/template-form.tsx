"use client";

import { useState, FormEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TextOverlay } from "@/lib/compositing/overlay-layout";

const MAX_FRAME_IMAGE_BYTES = 5 * 1024 * 1024;

interface TemplateOverlayConfig {
  photoArea: { x: number; y: number; w: number; h: number };
  textOverlays: TextOverlay[];
}

interface TemplateDraft {
  name: string;
  frameImage: File | null;
  overlayConfig: TemplateOverlayConfig;
}

interface TemplateInitial {
  name: string;
  overlayConfig: TemplateOverlayConfig;
}

function emptyOverlay(): TextOverlay {
  return { key: "", label: "", labelEn: "", type: "text", x: 50, y: 50, fontSize: 20, color: "#ffffff" };
}

export function TemplateForm({ onSubmit, initial }: { onSubmit: (draft: TemplateDraft) => void; initial?: TemplateInitial }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [frameImage, setFrameImage] = useState<File | null>(null);
  const [photoArea, setPhotoArea] = useState(initial?.overlayConfig.photoArea ?? { x: 20, y: 20, w: 60, h: 60 });
  const [overlays, setOverlays] = useState<TextOverlay[]>(initial?.overlayConfig.textOverlays ?? []);
  const [error, setError] = useState<string | null>(null);

  function updateOverlay(index: number, patch: Partial<TextOverlay>) {
    setOverlays(list => list.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function removeOverlay(index: number) {
    setOverlays(list => list.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || (!initial && !frameImage)) {
      setError("Vui lòng điền Tên khung và chọn Ảnh khung.");
      return;
    }
    setError(null);
    onSubmit({ name, frameImage, overlayConfig: { photoArea, textOverlays: overlays } });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label htmlFor="template-name">Tên khung</Label>
        <Input id="template-name" value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="template-frame">Ảnh khung (PNG){initial && " (để trống nếu giữ ảnh cũ)"}</Label>
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/40 p-4 text-center">
          <Input
            id="template-frame"
            type="file"
            accept="image/png"
            onChange={e => {
              const file = e.target.files?.[0] ?? null;
              if (file && file.size > MAX_FRAME_IMAGE_BYTES) {
                setError("File ảnh khung vượt quá 5MB, vui lòng chọn file nhỏ hơn.");
                setFrameImage(null);
                e.target.value = "";
                return;
              }
              setError(null);
              setFrameImage(file);
            }}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Vùng ảnh cá nhân (%)</legend>
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label htmlFor="photo-area-x">X</Label>
            <Input id="photo-area-x" type="number" value={photoArea.x} onChange={e => setPhotoArea(a => ({ ...a, x: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="photo-area-y">Y</Label>
            <Input id="photo-area-y" type="number" value={photoArea.y} onChange={e => setPhotoArea(a => ({ ...a, y: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="photo-area-w">Rộng</Label>
            <Input id="photo-area-w" type="number" value={photoArea.w} onChange={e => setPhotoArea(a => ({ ...a, w: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="photo-area-h">Cao</Label>
            <Input id="photo-area-h" type="number" value={photoArea.h} onChange={e => setPhotoArea(a => ({ ...a, h: Number(e.target.value) }))} />
          </div>
        </div>
      </fieldset>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Trường overlay chữ</span>
          <Button type="button" variant="secondary" onClick={() => setOverlays(list => [...list, emptyOverlay()])}>
            Thêm trường overlay
          </Button>
        </div>

        {overlays.map((overlay, index) => (
          <fieldset key={index} className="space-y-2 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor={`overlay-key-${index}`}>Khóa (key)</Label>
              <Input id={`overlay-key-${index}`} value={overlay.key} onChange={e => updateOverlay(index, { key: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`overlay-label-${index}`}>Nhãn tiếng Việt</Label>
              <Input id={`overlay-label-${index}`} value={overlay.label} onChange={e => updateOverlay(index, { label: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`overlay-label-en-${index}`}>Nhãn tiếng Anh</Label>
              <Input id={`overlay-label-en-${index}`} value={overlay.labelEn} onChange={e => updateOverlay(index, { labelEn: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`overlay-type-${index}`}>Loại</Label>
              <Select value={overlay.type} onValueChange={v => updateOverlay(index, { type: v as "text" | "select" })}>
                <SelectTrigger id={`overlay-type-${index}`}>
                  <SelectValue>{(v: string) => ({ text: "Tự do", select: "Danh sách chọn" }[v] ?? v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Tự do</SelectItem>
                  <SelectItem value="select">Danh sách chọn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {overlay.type === "select" && (
              <div className="space-y-1">
                <Label htmlFor={`overlay-options-${index}`}>Các lựa chọn (phân cách bằng dấu phẩy)</Label>
                <Input
                  id={`overlay-options-${index}`}
                  value={overlay.options?.join(", ") ?? ""}
                  onChange={e => updateOverlay(index, { options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                />
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`overlay-x-${index}`}>X</Label>
                <Input id={`overlay-x-${index}`} type="number" value={overlay.x} onChange={e => updateOverlay(index, { x: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`overlay-y-${index}`}>Y</Label>
                <Input id={`overlay-y-${index}`} type="number" value={overlay.y} onChange={e => updateOverlay(index, { y: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`overlay-fontsize-${index}`}>Cỡ chữ</Label>
                <Input id={`overlay-fontsize-${index}`} type="number" value={overlay.fontSize} onChange={e => updateOverlay(index, { fontSize: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`overlay-color-${index}`}>Màu chữ</Label>
                <Input id={`overlay-color-${index}`} type="color" value={overlay.color} onChange={e => updateOverlay(index, { color: e.target.value })} />
              </div>
            </div>
            <Button type="button" variant="ghost" onClick={() => removeOverlay(index)}>
              Xóa trường này
            </Button>
          </fieldset>
        ))}
      </div>

      <Button type="submit">{initial ? "Cập nhật khung" : "Lưu khung"}</Button>
    </form>
  );
}
