# Admin/Public UI Demo Parity + Download Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing admin and public pages to visually match `docs/superpowers/demo/` (table-style campaign list, card-grid layouts, status pills) without adding any of the demo's deferred features (i18n toggle, toast, notification bell, fake login modal), and add one new real-data feature: a "Thống kê" (Statistics) admin page showing a horizontal bar chart of generated-avatar counts per Campaign.

**Architecture:** Pure presentational changes to existing Next.js pages/components — no new routes except `/admin/analytics` (UI) and `GET /api/admin/analytics` (API). The bar chart's data comes from `prisma.generatedAvatar` counts grouped by Campaign (already recorded by the Task 6 `/generate` endpoint) — not mocked data like the demo's other charts. All existing component prop interfaces (`CampaignForm`, `TemplateForm`, `CampaignCompositor`) are preserved so existing tests keep passing unless a task explicitly says otherwise.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS (using the FPT brand CSS variables already ported into `src/app/globals.css`), shadcn/ui components, Prisma, Vitest + Testing Library.

**Spec:** This plan has no separate spec document — it implements the bounded design agreed in chat (see conversation): 6 visual-parity areas plus a real-data download-count chart, explicitly excluding the demo's i18n toggle, toast manager, notification bell, and mocked analytics tab.

## Global Constraints

- No new features beyond the 6 agreed visual-parity areas + the analytics chart — do not add i18n toggle, toast manager, notification bell, or a login modal (all explicitly out of scope).
- The Template management page stays at its own route (`/admin/campaigns/[slug]/templates`) — do not nest it inside the Campaign edit form.
- Every admin API route calls `requireAdmin()` first, matching every existing admin route.
- Do not change any existing component's exported prop types (`CampaignForm`, `TemplateForm`, `CampaignCompositor`) — only their internal JSX/className output — so `tests/app/admin/campaign-form.test.tsx` and `tests/app/admin/template-form.test.tsx` keep passing unmodified.
- After every task, run `npx tsc --noEmit` and `npx vitest run` — both must be clean before moving to the next task. Run `npx next build` after the last task.

---

## Task 1: Extend the public `Campaign` type with status/dates for card display

**Files:**
- Modify: `src/app/campaigns-client.ts`

**Interfaces:**
- Consumes: none.
- Produces: `Campaign` interface gains `status: string`, `startDate: string`, `endDate: string` — `GET /api/campaigns` (Task 5, already shipped) already returns these fields on every row; only the TS shape was incomplete. `fetchActiveCampaigns()`'s signature and behavior are unchanged.

- [ ] **Step 1: Add the three fields to the `Campaign` interface**

```ts
// src/app/campaigns-client.ts
import { getBaseUrl } from "@/lib/base-url";

export interface Campaign {
  slug: string;
  status: string;
  startDate: string;
  endDate: string;
  displayConfig: { title: string; description: string; ctaLabel: string; badge?: string };
  language: "vi" | "en";
}

export async function fetchActiveCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns`, { cache: "no-store" });
  return res.json();
}
```

- [ ] **Step 2: Run the existing test to confirm no regression**

Run: `npx vitest run tests/app/campaigns-client.test.ts`
Expected: PASS (the test's mock objects `{ slug: "fpt38" }` still satisfy the widened interface at the JS runtime level — TypeScript only checks call sites, and the test file doesn't annotate its mock literal against `Campaign`).

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns-client.ts
git commit -m "feat: add status/startDate/endDate to public Campaign type for card display"
```

---

## Task 2: Public home page — campaign card grid

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `fetchActiveCampaigns()`, `Campaign` (Task 1).
- Produces: no new exports — `HomePage` remains the default export, same metadata.

- [ ] **Step 1: Replace the `<ul>` list with a styled card grid**

