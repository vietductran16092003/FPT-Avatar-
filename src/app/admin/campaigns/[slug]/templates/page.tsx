"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TemplateForm } from "./template-form";

export default function AdminTemplatesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [templates, setTemplates] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function loadTemplates() {
    fetch(`/api/admin/campaigns/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load campaign");
        return res.json();
      })
      .then(data => setTemplates(Array.isArray(data.templates) ? data.templates : []))
      .catch(() => setTemplates([]));
  }

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handleCreate(draft: { name: string; frameImage: File | null; overlayConfig: unknown }) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const form = new FormData();
      form.set("name", draft.name);
      form.set("frameImage", draft.frameImage!);
      form.set("overlayConfig", JSON.stringify(draft.overlayConfig));

      const res = await fetch(`/api/admin/campaigns/${slug}/templates`, { method: "POST", body: form });
      if (!res.ok) {
        setSubmitError("Không tạo được khung. Vui lòng thử lại.");
        return;
      }
      loadTemplates();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(draft: { name: string; frameImage: File | null; overlayConfig: unknown }) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${slug}/templates/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, overlayConfig: draft.overlayConfig }),
      });
      if (!res.ok) {
        setSubmitError("Không cập nhật được khung. Vui lòng thử lại.");
        return;
      }
      setEditing(null);
      loadTemplates();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Xóa khung này? Không thể hoàn tác.")) return;
    await fetch(`/api/admin/campaigns/${slug}/templates/${id}`, { method: "DELETE" });
    loadTemplates();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quản lý Khung — {slug}</h1>
        {editing === null && (
          <Button type="button" onClick={() => setEditing(undefined as any)}>
            + Khung mới
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {templates.map(t => (
          <div key={t.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="relative aspect-square bg-gradient-to-br from-primary/20 to-secondary/10">
              <div className="absolute inset-[8%] rounded-lg border-[6px] border-primary/60" />
            </div>
            <div className="p-3">
              <div className="mb-1 truncate text-sm font-bold">{t.name}</div>
              <div className="mb-3 font-mono text-[11px] text-muted-foreground">
                x:{t.overlayConfig?.photoArea?.x}% y:{t.overlayConfig?.photoArea?.y}% {t.overlayConfig?.photoArea?.w}×{t.overlayConfig?.photoArea?.h}%
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setEditing(t)}>
                  Sửa
                </Button>
                <Button type="button" variant="destructive" size="sm" className="flex-1" onClick={() => handleDelete(t.id)}>
                  Xóa
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}

      {editing !== null && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-bold">{editing ? "Sửa khung" : "Khung mới"}</div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Đóng
            </Button>
          </div>
          <fieldset disabled={submitting} aria-busy={submitting}>
            <TemplateForm
              key={editing?.id ?? "new"}
              initial={editing ? { name: editing.name, overlayConfig: editing.overlayConfig } : undefined}
              onSubmit={editing ? handleUpdate : handleCreate}
            />
          </fieldset>
        </div>
      )}
    </div>
  );
}
