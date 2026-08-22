"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CampaignForm } from "./campaign-form";
import { TemplateForm } from "./template-form";
import { useAdminLang } from "@/lib/admin-i18n";
import { pickLocalized } from "@/lib/localized-content";

export default function AdminCampaignsPage() {
  const { lang, t } = useAdminLang();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<any[]>([]);
  const [templateEditing, setTemplateEditing] = useState<any | null>(null);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

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

  function loadTemplates(slug: string) {
    fetch(`/api/admin/campaigns/${slug}`)
      .then(res => (res.ok ? res.json() : { templates: [] }))
      .then(data => setTemplates(Array.isArray(data.templates) ? data.templates : []))
      .catch(() => setTemplates([]));
  }

  const editingSlug: string | null = editing && editing.slug ? editing.slug : null;

  useEffect(() => {
    if (editingSlug) {
      loadTemplates(editingSlug);
    } else {
      setTemplates([]);
    }
    setTemplateEditing(null);
    setTemplateError(null);
  }, [editingSlug]);

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
        const data = await res.json().catch(() => null);
        setSubmitError(data?.error ?? "Không tạo được Campaign. Vui lòng thử lại.");
        return;
      }
      const created = await res.json();
      loadCampaigns();
      setEditing(created);
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

  const STATUS_CYCLE = ["draft", "active", "archived"];

  async function handleCycleStatus(slug: string, currentStatus: string) {
    const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length];
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

  async function handleTemplateCreate(draft: { name: string; frameImage: File | null; overlayConfig: unknown }) {
    setTemplateSubmitting(true);
    setTemplateError(null);
    try {
      const form = new FormData();
      form.set("name", draft.name);
      form.set("frameImage", draft.frameImage!);
      form.set("overlayConfig", JSON.stringify(draft.overlayConfig));
      const res = await fetch(`/api/admin/campaigns/${editingSlug}/templates`, { method: "POST", body: form });
      if (!res.ok) {
        setTemplateError("Không tạo được khung. Vui lòng thử lại.");
        return;
      }
      setTemplateEditing(null);
      loadTemplates(editingSlug!);
    } finally {
      setTemplateSubmitting(false);
    }
  }

  async function handleTemplateUpdate(draft: { name: string; frameImage: File | null; overlayConfig: unknown }) {
    setTemplateSubmitting(true);
    setTemplateError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${editingSlug}/templates/${templateEditing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, overlayConfig: draft.overlayConfig }),
      });
      if (!res.ok) {
        setTemplateError("Không cập nhật được khung. Vui lòng thử lại.");
        return;
      }
      setTemplateEditing(null);
      loadTemplates(editingSlug!);
    } finally {
      setTemplateSubmitting(false);
    }
  }

  async function handleTemplateDelete(id: string) {
    if (!window.confirm("Xóa khung này? Không thể hoàn tác.")) return;
    await fetch(`/api/admin/campaigns/${editingSlug}/templates/${id}`, { method: "DELETE" });
    loadTemplates(editingSlug!);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("adminCampaigns")}</h1>
        {editing === null && (
          <Button type="button" onClick={() => setEditing(undefined as any)}>
            {t("adminNewCampaign")}
          </Button>
        )}
      </div>

      <div className="overflow-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-muted text-left">
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colSlug")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colTitle")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colLang")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colTime")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colStatus")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colTemplates")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.slug} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">/c/{c.slug}</td>
                <td className="px-4 py-3 font-semibold">{pickLocalized(c.displayConfig, "title", lang) || c.slug}</td>
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
                      c.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : c.status === "archived"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {c.status === "active" ? t("statusOptActive") : c.status === "archived" ? t("statusOptArchived") : t("statusOptDraft")}
                  </button>
                </td>
                <td className="px-4 py-3 tabular-nums">{c._count?.templates ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(c)}>
                      {t("adminEdit")}
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(c.slug)}>
                      {t("adminDelete")}
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
            <div className="text-sm font-bold">{editing ? t("campaignFormTitle") : t("adminNewCampaign")}</div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              {t("adminCancel")}
            </Button>
          </div>
          <fieldset disabled={submitting} aria-busy={submitting}>
            <CampaignForm key={editing?.slug ?? "new"} initial={editing ?? undefined} onSubmit={editing ? handleUpdate : handleCreate} />
          </fieldset>

          <div className="mt-6 border-t border-border pt-5">
            <div className="mb-3">
              <div className="text-[15px] font-bold">{t("campaignFramesTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("campaignFramesHint")}</div>
            </div>

            {editingSlug ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {templates.map(tpl => (
                    <div key={tpl.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                      <div className="relative aspect-square bg-[repeating-conic-gradient(#eef1f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                        {tpl.frameImageUrl ? (
                          <img src={tpl.frameImageUrl} alt={tpl.name} className="h-full w-full object-contain" />
                        ) : (
                          <div className="absolute inset-[8%] rounded-lg border-[6px] border-primary/60" />
                        )}
                      </div>
                      <div className="p-3">
                        <div className="mb-1 truncate text-sm font-bold">{tpl.name}</div>
                        <div className="mb-3 font-mono text-[11px] text-muted-foreground">
                          x:{tpl.overlayConfig?.photoArea?.x}% y:{tpl.overlayConfig?.photoArea?.y}% {tpl.overlayConfig?.photoArea?.w}×{tpl.overlayConfig?.photoArea?.h}%
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setTemplateEditing(tpl)}>
                            {t("adminEdit")}
                          </Button>
                          <Button type="button" variant="destructive" size="sm" className="flex-1" onClick={() => handleTemplateDelete(tpl.id)}>
                            Xóa khung
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {templateEditing === null && (
                  <Button type="button" size="sm" onClick={() => setTemplateEditing(undefined as any)}>
                    {t("adminNewTemplate")}
                  </Button>
                )}

                {templateError && <p role="alert" className="mt-2 text-sm text-destructive">{templateError}</p>}

                {templateEditing !== null && (
                  <div className="mt-4 rounded-2xl border border-border bg-background p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-sm font-bold">{templateEditing ? t("templateFormTitle") : t("adminNewTemplate")}</div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setTemplateEditing(null)}>
                        {t("adminCancel")}
                      </Button>
                    </div>
                    <fieldset disabled={templateSubmitting} aria-busy={templateSubmitting}>
                      <TemplateForm
                        key={templateEditing?.id ?? "new"}
                        initial={templateEditing ? { name: templateEditing.name, overlayConfig: templateEditing.overlayConfig } : undefined}
                        onSubmit={templateEditing ? handleTemplateUpdate : handleTemplateCreate}
                      />
                    </fieldset>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs italic text-muted-foreground">{t("saveThisCampaignFirst")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