```tsx
// src/app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { fetchActiveCampaigns } from "./campaigns-client";

export const metadata: Metadata = {
  title: "Avatar sự kiện FPT",
  description: "Tạo avatar cá nhân theo khung ảnh của các chiến dịch sự kiện FPT đang diễn ra.",
};

export default async function HomePage() {
  const campaigns = await fetchActiveCampaigns();

  if (campaigns.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center p-6 text-center text-muted-foreground">
        Hiện chưa có chiến dịch nào đang diễn ra.
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map(c => (
        <Link
          key={c.slug}
          href={`/c/${c.slug}`}
          className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="relative aspect-video bg-gradient-to-br from-primary/25 via-primary/10 to-secondary/15">
            <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-[11.5px] font-bold text-emerald-700 shadow-sm">
              Đang diễn ra
            </span>
            {c.displayConfig.badge && (
              <span className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-[11.5px] font-bold text-primary-foreground shadow-sm">
                {c.displayConfig.badge}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-5">
            <div className="text-lg font-bold">{c.displayConfig.title}</div>
            <div className="flex-1 text-[13.5px] leading-relaxed text-muted-foreground">
              {c.displayConfig.description}
            </div>
            <div className="tabular-nums text-xs text-muted-foreground">
              {c.startDate.slice(0, 10)} – {c.endDate.slice(0, 10)}
            </div>
            <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity group-hover:opacity-90">
              {c.displayConfig.ctaLabel}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck and existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all existing tests still pass (this page has no dedicated test file).

- [ ] **Step 3: Visual check in the browser**

Start the dev server (`npm run dev` or the project's `nextjs-dev` preview config), navigate to `/`, and confirm the seeded campaigns (`fpt38`, `techweek-2026`) render as cards with a gradient banner, "Đang diễn ra" pill, title, description, dates, and CTA button.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "style: restyle public home page as a campaign card grid matching the demo"
```

---

## Task 3: Public campaign page — clickable template cards instead of a dropdown

**Files:**
- Modify: `src/app/c/[slug]/campaign-compositor.tsx`

**Interfaces:**
- Consumes: `renderPreview` (existing), `Template` (existing, exported from this same file — unchanged shape).
- Produces: `CampaignCompositor({ templates }: { templates: Template[] })` — same exported signature; only the template-selection markup changes from a `<Select>` to a clickable card grid.

- [ ] **Step 1: Replace the `<Select>` template picker with a card grid**

```tsx
// src/app/c/[slug]/campaign-compositor.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { renderPreview } from "@/lib/compositing/browser-compositor";
import type { TextOverlay } from "@/lib/compositing/overlay-layout";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Template {
  id: string;
  name: string;
  frameImageKey: string;
  overlayConfig: { photoArea: { x: number; y: number; w: number; h: number }; textOverlays: TextOverlay[] };
}

export function CampaignCompositor({ templates }: { templates: Template[] }) {
  const [selected, setSelected] = useState<Template | null>(null);
  const [overlayValues, setOverlayValues] = useState<Record<string, string>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameImgRef = useRef<HTMLImageElement | null>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!selected) return;
    const frameImg = new Image();
    frameImg.src = selected.frameImageKey;
    frameImgRef.current = frameImg;
  }, [selected]);

  useEffect(() => {
    if (!photoUrl) return;
    const photoImg = new Image();
    photoImg.src = photoUrl;
    photoImgRef.current = photoImg;
  }, [photoUrl]);

  useEffect(() => {
    if (!selected || !canvasRef.current || !frameImgRef.current || !photoImgRef.current) return;
    renderPreview(canvasRef.current, frameImgRef.current, photoImgRef.current, selected.overlayConfig.photoArea, selected.overlayConfig.textOverlays, overlayValues);
  }, [selected, overlayValues, photoUrl]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <div className="space-y-2">
        <Label>Chọn khung</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {templates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t)}
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition-colors",
                selected?.id === t.id ? "border-primary" : "border-border hover:border-primary/50",
              )}
            >
              <div className="relative aspect-square bg-gradient-to-br from-primary/20 to-secondary/10">
                <div className="absolute inset-[8%] rounded-lg border-[6px] border-primary/60" />
              </div>
              <div className="truncate p-2 text-center text-xs font-semibold">{t.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="photo-input">Ảnh cá nhân</Label>
        <Input
          id="photo-input"
          type="file"
          accept="image/*"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) setPhotoUrl(URL.createObjectURL(file));
          }}
        />
      </div>

      {selected?.overlayConfig.textOverlays.map(overlay => (
        <div key={overlay.key} className="space-y-2">
          <Label htmlFor={`overlay-${overlay.key}`}>{overlay.label}</Label>
          <Input
            id={`overlay-${overlay.key}`}
            placeholder={overlay.placeholder}
            onChange={e => setOverlayValues(v => ({ ...v, [overlay.key]: e.target.value }))}
          />
        </div>
      ))}

      <canvas ref={canvasRef} width={800} height={800} className="w-full rounded-md border" />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`Select` import removed — confirm nothing else in this file still references it.)

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (no test file exercises `CampaignCompositor` directly).

- [ ] **Step 4: Visual check in the browser**

Navigate to `/c/fpt38`, confirm the template picker now shows clickable cards (not a dropdown), and that clicking a card selects it (visible border highlight) and still renders the canvas preview once a photo is chosen.

- [ ] **Step 5: Commit**

```bash
git add src/app/c/[slug]/campaign-compositor.tsx
git commit -m "style: replace public template dropdown with clickable card grid matching the demo"
```

---

## Task 4: Admin nav — add "Thống kê" (Statistics) item

**Files:**
- Modify: `src/components/admin-shell.tsx`

**Interfaces:**
- Consumes: none.
- Produces: nav now links to `/admin/analytics` in addition to `/admin/campaigns` — `AdminShell`'s exported signature is unchanged.

- [ ] **Step 1: Add the second nav item**

```tsx
// src/components/admin-shell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "campaigns", label: "Campaign", href: "/admin/campaigns" },
  { id: "analytics", label: "Thống kê", href: "/admin/analytics" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid flex-1 grid-cols-[220px_1fr]">
      <nav className="border-r border-border bg-card p-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. The `/admin/analytics` route doesn't exist yet (built in Task 6), so this nav link will 404 until then — expected at this point in the plan.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin-shell.tsx
git commit -m "feat: add Thong ke (Statistics) nav item to admin sidebar"
```

---

## Task 5: Admin API — `GET /api/admin/analytics` (real download counts per Campaign)

**Files:**
- Create: `src/app/api/admin/analytics/route.ts`
- Test: `tests/app/api/admin-analytics.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (existing, `src/lib/require-admin.ts`), `prisma` (existing).
- Produces: `GET /api/admin/analytics` → `{ slug: string; title: string; count: number }[]` JSON, sorted by `count` descending, 401/403 when `requireAdmin` fails. `count` is `Campaign._count.avatars` — the number of `GeneratedAvatar` rows created through the existing `/api/campaigns/:slug/generate` endpoint (Task 6 of the main plan), so it reflects real usage, not mocked data.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/api/admin-analytics.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: { campaign: { findMany: vi.fn() } },
}));

