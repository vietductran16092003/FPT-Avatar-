# Backend & Frontend Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 8 confirmed bugs found during manual + code testing of the admin and public flows: 2 access-control gaps (draft/archived campaigns publicly reachable), 2 mass-assignment gaps (unfiltered PATCH bodies), missing server-side slug/file/JSON validation, a UI label-rendering bug in the shared `Select` component, a missing "campaign has no templates yet" guard on the public site, and a notification-bell polish pass to match the demo (icons, relative time, empty-state copy).

**Architecture:** Each bug is fixed at its existing call site — no new subsystems. Backend fixes add guard clauses (status checks, field whitelists, size/format validation) to existing route handlers. Frontend fixes are targeted edits to existing components (`Select`, `HomePage`, `CampaignPage`, `NotificationBell`).

**Tech Stack:** Next.js 14 App Router route handlers, Prisma/Postgres, React (client + server components), Vitest + Testing Library.

**Spec:** None — these are confirmed bug fixes to existing, already-shipped code, diagnosed by direct testing (live DB queries, browser reproduction) and code reading during this session. No new design decisions are needed; each task states the confirmed defect and its fix.

## Global Constraints

- Every fix must preserve existing passing tests — a fix that requires changing an existing test's expected behavior must do so deliberately and be called out in that task.
- No client-visible behavior changes beyond what's needed to fix the named bug (no incidental refactors).
- Server-side validation added in this plan must match the equivalent client-side validation already in place (same limits: 5MB frame image, kebab-case slug) so legitimate requests that already pass client validation are not newly rejected.
- Vietnamese user-facing strings only — matches the existing convention across the app (no i18n system exists here).

---

### Task 1: Public campaign detail route — gate by active status

**Bug:** `GET /api/campaigns/[slug]` returns a campaign's full details (including templates) regardless of `status`. Confirmed live: a campaign created with `status: "draft"` was fully reachable and renderable at `/c/[slug]`, defeating the purpose of "draft = not published yet."

**Files:**
- Modify: `src/app/api/campaigns/[slug]/route.ts`
- Test: `tests/app/api/campaigns-slug.test.ts`

**Interfaces:**
- No change to the route's exported signature (`GET(req, { params })`) — only its response for non-active campaigns changes from 200 to 404.

- [ ] **Step 1: Write the failing test**

Add this test to `tests/app/api/campaigns-slug.test.ts`, inside the existing `describe("GET /api/campaigns/:slug", ...)` block, and update the existing first test's mock to include `status: "active"` (required now that the route reads it):

Replace the full file with:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: { campaign: { findUnique: vi.fn() } },
}));

import { GET } from "../../../src/app/api/campaigns/[slug]/route";
import { prisma } from "../../../src/lib/prisma";

