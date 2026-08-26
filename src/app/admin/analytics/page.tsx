"use client";

import { useEffect, useState } from "react";
import { useAdminLang } from "@/lib/admin-i18n";
import { BY_UNIT_PLACEHOLDER } from "@/lib/analytics-placeholder";

interface AnalyticsRow {
  slug: string;
  title: string;
  count: number;
  status: string;
}

interface DayCount {
  day: string;
  count: number;
}

interface FieldRow {
  name: string;
  value: number;
}

export default function AdminAnalyticsPage() {
  const { t } = useAdminLang();
  const [rows, setRows] = useState<AnalyticsRow[] | null>(null);
  const [byDay, setByDay] = useState<DayCount[]>([]);
  // null means "GA4 not configured yet" (server-side fetchDownloadsByField
  // returned null) — falls back to the illustrative placeholder below.
  const [byField, setByField] = useState<FieldRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load analytics");
        return res.json();
      })
      .then(data => {
        setRows(Array.isArray(data.campaigns) ? data.campaigns : []);
        setByDay(Array.isArray(data.byDay) ? data.byDay : []);
        setByField(Array.isArray(data.byField) ? data.byField : null);
      })
      .catch(() => setError(true));
  }, []);

  const max = Math.max(1, ...(rows ?? []).map(r => r.count));
  const totalDownloads = (rows ?? []).reduce((sum, r) => sum + r.count, 0);
  const activeCampaigns = (rows ?? []).filter(r => r.status === "active").length;
  const topCampaign = rows && rows.length > 0 ? rows[0].title : "—";
  const maxDay = Math.max(1, ...byDay.map(d => d.count));
  const unitRows = byField ?? BY_UNIT_PLACEHOLDER;
  const maxUnit = Math.max(1, ...unitRows.map(u => u.value));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("adminAnalytics")}</h1>

      {rows !== null && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("kpiTotal")}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{totalDownloads}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("kpiActive")}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{activeCampaigns}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("kpiTop")}</div>
            <div className="mt-1 truncate text-base font-bold" title={topCampaign}>🏆 {topCampaign}</div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 text-sm font-bold text-foreground">{t("byCampaign")}</div>

        {error && <p className="text-sm text-destructive">Không tải được dữ liệu. Vui lòng thử lại.</p>}
        {!error && rows === null && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {!error && rows !== null && rows.length === 0 && <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>}

        <div className="flex flex-col gap-3">
          {rows?.map(row => {
            const pct = Math.round((row.count / max) * 100);
            return (
              <div key={row.slug}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.title}</span>
                  <span className="tabular-nums text-muted-foreground">{row.count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {rows !== null && rows.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 text-sm font-bold text-foreground">{t("byDay")}</div>
          <div className="flex h-32 items-end gap-2.5">
            {byDay.map(d => (
              <div key={d.day} data-testid="day-chart-col" className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div
                  className="w-full rounded-t-md bg-[#00A651]"
                  style={{ height: `${Math.round((d.count / maxDay) * 100)}%` }}
                />
                <div className="text-[11px] text-muted-foreground">{d.day.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 text-sm font-bold text-foreground">
            {t("byUnit")}
            {byField === null && <span className="ml-1 text-xs font-normal text-muted-foreground">{t("liveDataNote")}</span>}
          </div>
          <div className="flex flex-col gap-3">
            {unitRows.map(u => {
              const pct = Math.round((u.value / maxUnit) * 100);
              return (
                <div key={u.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{u.name}</span>
                    <span className="tabular-nums text-muted-foreground">{u.value}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-secondary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
