"use client";

import { useState, FormEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TextOverlay } from "@/lib/compositing/overlay-layout";
import { COMPONENT_PRESETS, type ComponentPreset } from "@/lib/component-presets";

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

function presetOverlay(preset: ComponentPreset): TextOverlay {
  return {
    key: preset.key,
    label: preset.label,
    labelEn: preset.labelEn,
    type: preset.type,
    options: preset.options,
    placeholder: preset.placeholder,
    x: 50,
    y: 50,
    fontSize: 20,
    color: "#ffffff",
  };
}

function overlaysMatch(a: TextOverlay, b: TextOverlay): boolean {
  return (
    a.key === b.key &&
    a.label === b.label &&
    a.labelEn === b.labelEn &&
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.placeholder === b.placeholder &&
    JSON.stringify(a.options ?? []) === JSON.stringify(b.options ?? [])
  );
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

  function togglePreset(preset: ComponentPreset) {
    const index = overlays.findIndex(o => o.key === preset.key);
    if (index === -1) {
      setOverlays(list => [...list, presetOverlay(preset)]);
      return;
    }
    const current = overlays[index];
    const isUnmodified = overlaysMatch(current, presetOverlay(preset));
    if (!isUnmodified && !window.confirm(`Trường "${preset.label}" đã được chỉnh sửa. Xoá trường này khỏi khung?`)) {
      return;
    }
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

      <fieldset className="space-y-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-medium">Thêm nhanh trường phổ biến</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COMPONENT_PRESETS.map(preset => (
            <label key={preset.key} htmlFor={`preset-${preset.key}`} className="flex items-center gap-2 text-sm">
              <input
                id={`preset-${preset.key}`}
                type="checkbox"
                checked={overlays.some(o => o.key === preset.key)}
                onChange={() => togglePreset(preset)}
              />
              {preset.label}
            </label>
          ))}
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