describe("GET /api/campaigns/:slug", () => {
  it("returns the campaign with its templates when found and active", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "1", slug: "fpt38", status: "active", templates: [] });

    const res = await GET(new Request("http://x/api/campaigns/fpt38"), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(body.slug).toBe("fpt38");
    expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
      where: { slug: "fpt38" },
      include: { templates: true },
    });
  });

  it("returns 404 when the campaign does not exist", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue(null);

    const res = await GET(new Request("http://x/api/campaigns/nope"), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the campaign exists but is not active (draft)", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "1", slug: "secret-draft", status: "draft", templates: [] });

    const res = await GET(new Request("http://x/api/campaigns/secret-draft"), { params: { slug: "secret-draft" } });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the campaign exists but is archived", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "1", slug: "old-one", status: "archived", templates: [] });

    const res = await GET(new Request("http://x/api/campaigns/old-one"), { params: { slug: "old-one" } });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/campaigns-slug.test.ts`
Expected: the first 2 tests PASS unchanged; the 2 new "not active" tests FAIL with `expected 404 to be 200` (the route currently returns the campaign regardless of status).

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/app/api/campaigns/[slug]/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: params.slug },
    include: { templates: true },
  });

  if (!campaign || campaign.status !== "active") {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/campaigns-slug.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[slug]/route.ts tests/app/api/campaigns-slug.test.ts
git commit -m "fix: gate public campaign detail route by active status"
```

---

### Task 2: Avatar generate route — status gate, photo size limit, safe JSON parsing

**Bugs:**
- `POST /api/campaigns/[slug]/generate` never checks the campaign's `status`, so a draft/archived campaign with at least one template still lets a visitor generate and download an avatar.
- The visitor-supplied photo file has no server-side size limit (the admin frame-image upload has a 5MB limit client-side; this endpoint has none at all, client or server).
- `JSON.parse(form.get("overlayValues") as string)` is unguarded — a malformed value 500s the route instead of returning a 400.

**Files:**
- Modify: `src/app/api/campaigns/[slug]/generate/route.ts`
- Test: `tests/app/api/campaigns-generate.test.ts`

**Interfaces:**
- No change to the route's exported signature. Internally, the campaign is now looked up via `prisma.campaign.findUnique` (replacing the old `prisma.campaign.findUniqueOrThrow` call that used to run only at the very end, just to read `.id`) — this lookup now happens once, near the top, and its status is checked before any other work (template lookup, compositing, upload) begins.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `tests/app/api/campaigns-generate.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    template: { findFirst: vi.fn() },
    campaign: { findUnique: vi.fn() },
    generatedAvatar: { create: vi.fn() },
  },
}));
vi.mock("../../../src/lib/storage", () => ({
  getStorage: () => ({
    upload: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: (key: string) => `http://storage/${key}`,
    delete: vi.fn(),
  }),
}));
vi.mock("../../../src/lib/compositing/server-compositor", () => ({
  compositeAvatar: vi.fn().mockResolvedValue(Buffer.from("png-bytes")),
}));
vi.mock("../../../src/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "../../../src/app/api/campaigns/[slug]/generate/route";
import { prisma } from "../../../src/lib/prisma";
import { createNotification } from "../../../src/lib/notifications";
import { compositeAvatar } from "../../../src/lib/compositing/server-compositor";

const overlays = [
  { key: "joinYear", label: "L", labelEn: "L", type: "select", options: ["2021"], x: 10, y: 10, fontSize: 10, color: "#fff" },
];

function multipartRequest(overlayValues: object | string, templateId = "tpl1", photoBytes: Uint8Array = Buffer.from("photo-bytes")) {
  const form = new FormData();
  form.set("templateId", templateId);
  form.set("overlayValues", typeof overlayValues === "string" ? overlayValues : JSON.stringify(overlayValues));
  form.set("photo", new Blob([photoBytes], { type: "image/png" }), "photo.png");
  return new Request("http://x/api/campaigns/fpt38/generate", { method: "POST", body: form });
}

describe("POST /api/campaigns/:slug/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (compositeAvatar as any).mockResolvedValue(Buffer.from("png-bytes"));
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "c1", slug: "fpt38", status: "active", displayConfig: { title: "FPT tròn 38 tuổi" } });
  });

  it("re-composites server-side and stores the result, ignoring any client-sent layout", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });

    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resultUrl).toMatch(/^http:\/\/storage\//);
    expect(prisma.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tpl1", campaign: { slug: "fpt38" } },
    });
  });

  it("rejects overlayValues with a key not declared on the template", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });

    const res = await POST(multipartRequest({ notARealKey: "x" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("returns 404 when the template does not belong to the campaign in the URL", async () => {
    (prisma.template.findFirst as any).mockResolvedValue(null);

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(404);
  });

  it("notifies admins after a successful avatar generation", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(createNotification).toHaveBeenCalledWith(
      "Có lượt tải avatar mới: FPT tròn 38 tuổi – Khung cam chuẩn.",
      "download",
    );
  });

  it("does not notify when the template does not belong to the campaign", async () => {
    (prisma.template.findFirst as any).mockResolvedValue(null);

    await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign does not exist", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue(null);

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the campaign is not active (draft)", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "c1", slug: "fpt38", status: "draft", displayConfig: {} });

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(404);
    expect(prisma.template.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when the photo exceeds 10MB", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });

    const oversizedPhoto = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await POST(multipartRequest({ joinYear: "2021" }, "tpl1", oversizedPhoto), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("returns 400 when overlayValues is not valid JSON", async () => {
    const res = await POST(multipartRequest("{not-json"), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: the pre-existing behavior tests PASS; the 3 new tests FAIL — "campaign does not exist" and "not active" FAIL because the route currently never checks campaign status before proceeding (it would try to look up the template and likely error differently, not cleanly 404 before `template.findFirst`); "photo exceeds 10MB" FAILS because there's no size check at all, so the mocked pipeline runs to completion and returns 200.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/app/api/campaigns/[slug]/generate/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { compositeAvatar } from "@/lib/compositing/server-compositor";
import { validateOverlayValues } from "@/lib/compositing/validate-overlay-values";
import { createNotification } from "@/lib/notifications";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const form = await req.formData();
  const templateId = form.get("templateId") as string;
  const photoFile = form.get("photo") as File;

  let overlayValues: Record<string, string>;
  try {
    overlayValues = JSON.parse(form.get("overlayValues") as string);
  } catch {
    return NextResponse.json({ error: "Invalid overlayValues JSON" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { slug: params.slug } });
  if (!campaign || campaign.status !== "active") {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (!photoFile || photoFile.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo file missing or exceeds 10MB" }, { status: 400 });
  }

  // Template, frame, and overlayConfig always come from the DB, scoped to
  // the campaign in the URL — the client cannot point this route at a
  // template belonging to a different campaign, nor supply its own layout.
  const template = await prisma.template.findFirst({
    where: { id: templateId, campaign: { slug: params.slug } },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const overlayConfig = template.overlayConfig as unknown as {
    photoArea: { x: number; y: number; w: number; h: number };
    textOverlays: Parameters<typeof validateOverlayValues>[0];
  };

  const validation = validateOverlayValues(overlayConfig.textOverlays, overlayValues);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const storage = getStorage();
  const frameBuffer = Buffer.from(await (await fetch(storage.getPublicUrl(template.frameImageKey))).arrayBuffer());
  const photoBuffer = Buffer.from(await photoFile.arrayBuffer());

  const resultBuffer = await compositeAvatar(
    frameBuffer,
    photoBuffer,
    overlayConfig.photoArea,
    overlayConfig.textOverlays,
    overlayValues,
  );

  const resultKey = `results/${template.id}-${Date.now()}.png`;
  await storage.upload(resultKey, resultBuffer, "image/png");

  await prisma.generatedAvatar.create({
    data: {
      campaignId: campaign.id,
      templateId: template.id,
      overlayValues,
      resultImageKey: resultKey,
    },
  });

  const campaignTitle = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
  createNotification(`Có lượt tải avatar mới: ${campaignTitle} – ${template.name}.`, "download").catch(err => console.error("notification failed", err));

  return NextResponse.json({ resultUrl: storage.getPublicUrl(resultKey) });
}
```

Note: the JSON-parsing and campaign-status/photo-size checks now run *before* the template lookup — this changes the order in which a request with multiple problems fails (e.g. a request with both an invalid campaign slug and a too-large photo now 404s on the campaign check first), which is fine since each failure case has its own dedicated test asserting only the status code.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[slug]/generate/route.ts tests/app/api/campaigns-generate.test.ts
git commit -m "fix: gate avatar generation by campaign status, cap photo size, guard JSON parsing"
```

---

### Task 3: Admin campaign write paths — server-side slug validation + PATCH field whitelist

**Bugs:**
- `POST /api/admin/campaigns` never validates `slug` format server-side — only the client form does. A request sent directly to the API (bypassing the form) can create a campaign with a slug like `"ấdasđ"` (confirmed: this row exists in the dev database from earlier testing), breaking the `/c/[slug]` URL scheme.
- `PATCH /api/admin/campaigns/[slug]` does `prisma.campaign.update({ data: body })` — the entire client-supplied JSON body is written straight to the database with no field whitelist. A client could set `slug` to bypass the create-time format check entirely, or send any other unexpected field.

**Files:**
- Modify: `src/app/api/admin/campaigns/route.ts`
- Modify: `src/app/api/admin/campaigns/[slug]/route.ts`
- Test: `tests/app/api/admin-campaigns.test.ts`

**Interfaces:**
- No change to either route's exported signature. `PATCH`'s accepted fields are now explicitly `status`, `startDate`, `endDate`, `language`, `displayConfig` — exactly what the admin UI already sends (`src/app/admin/campaigns/page.tsx`'s `handleUpdate`), so no frontend change is needed.

- [ ] **Step 1: Write the failing tests**

Add these two tests to `tests/app/api/admin-campaigns.test.ts`, inside the existing `describe("admin campaigns API", ...)` block, after the existing tests:

```ts
  it("POST rejects a slug that is not lowercase kebab-case", async () => {
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "Tech Week!", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "T" } }),
    }));

    expect(res.status).toBe(400);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it("PATCH ignores fields outside the whitelist, such as slug", async () => {
    (prisma.campaign.update as any).mockResolvedValue({ slug: "fpt38", displayConfig: { title: "FPT 38" } });

    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ status: "active", slug: "hacked-slug" }) }), { params: { slug: "fpt38" } });

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { slug: "fpt38" },
      data: { status: "active" },
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/admin-campaigns.test.ts`
Expected: "POST rejects a slug..." FAILS with `expected 400 to be <whatever the create-path currently returns>` (the route currently proceeds to call `prisma.campaign.create` with the bad slug). "PATCH ignores fields outside the whitelist..." FAILS because `prisma.campaign.update` is currently called with `data: { status: "active", slug: "hacked-slug" }` (the whole raw body), not the filtered object.

- [ ] **Step 3: Write minimal implementation**

In `src/app/api/admin/campaigns/route.ts`, add slug validation before the create:

```ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { createNotification } from "@/lib/notifications";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const campaigns = await prisma.campaign.findMany({
    include: { _count: { select: { templates: true } } },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();

  if (typeof body.slug !== "string" || !SLUG_PATTERN.test(body.slug)) {
    return NextResponse.json({ error: "Slug must be lowercase kebab-case (e.g. techweek-2026)" }, { status: 400 });
  }

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
    const title = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
    createNotification(`Đã tạo campaign mới "${title}".`, "campaign-create").catch(err => console.error("notification failed", err));
    return NextResponse.json(campaign);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `Campaign slug "${body.slug}" already exists` }, { status: 409 });
    }
    throw err;
  }
}
```

In `src/app/api/admin/campaigns/[slug]/route.ts`, replace the `PATCH` handler's body with a whitelist:

```ts
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();

  const data: Prisma.CampaignUpdateInput = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) data.endDate = new Date(body.endDate);
  if (body.language !== undefined) data.language = body.language;
  if (body.displayConfig !== undefined) data.displayConfig = body.displayConfig;

  const campaign = await prisma.campaign.update({ where: { slug: params.slug }, data });
  const title = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
  createNotification(`Đã cập nhật campaign "${title}".`, "campaign-update").catch(err => console.error("notification failed", err));
  return NextResponse.json(campaign);
}
```

(`GET` and `DELETE` in that file are unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/admin-campaigns.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/campaigns tests/app/api/admin-campaigns.test.ts
git commit -m "fix: validate slug format server-side and whitelist campaign PATCH fields"
```

---

### Task 4: Admin template write paths — PATCH field whitelist, frame image size limit, safe JSON parsing

**Bugs:**
- `PATCH /api/admin/campaigns/[slug]/templates/[id]` does `prisma.template.updateMany({ data: body })` — the raw client body is written directly, with no field whitelist. A client could send `campaignId` to reassign a Template to a different Campaign despite the `where` clause scoping the *lookup* to the URL's campaign.
- `POST .../templates` has no server-side size limit on the uploaded frame image (the admin form enforces 5MB client-side only).
- `JSON.parse(form.get("overlayConfig") as string)` is unguarded in the same POST handler.

**Files:**
- Modify: `src/app/api/admin/campaigns/[slug]/templates/route.ts`
- Modify: `src/app/api/admin/campaigns/[slug]/templates/[id]/route.ts`
- Test: `tests/app/api/admin-templates.test.ts`

**Interfaces:**
- No change to either route's exported signatures. `PATCH`'s accepted fields are now explicitly `name` and `overlayConfig` — exactly what the admin UI already sends (`src/app/admin/campaigns/[slug]/templates/page.tsx`'s `handleUpdate`), so no frontend change is needed.

- [ ] **Step 1: Write the failing tests**

Add these three tests to `tests/app/api/admin-templates.test.ts`, inside the existing `describe("admin templates API", ...)` block, after the existing tests:

```ts
  it("POST returns 400 when the frame image exceeds 5MB", async () => {
    const form = new FormData();
    form.set("name", "Khung to");
    form.set("overlayConfig", JSON.stringify({ photoArea: { x: 10, y: 10, w: 50, h: 50 }, textOverlays: [] }));
    form.set("frameImage", new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }), "big.png");

    const res = await POST(new Request("http://x", { method: "POST", body: form }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
    expect(prisma.template.create).not.toHaveBeenCalled();
  });

  it("POST returns 400 when overlayConfig is not valid JSON", async () => {
    const form = new FormData();
    form.set("name", "Khung to");
    form.set("overlayConfig", "{not-json");
    form.set("frameImage", new Blob([Buffer.from("png")], { type: "image/png" }), "frame.png");

    const res = await POST(new Request("http://x", { method: "POST", body: form }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("PATCH ignores fields outside the whitelist, such as campaignId", async () => {
    (prisma.template.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.template.findUnique as any).mockResolvedValue({ id: "t1" });

    await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ name: "Tên mới", campaignId: "other-campaign-id" }) }),
      { params: { slug: "fpt38", id: "t1" } },
    );

    expect(prisma.template.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", campaign: { slug: "fpt38" } },
      data: { name: "Tên mới" },
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/admin-templates.test.ts`
Expected: the 2 new "POST returns 400..." tests FAIL because the route currently has no size check (uploads the oversized blob and calls `prisma.template.create`) and no JSON-parse guard (throws unhandled, producing a 500 not a clean 400). The "PATCH ignores fields..." test FAILS because `prisma.template.updateMany` is currently called with `data: { name: "Tên mới", campaignId: "other-campaign-id" }`, not the filtered object.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/app/api/admin/campaigns/[slug]/templates/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStorage } from "@/lib/storage";

const MAX_FRAME_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const name = form.get("name") as string;
  const frameImage = form.get("frameImage") as File;

  let overlayConfig: unknown;
  try {
    overlayConfig = JSON.parse(form.get("overlayConfig") as string);
  } catch {
    return NextResponse.json({ error: "Invalid overlayConfig JSON" }, { status: 400 });
  }

  if (!frameImage || frameImage.size > MAX_FRAME_IMAGE_BYTES) {
    return NextResponse.json({ error: "Frame image missing or exceeds 5MB" }, { status: 400 });
  }

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

Replace the `PATCH` handler in `src/app/api/admin/campaigns/[slug]/templates/[id]/route.ts` with:

```ts
export async function PATCH(req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();

  const data: Prisma.TemplateUpdateManyMutationInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.overlayConfig !== undefined) data.overlayConfig = body.overlayConfig;

  const result = await prisma.template.updateMany({
    where: { id: params.id, campaign: { slug: params.slug } },
    data,
  });
  if (result.count === 0) {
    return NextResponse.json({ error: `Template "${params.id}" not found in campaign "${params.slug}"` }, { status: 404 });
  }
  const template = await prisma.template.findUnique({ where: { id: params.id } });
  return NextResponse.json(template);
}
```

(`DELETE` in that same file is unchanged; `Prisma` is already imported there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/admin-templates.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/campaigns/[slug]/templates tests/app/api/admin-templates.test.ts
git commit -m "fix: whitelist template PATCH fields, cap frame image size, guard JSON parsing"
```

---

### Task 5: Shared `Select` component — show the selected item's label, not its raw value

**Bug:** Every dropdown built on the shared `Select`/`SelectValue` component (Ngôn ngữ, Trạng thái in the campaign form; Loại in the template form's overlay editor) displays the raw option `value` (e.g. `"draft"`, `"vi"`) instead of its label (`"Nháp"`, `"Tiếng Việt"`) once selected. Confirmed by comparing directly against the running demo, which uses a plain `<select>` and correctly shows `"Tiếng Việt"` / `"Bản nháp"`. Root cause: `<SelectValue />` is rendered with no `children`, so base-ui's `Select.Value` has no item registry to resolve a label from and falls back to the raw value (per `node_modules/@base-ui/react/select/value/SelectValue.js`, which documents passing `children` as `(value) => label` for exactly this case).

**Files:**
- Modify: `src/app/admin/campaigns/campaign-form.tsx`
- Modify: `src/app/admin/campaigns/[slug]/templates/template-form.tsx`
- Test: `tests/app/admin/campaign-form.test.tsx`
- Test: `tests/app/admin/template-form.test.tsx`

**Interfaces:**
- No prop or exported-component changes — this is a rendering-only fix at each of the 3 `<SelectValue />` call sites.

- [ ] **Step 1: Write the failing tests**

Add this test to `tests/app/admin/campaign-form.test.tsx`, inside the existing `describe("CampaignForm", ...)` block, after the existing tests:

```ts
  it("displays the selected status and language labels, not their raw values", () => {
    render(
      <CampaignForm
        onSubmit={vi.fn()}
        initial={{
          slug: "fpt38",
          status: "archived",
          startDate: "2026-08-13",
          endDate: "2026-09-13",
          language: "en",
          displayConfig: { title: "T", description: "", ctaLabel: "CTA" },
        }}
      />,
    );

    expect(screen.getByText("Lưu trữ")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
  });
```

Add this test to `tests/app/admin/template-form.test.tsx`, inside the existing `describe("TemplateForm", ...)` block, after the existing tests:

```ts
  it("displays the selected overlay type label, not its raw value", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Thêm trường overlay" }));

    expect(screen.getByText("Tự do")).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx tests/app/admin/template-form.test.tsx`
Expected: both new tests FAIL. The campaign-form one fails on `screen.getByText("Lưu trữ")` — `Unable to find an element with the text: Lưu trữ` (the trigger shows `"archived"` instead). The template-form one fails the same way — the newly-added overlay row's Loại trigger shows `"text"` instead of `"Tự do"`.

- [ ] **Step 3: Write minimal implementation**

In `src/app/admin/campaigns/campaign-form.tsx`, replace the two `<SelectValue />` usages:

```tsx
          <Select value={language} onValueChange={v => setLanguage(v as "vi" | "en")}>
            <SelectTrigger id="campaign-language">
              <SelectValue>{(v: string) => ({ vi: "Tiếng Việt", en: "English" }[v] ?? v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">Tiếng Việt</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
```

```tsx
          <Select value={status} onValueChange={v => setStatus(v as "draft" | "active" | "archived")}>
            <SelectTrigger id="campaign-status">
              <SelectValue>{(v: string) => ({ draft: "Nháp", active: "Hoạt động", archived: "Lưu trữ" }[v] ?? v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Nháp</SelectItem>
              <SelectItem value="active">Hoạt động</SelectItem>
              <SelectItem value="archived">Lưu trữ</SelectItem>
            </SelectContent>
          </Select>
```

(Every other line in the file — imports, other fields, `handleSubmit`, the JSX around these two `Select`s — is unchanged.)

In `src/app/admin/campaigns/[slug]/templates/template-form.tsx`, replace the single `<SelectValue />` usage (currently at line 136):

```tsx
                <SelectTrigger id={`overlay-type-${index}`}>
                  <SelectValue>{(v: string) => ({ text: "Tự do", select: "Danh sách chọn" }[v] ?? v)}</SelectValue>
                </SelectTrigger>
```

(Everything else in that file is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx tests/app/admin/template-form.test.tsx`
Expected: PASS (7 + 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/campaigns/campaign-form.tsx src/app/admin/campaigns/[slug]/templates/template-form.tsx tests/app/admin/campaign-form.test.tsx tests/app/admin/template-form.test.tsx
git commit -m "fix: show selected label instead of raw value in Select dropdowns"
```

---

### Task 6: Public site — hide the "Tạo avatar" action for a campaign with zero templates

**Bug:** An `active` campaign with no templates yet still shows a fully clickable "Tạo avatar ngay" card on the homepage, and its detail page (`/c/[slug]`) renders the empty avatar-creation UI with no explanation — same underlying issue in both places: nothing checks whether the campaign actually has templates before offering to create an avatar.

**Files:**
- Modify: `src/app/api/campaigns/route.ts`
- Modify: `src/app/campaigns-client.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/c/[slug]/page.tsx`
- Test: `tests/app/api/campaigns.test.ts`
- Test: `tests/app/home-page.test.tsx` (new)
- Test: `tests/app/c-slug-page.test.tsx` (new)

**Interfaces:**
- `fetchActiveCampaigns()`'s resolved `Campaign[]` items now include `_count: { templates: number }` (Task 6 depends on `GET /api/campaigns` including this field; nothing else in the codebase reads `fetchActiveCampaigns()` besides `HomePage`).
- `CampaignPage` (`src/app/c/[slug]/page.tsx`)'s exported default function signature is unchanged; it now renders a message instead of `<CampaignCompositor>` when `campaign.templates.length === 0`.

- [ ] **Step 1: Write the failing tests**

Update the existing test in `tests/app/api/campaigns.test.ts` — replace the full file with:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: { campaign: { findMany: vi.fn() } },
}));

import { GET } from "../../../src/app/api/campaigns/route";
import { prisma } from "../../../src/lib/prisma";

describe("GET /api/campaigns", () => {
  it("returns every active campaign currently within its date range as an array", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      { id: "1", slug: "fpt38", status: "active", _count: { templates: 1 } },
      { id: "2", slug: "techweek-2026", status: "active", _count: { templates: 2 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(prisma.campaign.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "active",
        startDate: expect.objectContaining({ lte: expect.any(Date) }),
        endDate: expect.objectContaining({ gte: expect.any(Date) }),
      }),
      include: { _count: { select: { templates: true } } },
    }));
  });
});
```

Create `tests/app/home-page.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HomePage from "../../src/app/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HomePage", () => {
  it("shows a disabled hint instead of a link for a campaign with no templates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "empty-campaign", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi", displayConfig: { title: "Chưa có khung", description: "", ctaLabel: "Tạo avatar ngay" },
        _count: { templates: 0 },
      }],
    });

    render(await HomePage());

    expect(screen.getByText("Chưa có khung ảnh, vui lòng quay lại sau.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links to the campaign detail page when templates exist", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "fpt38", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi", displayConfig: { title: "FPT 38", description: "", ctaLabel: "Tạo avatar ngay" },
        _count: { templates: 1 },
      }],
    });

    render(await HomePage());

    expect(screen.getByRole("link")).toHaveAttribute("href", "/c/fpt38");
  });
});
```

Create `tests/app/c-slug-page.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CampaignPage from "../../src/app/c/[slug]/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CampaignPage", () => {
  it("shows a friendly message instead of the compositor when the campaign has no templates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slug: "empty-campaign", templates: [] }),
    });

    render(await CampaignPage({ params: { slug: "empty-campaign" } }));

    expect(screen.getByText("Chiến dịch này chưa có khung ảnh nào. Vui lòng quay lại sau.")).toBeTruthy();
  });

  it("renders the compositor when the campaign has templates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "fpt38",
        templates: [{ id: "t1", name: "Khung cam", frameImageKey: "frames/x.png", overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }],
      }),
    });

    render(await CampaignPage({ params: { slug: "fpt38" } }));

    expect(screen.getByText("Chọn khung")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/campaigns.test.ts tests/app/home-page.test.tsx tests/app/c-slug-page.test.tsx`
Expected: `campaigns.test.ts` FAILS (the route's `findMany` call doesn't include `include: { _count: ... }` yet). `home-page.test.tsx` FAILS to import (`fetch` mock data has `_count` but the page doesn't read it yet, so both cards render as links) — specifically the first test fails because the hint text is never rendered and a link IS present. `c-slug-page.test.tsx`'s first test FAILS because the compositor renders unconditionally (`"Chọn khung"` heading appears even for the empty-templates case, but the expected message does not).

- [ ] **Step 3: Write minimal implementation**

In `src/app/api/campaigns/route.ts`, add `_count` to the query:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "active",
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: { _count: { select: { templates: true } } },
  });
  return NextResponse.json(campaigns);
}
```

In `src/app/campaigns-client.ts`, add the field to the `Campaign` interface:

```ts
import { getBaseUrl } from "@/lib/base-url";

export interface Campaign {
  slug: string;
  status: string;
  startDate: string;
  endDate: string;
  displayConfig: { title: string; description: string; ctaLabel: string; badge?: string };
  language: "vi" | "en";
  _count: { templates: number };
}

export async function fetchActiveCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns`, { cache: "no-store" });
  return res.json();
}
```

Replace the full contents of `src/app/page.tsx` with:

```tsx
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
      {campaigns.map(c => {
        const notReady = c._count.templates === 0;
        const cardClassName = "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md";
        const cardBody = (
          <>
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
              {notReady && (
                <div className="text-xs italic text-muted-foreground">Chưa có khung ảnh, vui lòng quay lại sau.</div>
              )}
              <span
                className={
                  notReady
                    ? "mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background opacity-50"
                    : "mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity group-hover:opacity-90"
                }
              >
                {c.displayConfig.ctaLabel}
              </span>
            </div>
          </>
        );

        if (notReady) {
          return (
            <div key={c.slug} className={cardClassName}>
              {cardBody}
            </div>
          );
        }

        return (
          <Link key={c.slug} href={`/c/${c.slug}`} className={cardClassName}>
            {cardBody}
          </Link>
        );
      })}
    </div>
  );
}
```

In `src/app/c/[slug]/page.tsx`, add the guard:

```tsx
import { getBaseUrl } from "@/lib/base-url";
import { CampaignCompositor, type Template } from "./campaign-compositor";

