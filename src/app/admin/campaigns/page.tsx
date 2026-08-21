"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
    await fetch(`/api/admin/campaigns/${slug}`, { method: "DELETE" });
    loadCampaigns();
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Quản lý Campaign</h1>

      <ul className="space-y-1">
        {campaigns.map(c => (
          <li key={c.slug} className="flex items-center justify-between gap-2">
            <span>{c.slug} — {c.status}</span>
            <div className="flex items-center gap-2">
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
          </li>
        ))}
      </ul>

      {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}

      {editing && (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setEditing(null)}>
          Hủy sửa, tạo Campaign mới
        </Button>
      )}

      <fieldset disabled={submitting} aria-busy={submitting}>
        <CampaignForm key={editing?.slug ?? "new"} initial={editing ?? undefined} onSubmit={editing ? handleUpdate : handleCreate} />
      </fieldset>
    </div>
  );
}
