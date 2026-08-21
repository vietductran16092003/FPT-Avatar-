"use client";

import { useEffect, useState } from "react";

interface AnalyticsRow {
  slug: string;
  title: string;
  count: number;
  status: string;
}

export default function AdminAnalyticsPage() {
  const [rows, setRows] = useState<AnalyticsRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load analytics");
        return res.json();
      })
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError(true));
  }, []);

  const max = Math.max(1, ...(rows ?? []).map(r => r.count));
  const totalDownloads = (rows ?? []).reduce((sum, r) => sum + r.count, 0);
  const activeCampaigns = (rows ?? []).filter(r => r.status === "active").length;
  const topCampaign = rows && rows.length > 0 ? rows[0].title : "—";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Thống kê</h1>

      {rows !== null && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tổng lượt tải</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{totalDownloads}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Campaign đang chạy</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{activeCampaigns}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Nhiều lượt tải nhất</div>
            <div className="mt-1 truncate text-base font-bold" title={topCampaign}>🏆 {topCampaign}</div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 text-sm font-bold text-foreground">Lượt tạo avatar theo Campaign</div>

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
    </div>
  );
}