async function fetchCampaign(slug: string): Promise<{ templates: Template[] } | null> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function CampaignPage({ params }: { params: { slug: string } }) {
  const campaign = await fetchCampaign(params.slug);

  if (!campaign) {
    return <p>Không tìm thấy chiến dịch này.</p>;
  }

  if (campaign.templates.length === 0) {
    return <p>Chiến dịch này chưa có khung ảnh nào. Vui lòng quay lại sau.</p>;
  }

  return <CampaignCompositor templates={campaign.templates} />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/campaigns.test.ts tests/app/home-page.test.tsx tests/app/c-slug-page.test.tsx`
Expected: PASS (1 + 2 + 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/route.ts src/app/campaigns-client.ts src/app/page.tsx src/app/c/[slug]/page.tsx tests/app/api/campaigns.test.ts tests/app/home-page.test.tsx tests/app/c-slug-page.test.tsx
git commit -m "fix: hide avatar-creation action for campaigns with no templates yet"
```

---

### Task 7: Notification bell — match demo polish (per-type icons, relative time, empty-state copy)

**Gaps found comparing directly against the running demo:**
- Demo shows a colored icon per notification type (blue=create, red=delete, green=download, orange=other); the app shows text only.
- Demo shows relative time ("Vừa xong" / "N phút trước" / "N giờ trước", falling back to a full date only past 24h); the app always shows a full fixed date/time.
- Demo's empty-state copy is "Chưa có thông báo nào."; the app's is "Chưa có thông báo." (missing "nào").
- Demo hides the "Đánh dấu đã đọc" / "Xoá tất cả" buttons entirely when there are no notifications; the app always shows them.

**Files:**
- Modify: `src/components/notification-bell.tsx`
- Test: `tests/components/notification-bell.test.tsx`

**Interfaces:**
- No exported-component signature change — `NotificationBell` still takes no props.

- [ ] **Step 1: Write the failing tests**

Add these three tests to `tests/components/notification-bell.test.tsx`, inside the existing `describe("NotificationBell", ...)` block, after the existing tests:

```ts
  it("hides the mark-all-read and clear-all buttons and shows the demo-matching empty copy when there are no notifications", async () => {
    mockNotificationsFetch([]);

    render(<NotificationBell />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    expect(screen.getByText("Chưa có thông báo nào.")).toBeTruthy();
    expect(screen.queryByText("Đánh dấu đã đọc")).toBeNull();
    expect(screen.queryByText("Xoá tất cả")).toBeNull();
  });

  it("shows a relative time for a recently created notification", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-create", read: false, createdAt: fiveMinutesAgo },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    expect(screen.getByText("5 phút trước")).toBeTruthy();
  });

  it("renders a distinct type icon alongside the delete icon for each notification", async () => {
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-delete", read: false, createdAt: new Date().toISOString() },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    const deleteButton = screen.getByLabelText("Xoá thông báo");
    const row = deleteButton.parentElement!;
    expect(row.querySelectorAll("svg").length).toBe(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/notification-bell.test.tsx`
Expected: the 3 new tests FAIL — empty-state test fails on both `screen.getByText("Chưa có thông báo nào.")` (current text lacks "nào") and the buttons being present (currently always rendered); relative-time test fails because the item's timestamp renders via `toLocaleString` instead of "5 phút trước"; icon test fails because each row currently only has 1 svg (the delete button's `X`), not 2.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/components/notification-bell.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X, Plus, Trash2, Download, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30000;

