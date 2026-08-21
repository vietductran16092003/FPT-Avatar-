"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CampaignForm } from "./campaign-form";

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/campaigns")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load campaigns");
        return res.json();
      })
      .then(data => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => setCampaigns([]));
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
      const listRes = await fetch("/api/admin/campaigns");
      setCampaigns(await listRes.json());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Quản lý Campaign</h1>
      <ul className="space-y-1">
        {campaigns.map(c => (
          <li key={c.slug} className="flex items-center justify-between">
            <span>{c.slug} — {c.status}</span>
            <Link href={`/admin/campaigns/${c.slug}/templates`} className="text-sm text-primary underline-offset-4 hover:underline">
              Quản lý khung
            </Link>
          </li>
        ))}
      </ul>
      {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
      <fieldset disabled={submitting} aria-busy={submitting}>
        <CampaignForm onSubmit={handleCreate} />
      </fieldset>
    </div>
  );
}