import { GET } from "../../../src/app/api/admin/analytics/route";
import { prisma } from "../../../src/lib/prisma";
import { requireAdmin } from "../../../src/lib/require-admin";

describe("GET /api/admin/analytics", () => {
  it("returns each campaign's generated-avatar count, sorted descending", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      { slug: "fpt38", displayConfig: { title: "FPT tròn 38 tuổi" }, _count: { avatars: 5 } },
      { slug: "techweek-2026", displayConfig: { title: "Tech Week" }, _count: { avatars: 12 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual([
      { slug: "techweek-2026", title: "Tech Week", count: 12 },
      { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5 },
    ]);
    expect(prisma.campaign.findMany).toHaveBeenCalledWith({
      select: { slug: true, displayConfig: true, _count: { select: { avatars: true } } },
    });
  });

  it("falls back to the slug when displayConfig has no title", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      { slug: "no-title-campaign", displayConfig: {}, _count: { avatars: 0 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual([{ slug: "no-title-campaign", title: "no-title-campaign", count: 0 }]);
  });

  it("returns 401 when requireAdmin fails", async () => {
    (requireAdmin as any).mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-analytics.test.ts`
Expected: FAIL — module `src/app/api/admin/analytics/route` not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/admin/analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaigns = await prisma.campaign.findMany({
    select: { slug: true, displayConfig: true, _count: { select: { avatars: true } } },
  });

  const result = campaigns
    .map(c => ({
      slug: c.slug,
      title: (c.displayConfig as { title?: string })?.title || c.slug,
      count: c._count.avatars,
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-analytics.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/analytics tests/app/api/admin-analytics.test.ts
git commit -m "feat: add GET /api/admin/analytics returning real generated-avatar counts per campaign"
```

---

## Task 6: Admin "Thống kê" page — horizontal bar chart

**Files:**
- Create: `src/app/admin/analytics/page.tsx`
- Test: `tests/app/admin/analytics-page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/analytics` (Task 5).
- Produces: default-exported `AdminAnalyticsPage` Client Component rendered at `/admin/analytics` (already linked from `AdminShell`, Task 4).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/admin/analytics-page.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import AdminAnalyticsPage from "../../../src/app/admin/analytics/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminAnalyticsPage", () => {
  it("fetches and renders one bar row per campaign with its download count", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { slug: "techweek-2026", title: "Tech Week", count: 12 },
        { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5 },
      ],
    });

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Tech Week")).toBeTruthy());
    expect(screen.getByText("FPT tròn 38 tuổi")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith("/api/admin/analytics");
  });

  it("shows an empty-state message when there are no campaigns yet", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/admin/analytics-page.test.tsx`
Expected: FAIL — module `src/app/admin/analytics/page` not found.

- [ ] **Step 3: Implement the page**

```tsx
// src/app/admin/analytics/page.tsx
"use client";

import { useEffect, useState } from "react";

interface AnalyticsRow {
  slug: string;
  title: string;
  count: number;
}

export default function AdminAnalyticsPage() {
  const [rows, setRows] = useState<AnalyticsRow[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load analytics");
        return res.json();
      })
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]));
  }, []);

  const max = Math.max(1, ...(rows ?? []).map(r => r.count));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Thống kê</h1>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 text-sm font-bold text-foreground">Lượt tạo avatar theo Campaign</div>

        {rows === null && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {rows !== null && rows.length === 0 && <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>}

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/admin/analytics-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 6: Visual check in the browser**

Sign in via the dev-login bypass, navigate to `/admin/analytics`, confirm the two seeded campaigns show as bar rows with real counts (0 unless you've generated an avatar via `/c/fpt38` first — try generating one and refreshing to see the bar grow).

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/analytics tests/app/admin/analytics-page.test.tsx
git commit -m "feat: add admin Thong ke page with a real-data download-count bar chart"
```

---

## Task 7: Admin Campaign list — table with status pill

**Files:**
- Modify: `src/app/admin/campaigns/page.tsx`

**Interfaces:**
- Consumes: existing `GET/POST/PATCH/DELETE /api/admin/campaigns`, `CampaignForm` (unchanged prop signature).
- Produces: no new exports — `AdminCampaignsPage` remains the default export; only the list markup changes from `<ul>` to `<table>`.

- [ ] **Step 1: Replace the `<ul>` with a styled table**

```tsx
// src/app/admin/campaigns/page.tsx
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
    await fetch(`/api/admin/campaigns/${slug}`, { method: "DELETE" });
    loadCampaigns();
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quản lý Campaign</h1>
        {!editing && (
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
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-bold",
                      c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {c.status === "active" ? "Hoạt động" : "Nháp"}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">{c.templates?.length ?? "—"}</td>
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
```

Note: this task changes the "form always visible" behavior to "form opens on demand" (via the `editing !== null` guard, where `undefined` means "creating new" and `null` means "closed") — a small, deliberate UX improvement that matches the demo's `campaignFormOpen` toggle instead of leaving an empty create-form permanently at the bottom of the page. `CampaignForm`'s own prop contract (`onSubmit`, `initial`) is untouched.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests pass — `tests/app/admin/campaign-form.test.tsx` tests `CampaignForm` in isolation and is unaffected by this page-level change.

- [ ] **Step 4: Visual check in the browser**

Navigate to `/admin/campaigns`, confirm the campaign list now renders as a table with a status pill, and that "+ Campaign mới" opens the form, "Sửa" opens it pre-filled, "Đóng" hides it again.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/campaigns/page.tsx
git commit -m "style: restyle admin campaign list as a table with a status pill, matching the demo"
```

---

## Task 8: Admin Campaign form — two-column grid layout

**Files:**
- Modify: `src/app/admin/campaigns/campaign-form.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `CampaignForm`'s exported props (`onSubmit`, `initial`) and its `CampaignDraft` shape are unchanged — only the wrapping `<div>` layout changes from single-column stacked fields to a two-column grid, matching `tests/app/admin/campaign-form.test.tsx`'s existing `getByLabelText` queries (label text and `htmlFor`/`id` pairs are untouched).

- [ ] **Step 1: Wrap the fields in a two-column grid**

```tsx
// src/app/admin/campaigns/campaign-form.tsx
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>
      <Button type="submit" className="w-fit">{initial ? "Cập nhật" : "Lưu"}</Button>
    </form>
  );
}
```

- [ ] **Step 2: Run the existing CampaignForm test suite to confirm no regression**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx`
Expected: PASS — all 4 tests (label text, `htmlFor`/`id` pairs, and button labels are unchanged).

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/campaigns/campaign-form.tsx
git commit -m "style: lay out CampaignForm fields in a two-column grid, matching the demo"
```

---

## Task 9: Admin Template list — card grid

**Files:**
- Modify: `src/app/admin/campaigns/[slug]/templates/page.tsx`

**Interfaces:**
- Consumes: existing `GET /api/admin/campaigns/:slug`, `POST/PATCH/DELETE /api/admin/campaigns/:slug/templates(/:id)`, `TemplateForm` (unchanged prop signature).
- Produces: no new exports — only the list markup changes from `<ul>` to a card grid.

- [ ] **Step 1: Replace the `<ul>` with a card grid**

```tsx
// src/app/admin/campaigns/[slug]/templates/page.tsx
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
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quản lý Khung — {slug}</h1>
        {!editing && (
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
```

Note: same "form opens on demand" pattern as Task 7. The `disabled={submitting}` fieldset from the current file is preserved around `TemplateForm` so the submit-in-flight UX (prevent double submit) doesn't regress.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests pass — `tests/app/admin/template-form.test.tsx` tests `TemplateForm` in isolation and is unaffected.

- [ ] **Step 4: Visual check in the browser**

Navigate to `/admin/campaigns/fpt38/templates`, confirm "Khung cam chuẩn" renders as a card (gradient placeholder + name + photoArea coordinates + Sửa/Xóa), and "+ Khung mới" opens the create form.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/campaigns/[slug]/templates/page.tsx"
git commit -m "style: restyle admin template list as a card grid, matching the demo"
```

---

## Task 10: Admin Template form — card wrapper and upload dropzone hint

**Files:**
- Modify: `src/app/admin/campaigns/[slug]/templates/template-form.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `TemplateForm`'s exported props (`onSubmit`, `initial`) are unchanged — only spacing/visual treatment of the frame-image field changes. All existing `getByLabelText`/`getByRole` queries in `tests/app/admin/template-form.test.tsx` keep matching the same label text and button names.

- [ ] **Step 1: Style the frame-image field as a bordered dropzone-style block**

Change only the frame-image field block inside the existing `template-form.tsx` (everything else — state, validation, overlay-field list, submit handler — is untouched):

```tsx
      <div className="space-y-2">
        <Label htmlFor="template-frame">Ảnh khung (PNG){initial && " (để trống nếu giữ ảnh cũ)"}</Label>
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/40 p-4 text-center">
          <Input
            id="template-frame"
            type="file"
            accept="image/png"
            onChange={e => setFrameImage(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
```

This replaces the existing plain `<Input>`-only block for the frame-image field (same `id`, same `Label`, same `onChange` — only a wrapping `<div>` is added around the `<Input>`).

- [ ] **Step 2: Wrap the overlay-field list and the whole form in a card-style container**

Change the form's outer element from `<form onSubmit={handleSubmit} className="flex flex-col gap-4">` to add a card look, and wrap each per-overlay `<fieldset>` block with a slightly heavier border to read as a nested card:

```tsx
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
```

(Only this one class list changes on the top-level `<form>` element — every field and button inside stays exactly as already written in the file.)

- [ ] **Step 3: Run the existing TemplateForm test suite to confirm no regression**

Run: `npx vitest run tests/app/admin/template-form.test.tsx`
Expected: PASS — all 3 tests still pass (label text and `id`s are unchanged; the dropzone wrapper doesn't affect `getByLabelText("Ảnh khung (PNG)")`, which matches by the `<label htmlFor>`/`<input id>` pair, not DOM position).

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/campaigns/[slug]/templates/template-form.tsx"
git commit -m "style: wrap TemplateForm in a card with a dropzone-style frame-image field"
```

---

## Task 11: Final verification and build

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (the pre-existing, unrelated `e2e/example.spec.ts` Playwright collection failure noted in earlier work is out of scope for this plan — do not fix it here unless asked).

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the production build**

Run: `npx next build`
Expected: build succeeds, all admin/public routes listed including the new `/admin/analytics` and `/api/admin/analytics`.

- [ ] **Step 4: Full manual walkthrough in the browser**

With the dev server running and a signed-in dev-login admin session:
1. `/` — campaign cards render with gradient banner, status pill, CTA.
2. `/c/fpt38` — template picker is a clickable card grid; selecting a card still updates the canvas preview.
3. `/admin/campaigns` — table view with status pill; "+ Campaign mới" and "Sửa" both open the two-column form; "Xóa" removes a row.
4. `/admin/campaigns/fpt38/templates` — card grid; "+ Khung mới" and "Sửa" both open the card-wrapped form with the dropzone-style frame-image field.
5. `/admin/analytics` — bar chart renders; generate one avatar via `/c/fpt38` and confirm the corresponding bar grows on refresh.

- [ ] **Step 5: Commit any final fixes found during the walkthrough, then stop — no further tasks in this plan.**
