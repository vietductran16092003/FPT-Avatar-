"use client";

import { useState, FormEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CampaignDraft {
  slug: string;
  status: "draft" | "active";
  startDate: string;
  endDate: string;
  language: "vi" | "en";
  displayConfig: { title: string; description: string; ctaLabel: string };
}

export function CampaignForm({ onSubmit, initial }: { onSubmit: (draft: CampaignDraft) => void; initial?: CampaignDraft }) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [status, setStatus] = useState<"draft" | "active">(initial?.status ?? "draft");
  const [title, setTitle] = useState(initial?.displayConfig.title ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [language, setLanguage] = useState<"vi" | "en">(initial?.language ?? "vi");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slug || !title || !startDate || !endDate) {
      setError("Vui lòng điền đủ Slug, Tiêu đề, Ngày bắt đầu và Ngày kết thúc.");
      return;
    }
    if (startDate > endDate) {
      setError("Ngày bắt đầu phải trước ngày kết thúc.");
      return;
    }
    setError(null);
    onSubmit({
      slug,
      status,
      startDate,
      endDate,
      language,
      displayConfig: { title, description: initial?.displayConfig.description ?? "", ctaLabel: initial?.displayConfig.ctaLabel ?? "Tạo avatar ngay" },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="campaign-slug">Slug</Label>
        <Input id="campaign-slug" value={slug} onChange={e => setSlug(e.target.value)} readOnly={!!initial} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="campaign-title">Tiêu đề</Label>
        <Input id="campaign-title" value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="campaign-start">Ngày bắt đầu</Label>
        <Input id="campaign-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="campaign-end">Ngày kết thúc</Label>
        <Input id="campaign-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="campaign-language">Ngôn ngữ</Label>
        <Select value={language} onValueChange={v => setLanguage(v as "vi" | "en")}>
          <SelectTrigger id="campaign-language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vi">Tiếng Việt</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="campaign-status">Trạng thái</Label>
        <Select value={status} onValueChange={v => setStatus(v as "draft" | "active")}>
          <SelectTrigger id="campaign-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Nháp</SelectItem>
            <SelectItem value="active">Hoạt động</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit">{initial ? "Cập nhật" : "Lưu"}</Button>
    </form>
  );
}
