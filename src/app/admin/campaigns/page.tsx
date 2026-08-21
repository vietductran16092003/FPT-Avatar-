"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CampaignForm } from "./campaign-form";

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function loadCampaigns() {
    fetch("/api/admin/campaigns")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load campaigns");
        return res.json();
      })
      .then(data => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => setCampaigns([]));
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function handleCreate(draft: any) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        setSubmitError("Không tạo được Campaign. Vui lòng thử lại.");
        return;
      }
      loadCampaigns();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(draft: any) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${editing.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draft.status,
          startDate: draft.startDate,
          endDate: draft.endDate,
          language: draft.language,
          displayConfig: draft.displayConfig,
        }),
      });
      if (!res.ok) {
        setSubmitError("Không cập nhật được Campaign. Vui lòng thử lại.");
        return;
      }
      setEditing(null);
      loadCampaigns();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!window.confirm(`Xóa campaign "${slug}"? Không thể hoàn tác.`)) return;
    await fetch(`/api/admin/campaigns/${slug}`, { method: "DELETE" });
    loadCampaigns();
  }

  async function handleCycleStatus(slug: string, currentStatus: string) {
    const nextStatus = currentStatus === "active" ? "draft" : "active";
    const res = await fetch(`/api/admin/campaigns/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      setSubmitError("Không đổi được trạng thái. Vui lòng thử lại.");
      return;
    }
    loadCampaigns();
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quản lý Campaign</h1>
        {editing === null && (
          <Button type="button" onClick={() => setEditing(undefined as any)}>
            + Campaign mới
          </Button>
        )}
      </div>

      <div className="overflow-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-muted text-left">
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Slug</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tiêu đề</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ngôn ngữ</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Thời gian</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Trạng thái</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Số khung</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.slug} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">/c/{c.slug}</td>
                <td className="px-4 py-3 font-semibold">{c.displayConfig?.title ?? c.slug}</td>
                <td className="px-4 py-3 uppercase">{c.language}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {String(c.startDate).slice(0, 10)} – {String(c.endDate).slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleCycleStatus(c.slug, c.status)}
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-bold transition-opacity hover:opacity-80",
                      c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {c.status === "active" ? "Hoạt động" : "Nháp"}
                  </button>
                </td>
                <td className="px-4 py-3 tabular-nums">{c._count?.templates ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/campaigns/${c.slug}/templates`} className="text-sm text-primary underline-offset-4 hover:underline">
                      Quản lý khung
                    </Link>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(c)}>
                      Sửa
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(c.slug)}>
                      Xóa
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}

      {editing !== null && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-bold">{editing ? "Sửa Campaign" : "Campaign mới"}</div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Đóng
            </Button>
          </div>
          <fieldset disabled={submitting} aria-busy={submitting}>
            <CampaignForm key={editing?.slug ?? "new"} initial={editing ?? undefined} onSubmit={editing ? handleUpdate : handleCreate} />
          </fieldset>
        </div>
      )}
    </div>
  );
}
