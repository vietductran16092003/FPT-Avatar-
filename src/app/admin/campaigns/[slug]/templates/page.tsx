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
    await fetch(`/api/admin/campaigns/${slug}/templates/${id}`, { method: "DELETE" });
    loadTemplates();
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Quản lý Khung — {slug}</h1>

      <ul className="space-y-1">
        {templates.map(t => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <span>{t.name}</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(t)}>
                Sửa
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(t.id)}>
                Xóa
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}

      {editing && (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setEditing(null)}>
          Hủy sửa, tạo khung mới
        </Button>
      )}

      <fieldset disabled={submitting} aria-busy={submitting}>
        <TemplateForm
          key={editing?.id ?? "new"}
          initial={editing ? { name: editing.name, overlayConfig: editing.overlayConfig } : undefined}
          onSubmit={editing ? handleUpdate : handleCreate}
        />
      </fieldset>
    </div>
  );
}