function iconForType(type: string) {
  if (type === "download") return { Icon: Download, className: "bg-emerald-600/10 text-emerald-600" };
  if (type === "campaign-create") return { Icon: Plus, className: "bg-blue-600/10 text-blue-600" };
  if (type === "campaign-delete") return { Icon: Trash2, className: "bg-red-600/10 text-red-600" };
  return { Icon: Pencil, className: "bg-orange-600/10 text-orange-600" };
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  return new Date(iso).toLocaleString("vi-VN");
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch("/api/admin/notifications")
      .then(res => (res.ok ? res.json() : []))
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleOutsideClick, true);
    return () => document.removeEventListener("click", handleOutsideClick, true);
  }, []);

  const unreadCount = items.filter(i => !i.read).length;
  const hasItems = items.length > 0;

  async function markAllRead() {
    await fetch("/api/admin/notifications/mark-all-read", { method: "PATCH" });
    load();
  }

  async function deleteOne(id: string) {
    await fetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
    load();
  }

  async function clearAll() {
    await fetch("/api/admin/notifications", { method: "DELETE" });
    load();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Thông báo"
        className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-border bg-card p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-bold text-muted-foreground">Thông báo</span>
            {hasItems && (
              <div className="flex gap-2">
                <button type="button" onClick={markAllRead} className="text-xs font-semibold text-primary hover:underline">
                  Đánh dấu đã đọc
                </button>
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-destructive hover:underline">
                  Xoá tất cả
                </button>
              </div>
            )}
          </div>
          <div className="max-h-80 overflow-auto">
            {!hasItems && (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">Chưa có thông báo nào.</div>
            )}
            {items.map(item => {
              const { Icon, className } = iconForType(item.type);
              return (
                <div
                  key={item.id}
                  className={cn("flex items-start gap-2 rounded-lg px-2 py-2 text-sm", !item.read && "bg-muted/50")}
                >
                  <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", className)}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="flex-1">
                    <div>{item.message}</div>
                    <div className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</div>
                  </div>
                  <button type="button" onClick={() => deleteOne(item.id)} aria-label="Xoá thông báo" className="text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

Note: the icon test's `row.querySelectorAll("svg").length` expects exactly 2 — with this implementation, `row` (the delete button's `parentElement`) is the outer flex container for one notification, which contains the type-icon wrapper's `<svg>` and the delete button's `<svg>` — 2 total, matching.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/notification-bell.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/notification-bell.tsx tests/components/notification-bell.test.tsx
git commit -m "fix: match demo notification-bell polish (icons, relative time, empty-state copy)"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: every test file passes except the pre-existing, unrelated `e2e/example.spec.ts` Playwright failure (already known-broken before this plan, outside its scope).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 4: Regenerate the Prisma client if needed**

This plan does not change `prisma/schema.prisma`, so this step should be a no-op. Confirm with:

Run: `npx prisma generate`
Expected: succeeds without needing a database connection.

- [ ] **Step 5: Commit** (only if any fixups were needed in Steps 1–4; otherwise skip)

```bash
git add -A
git commit -m "fix: address verification findings for backend/frontend bugfixes"
```
