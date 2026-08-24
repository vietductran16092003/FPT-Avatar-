# Admin Group (Campaign + Template CRUD, Admin UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create/edit/delete Campaigns and Templates through API + UI, with proper 4xx responses for known-bad requests (duplicate slug, deleting a Campaign/Template that still has generated avatars) instead of raw 500s — without waiting on the Azure AD SSO gate (Task 10 of the master plan), by keeping the injectable `requireAdmin`/`session` seam the master plan already designed.

**Architecture:** Three Next.js Route Handler pairs (`/api/admin/campaigns`, `/api/admin/campaigns/[slug]/templates`) behind a shared `requireAdmin()` gate, plus one admin UI page with a reusable form component. `requireAdmin()` reads through a placeholder `getCurrentUser()` in `src/lib/session.ts` that throws until the master plan's Task 10 (NextAuth + Azure AD, currently blocked on an infra gate) replaces it — every admin route here is fully testable today against a mocked `requireAdmin`, and will start working end-to-end the moment Task 10 lands, with no changes to this plan's code.

**Tech Stack:** Next.js 14 (App Router, TypeScript, Route Handlers), Prisma + PostgreSQL, `@testing-library/react` + `@testing-library/user-event` + `jsdom`, Vitest, shadcn/ui (`Button`, `Input`, `Label`, `Select`).

**Spec:** [docs/superpowers/specs/2026-08-20-campaign-platform-nextjs-design.md](../specs/2026-08-20-campaign-platform-nextjs-design.md) — this plan implements the admin-facing slice of Tasks 7, 8, 13 from [2026-08-20-campaign-platform-nextjs.md](2026-08-20-campaign-platform-nextjs.md), with added Prisma-error handling that the original task text left implicit.

## Global Constraints

- Every admin route calls `requireAdmin()` first; no admin route reads `req`/session state on its own (spec §5, §9 — `User.role` is the only source of admin authorization).
- `User.role` is never derived from anything but the DB — this plan does not touch `src/lib/session.ts`'s placeholder behavior; Task 10 (out of scope here) is the only task allowed to change it.
- No field is hard-coded onto `Campaign` or `Template` for a specific event concept — `displayConfig`/`overlayConfig` stay opaque `Json` end to end through these routes (spec §3).
- A `DELETE` on a `Campaign` or `Template` that still has a `GeneratedAvatar` referencing it must return `409`, not crash with an unhandled Prisma foreign-key error — `GeneratedAvatar`'s relations to `Campaign`/`Template` have no `onDelete` override (Prisma default `Restrict`, set in the master plan's Task 1, already merged).
- A `POST` that violates `Campaign.slug`'s unique constraint must return `409`, not crash with an unhandled Prisma error.
- **⛔ Out of scope, not a gap to silently fill:** Task 10 (NextAuth + Azure AD SSO) and the `/admin/login` page it needs are excluded from this plan — they remain blocked on the infra gate documented in the master plan (spec §10: Team hạ tầng must confirm `curl` from a K8s pod to `login.microsoftonline.com` succeeds). Admin routes/UI built here are fully unit-testable now; they will not work end-to-end against a real browser until Task 10 lands.

---

## Task 1: Admin API — Campaign CRUD with proper error responses

