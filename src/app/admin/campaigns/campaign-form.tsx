"use client";

import { useState, FormEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CampaignDraft {
  slug: string;
  status: "draft" | "active" | "archived";
  startDate: string;
  endDate: string;
  language: "vi" | "en";
  displayConfig: {
    title: string;
    titleEn?: string;
    description: string;
    descriptionEn?: string;
    ctaLabel: string;
    ctaEn?: string;
    badge?: string;
  };
}

export function CampaignForm({ onSubmit, initial }: { onSubmit: (draft: CampaignDraft) => void; initial?: CampaignDraft }) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [status, setStatus] = useState<"draft" | "active" | "archived">(initial?.status ?? "draft");
  const [title, setTitle] = useState(initial?.displayConfig.title ?? "");
  const [titleEn, setTitleEn] = useState(initial?.displayConfig.titleEn ?? "");
  const [badge, setBadge] = useState(initial?.displayConfig.badge ?? "");
  const [description, setDescription] = useState(initial?.displayConfig.description ?? "");
  const [descriptionEn, setDescriptionEn] = useState(initial?.displayConfig.descriptionEn ?? "");
  const [ctaLabel, setCtaLabel] = useState(initial?.displayConfig.ctaLabel ?? "Tạo avatar ngay");
  const [ctaEn, setCtaEn] = useState(initial?.displayConfig.ctaEn ?? "");
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
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      setError("Slug chỉ được chứa chữ thường, số và dấu gạch ngang (VD: techweek-2026).");
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
      displayConfig: {
        title,
        titleEn: titleEn || undefined,
        description,
        descriptionEn: descriptionEn || undefined,
        ctaLabel,
        ctaEn: ctaEn || undefined,
        badge: badge || undefined,
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="campaign-slug">Slug</Label>
          <Input id="campaign-slug" value={slug} onChange={e => setSlug(e.target.value)} readOnly={!!initial} />
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
              <SelectValue>{(v: string) => ({ vi: "Tiếng Việt", en: "English" }[v] ?? v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">Tiếng Việt</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-status">Trạng thái</Label>
          <Select value={status} onValueChange={v => setStatus(v as "draft" | "active" | "archived")}>
            <SelectTrigger id="campaign-status">
              <SelectValue>{(v: string) => ({ draft: "Nháp", active: "Hoạt động", archived: "Lưu trữ" }[v] ?? v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Nháp</SelectItem>
              <SelectItem value="active">Hoạt động</SelectItem>
              <SelectItem value="archived">Lưu trữ</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-badge">Badge</Label>
          <Input id="campaign-badge" placeholder="VD: 38" value={badge} onChange={e => setBadge(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="campaign-title">Tiêu đề (VI)</Label>
          <Input id="campaign-title" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-title-en">Tiêu đề (EN)</Label>
          <Input id="campaign-title-en" value={titleEn} onChange={e => setTitleEn(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-cta">Nhãn nút CTA (VI)</Label>
          <Input id="campaign-cta" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-cta-en">Nhãn nút CTA (EN)</Label>
          <Input id="campaign-cta-en" value={ctaEn} onChange={e => setCtaEn(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-description">Mô tả (VI)</Label>
          <textarea
            id="campaign-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-description-en">Mô tả (EN)</Label>
          <textarea
            id="campaign-description-en"
            value={descriptionEn}
            onChange={e => setDescriptionEn(e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        </div>
      </div>
      <div className="rounded-lg border border-[#CFE2F4] bg-[#EAF2FB] p-3 text-xs leading-relaxed text-[#00396B]">
        Mỗi Campaign hỗ trợ song ngữ đầy đủ — điền cả 2 cột VI/EN, người dùng chuyển ngôn ngữ ở góc trên sẽ thấy đúng nội dung tương ứng.
      </div>
      <Button type="submit" className="w-fit">{initial ? "Cập nhật" : "Lưu"}</Button>
    </form>
  );
}