**Files:**
- Create: `src/app/api/admin/campaigns/route.ts`
- Create: `src/app/api/admin/campaigns/[slug]/route.ts`
- Create: `src/lib/require-admin.ts`
- Create: `src/lib/session.ts` (placeholder — real NextAuth wiring lands in the master plan's Task 10)
- Test: `tests/lib/require-admin.test.ts`
- Test: `tests/app/api/admin-campaigns.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/prisma.ts` (already committed).
- Produces: `export async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; response: Response }>` in `src/lib/require-admin.ts` — every admin route in this plan and the master plan's Task 8 calls this first.
- Produces: `GET/POST /api/admin/campaigns`, `PATCH/DELETE /api/admin/campaigns/:slug`. `POST` returns `409` on duplicate slug. `DELETE` returns `409` when the campaign still has generated avatars, `404` when the slug doesn't exist.

- [ ] **Step 1: Write the failing test for `requireAdmin`**

```ts
// tests/lib/require-admin.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/session", () => ({ getCurrentUser: vi.fn() }));

import { requireAdmin } from "../../src/lib/require-admin";
import { getCurrentUser } from "../../src/lib/session";

describe("requireAdmin", () => {
  it("allows a user whose role is admin", async () => {
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "admin" });
    const result = await requireAdmin();
    expect(result.ok).toBe(true);
  });

  it("rejects a non-admin user with 403", async () => {
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects an unauthenticated request with 401", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/require-admin.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the placeholder `src/lib/session.ts` and implement `requireAdmin`**

```ts
// src/lib/session.ts
// Placeholder until the master plan's Task 10 wires NextAuth's Azure AD
// session. Kept as its own module so requireAdmin and every admin route
// can be tested against a mock now, without waiting on the Azure AD
// network gate (spec §10).
export async function getCurrentUser(): Promise<{ id: string; role: string } | null> {
  throw new Error("getCurrentUser is not wired yet — implemented in the master plan's Task 10");
}
```

```ts
// src/lib/require-admin.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";

export async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (user.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/require-admin.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for admin campaign CRUD, including the two Prisma-error cases**

```ts
// tests/app/api/admin-campaigns.test.ts
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../../src/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    campaign: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { GET, POST } from "../../../src/app/api/admin/campaigns/route";
import { PATCH, DELETE } from "../../../src/app/api/admin/campaigns/[slug]/route";
import { prisma } from "../../../src/lib/prisma";
import { requireAdmin } from "../../../src/lib/require-admin";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("mock", { code, clientVersion: "5.22.0" });
}

describe("admin campaigns API", () => {
  it("GET lists all campaigns regardless of status", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([{ slug: "fpt38" }]);
    const res = await GET();
    expect((await res.json())).toHaveLength(1);
  });

  it("POST creates a campaign with displayConfig", async () => {
    (prisma.campaign.create as any).mockResolvedValue({ slug: "new-campaign" });
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "new-campaign", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "T" } }),
    }));
    expect(res.status).toBe(200);
    expect(prisma.campaign.create).toHaveBeenCalled();
  });

  it("POST returns 409 when the slug already exists", async () => {
    (prisma.campaign.create as any).mockRejectedValue(prismaError("P2002"));
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "fpt38", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "T" } }),
    }));
    expect(res.status).toBe(409);
  });

  it("PATCH rejects when requireAdmin fails", async () => {
    (requireAdmin as any).mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: "{}" }), { params: { slug: "fpt38" } });
    expect(res.status).toBe(401);
  });

  it("DELETE removes the campaign by slug", async () => {
    (prisma.campaign.delete as any).mockResolvedValue({ slug: "fpt38" });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38" } });
    expect(res.status).toBe(200);
    expect(prisma.campaign.delete).toHaveBeenCalledWith({ where: { slug: "fpt38" } });
  });

  it("DELETE returns 404 when the campaign does not exist", async () => {
    (prisma.campaign.delete as any).mockRejectedValue(prismaError("P2025"));
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "nope" } });
    expect(res.status).toBe(404);
  });

  it("DELETE returns 409 when the campaign still has generated avatars (foreign key restrict)", async () => {
    (prisma.campaign.delete as any).mockRejectedValue(prismaError("P2003"));
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38" } });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-campaigns.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 7: Implement the two route files with Prisma error handling**

```ts
// src/app/api/admin/campaigns/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const campaigns = await prisma.campaign.findMany();
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();

  try {
    const campaign = await prisma.campaign.create({
      data: {
        slug: body.slug,
        status: body.status ?? "draft",
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        language: body.language ?? "vi",
        displayConfig: body.displayConfig,
      },
    });
    return NextResponse.json(campaign);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `Campaign slug "${body.slug}" already exists` }, { status: 409 });
    }
    throw err;
  }
}
```

```ts
// src/app/api/admin/campaigns/[slug]/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const campaign = await prisma.campaign.update({ where: { slug: params.slug }, data: body });
  return NextResponse.json(campaign);
}

export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const campaign = await prisma.campaign.delete({ where: { slug: params.slug } });
    return NextResponse.json(campaign);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: `Campaign "${params.slug}" not found` }, { status: 404 });
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: `Campaign "${params.slug}" still has generated avatars and cannot be deleted` },
          { status: 409 },
        );
      }
    }
    throw err;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-campaigns.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/api/admin/campaigns src/lib/require-admin.ts src/lib/session.ts tests/lib/require-admin.test.ts tests/app/api/admin-campaigns.test.ts
git commit -m "feat: add admin campaign CRUD API with 409/404 Prisma error handling"
```

---

## Task 2: Admin API — Template CRUD with `overlayConfig`, same error handling

**Files:**
- Create: `src/app/api/admin/campaigns/[slug]/templates/route.ts`
- Create: `src/app/api/admin/campaigns/[slug]/templates/[id]/route.ts`
- Test: `tests/app/api/admin-templates.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 1 of this plan), `prisma` (already committed), `getStorage` (already committed).
- Produces: `POST /api/admin/campaigns/:slug/templates` (multipart: `name`, `frameImage`, `overlayConfig` JSON string) → created `Template`, `404` if the campaign slug doesn't exist. `PATCH/DELETE /api/admin/campaigns/:slug/templates/:id`, `DELETE` returns `409` when the template still has generated avatars, `404` when the id doesn't exist.

- [ ] **Step 1: Write the failing test, including the three Prisma-error cases**

```ts
// tests/app/api/admin-templates.test.ts
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../../src/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    campaign: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1" }) },
    template: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("../../../src/lib/storage", () => ({
  getStorage: () => ({ upload: vi.fn().mockResolvedValue(undefined), getPublicUrl: (k: string) => `http://s/${k}`, delete: vi.fn() }),
}));

import { POST } from "../../../src/app/api/admin/campaigns/[slug]/templates/route";
import { PATCH, DELETE } from "../../../src/app/api/admin/campaigns/[slug]/templates/[id]/route";
import { prisma } from "../../../src/lib/prisma";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("mock", { code, clientVersion: "5.22.0" });
}

function templateForm() {
  const form = new FormData();
  form.set("name", "Khung cam chuẩn");
  form.set("overlayConfig", JSON.stringify({ photoArea: { x: 10, y: 10, w: 50, h: 50 }, textOverlays: [] }));
  form.set("frameImage", new Blob([Buffer.from("png")], { type: "image/png" }), "frame.png");
  return form;
}

describe("admin templates API", () => {
  it("POST uploads the frame image and creates a Template scoped to the campaign", async () => {
    (prisma.template.create as any).mockResolvedValue({ id: "t1", name: "Khung cam chuẩn" });

    const res = await POST(new Request("http://x", { method: "POST", body: templateForm() }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(200);
    expect(prisma.template.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ campaignId: "c1", name: "Khung cam chuẩn" }),
    }));
  });

  it("POST returns 404 when the campaign slug does not exist", async () => {
    (prisma.campaign.findUniqueOrThrow as any).mockRejectedValueOnce(prismaError("P2025"));

    const res = await POST(new Request("http://x", { method: "POST", body: templateForm() }), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });

  it("PATCH updates an existing template's overlayConfig", async () => {
    (prisma.template.update as any).mockResolvedValue({ id: "t1" });

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }) }),
      { params: { slug: "fpt38", id: "t1" } },
    );

    expect(res.status).toBe(200);
    expect(prisma.template.update).toHaveBeenCalled();
  });

  it("DELETE removes a template by id", async () => {
    (prisma.template.delete as any).mockResolvedValue({ id: "t1" });

    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38", id: "t1" } });

    expect(res.status).toBe(200);
    expect(prisma.template.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });

  it("DELETE returns 404 when the template does not exist", async () => {
    (prisma.template.delete as any).mockRejectedValue(prismaError("P2025"));
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38", id: "nope" } });
    expect(res.status).toBe(404);
  });

  it("DELETE returns 409 when the template still has generated avatars", async () => {
    (prisma.template.delete as any).mockRejectedValue(prismaError("P2003"));
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38", id: "t1" } });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-templates.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the two route files with Prisma error handling**

```ts
// src/app/api/admin/campaigns/[slug]/templates/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStorage } from "@/lib/storage";

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const name = form.get("name") as string;
  const overlayConfig = JSON.parse(form.get("overlayConfig") as string);
  const frameImage = form.get("frameImage") as File;

  let campaign;
  try {
    campaign = await prisma.campaign.findUniqueOrThrow({ where: { slug: params.slug } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: `Campaign "${params.slug}" not found` }, { status: 404 });
    }
    throw err;
  }

  const storage = getStorage();
  const frameImageKey = `frames/${params.slug}-${Date.now()}.png`;
  await storage.upload(frameImageKey, Buffer.from(await frameImage.arrayBuffer()), "image/png");

  const template = await prisma.template.create({
    data: { campaignId: campaign.id, name, frameImageKey, overlayConfig },
  });

  return NextResponse.json(template);
}
```

```ts
// src/app/api/admin/campaigns/[slug]/templates/[id]/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function PATCH(req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const template = await prisma.template.update({ where: { id: params.id }, data: body });
  return NextResponse.json(template);
}

export async function DELETE(_req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const template = await prisma.template.delete({ where: { id: params.id } });
    return NextResponse.json(template);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: `Template "${params.id}" not found` }, { status: 404 });
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: `Template "${params.id}" still has generated avatars and cannot be deleted` },
          { status: 409 },
        );
      }
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/campaigns/[slug]/templates tests/app/api/admin-templates.test.ts
git commit -m "feat: add admin template CRUD API with 409/404 Prisma error handling"
```

---

## Task 3: Admin UI — Campaign list + form

**Files:**
- Create: `src/app/admin/campaigns/page.tsx`
- Create: `src/app/admin/campaigns/campaign-form.tsx`
- Test: `tests/app/admin/campaign-form.test.tsx`

**Interfaces:**
- Consumes: `POST/GET/PATCH/DELETE /api/admin/campaigns` (Task 1 of this plan).
- Produces: reusable `<CampaignForm initial={...} onSubmit={...} />` component.

- [ ] **Step 1: Install React Testing Library**

```bash
npm install -D @testing-library/react @testing-library/user-event jsdom
```

- [ ] **Step 2: Write the failing test**

```tsx
// tests/app/admin/campaign-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignForm } from "../../../src/app/admin/campaigns/campaign-form";

describe("CampaignForm", () => {
  it("submits slug, dates, language and displayConfig title entered by the admin", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề"), "Ngày hội Công nghệ FPT 2026");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      slug: "techweek-2026",
      displayConfig: expect.objectContaining({ title: "Ngày hội Công nghệ FPT 2026" }),
    }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `CampaignForm`**

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
  startDate: string;
  endDate: string;
  language: "vi" | "en";
  displayConfig: { title: string; description: string; ctaLabel: string };
}

export function CampaignForm({ onSubmit, initial }: { onSubmit: (draft: CampaignDraft) => void; initial?: CampaignDraft }) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
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
      startDate,
      endDate,
      language,
      displayConfig: { title, description: "", ctaLabel: "Tạo avatar ngay" },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="campaign-slug">Slug</Label>
        <Input id="campaign-slug" value={slug} onChange={e => setSlug(e.target.value)} />
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
      <Button type="submit">Lưu</Button>
    </form>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx`
Expected: PASS

- [ ] **Step 6: Implement `src/app/admin/campaigns/page.tsx`**

```tsx
// src/app/admin/campaigns/page.tsx
"use client";

import { useEffect, useState } from "react";
import { CampaignForm } from "./campaign-form";

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/campaigns").then(res => res.json()).then(setCampaigns);
  }, []);

  async function handleCreate(draft: any) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/campaigns", { method: "POST", body: JSON.stringify(draft) });
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
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Quản lý Campaign</h1>
      <ul className="space-y-1">{campaigns.map(c => <li key={c.slug}>{c.slug} — {c.status}</li>)}</ul>
      {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
      <fieldset disabled={submitting} aria-busy={submitting}>
        <CampaignForm onSubmit={handleCreate} />
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/campaigns tests/app/admin/campaign-form.test.tsx package.json package-lock.json
git commit -m "feat: add admin campaign list page and reusable campaign form"
```

---

## Ngoài phạm vi (chưa làm ở bản này)

- Task 10 của plan chính (NextAuth + Azure AD SSO) — chờ gate hạ tầng.
- Trang `/admin/login` — phụ thuộc Task 10, tạo cùng lúc khi Task 10 triển khai.
- Validate shape đầy đủ của `overlayConfig` (vd giới hạn `x`/`y` trong 0-100, `textOverlays[].key` không trùng) — hiện chỉ `JSON.parse` không kiểm tra cấu trúc. Đáng làm nhưng cần quyết định thư viện validate (Zod?) — để lại cho spec/plan riêng nếu cần trước khi admin thật sự nhập liệu tùy ý.
- Admin UI cho Template (upload khung ảnh, khai báo overlay qua giao diện) — chưa có trong 3 task này; hiện chỉ có API (Task 2). Trang admin quản lý Template là phần mở rộng tiếp theo, ngoài phạm vi bản này.
