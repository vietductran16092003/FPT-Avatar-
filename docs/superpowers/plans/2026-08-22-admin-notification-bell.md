# Admin Notification Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins an in-app notification bell (unread badge + dropdown) backed by Postgres, firing on campaign create/update/delete and on every successful avatar download, mounted in the admin header only.

**Architecture:** A new `Notification` Prisma model, written to exclusively through a single `createNotification()` helper (which also prunes anything beyond the 50 newest rows). Four existing routes call that helper on their success path. Three new `/api/admin/notifications*` routes expose list/mark-all-read/delete-one/delete-all. A client-side `NotificationBell` component polls the list endpoint every 30s and is mounted in `AdminHeader`.

**Tech Stack:** Next.js 14 App Router route handlers, Prisma/Postgres, React (client components), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-22-admin-notification-bell-design.md`

## Global Constraints

- `type` on `Notification` is a free-form string, not a Prisma enum (matches `Campaign.status`'s existing convention).
- Retention: at most 50 `Notification` rows; every insert prunes anything beyond the 50 newest.
- Notifications fire **only** after the underlying write already succeeded — never on a validation/404/409 failure path.
- No bell on the public site; admin header only.
- No per-user read state — `read` is one shared boolean per row.
- No bilingual notification text — `message` is a single Vietnamese string (admin UI has no i18n toggle anywhere today).
- The notification-writing helper (`createNotification`) is the only code path allowed to touch `prisma.notification.*` — route handlers that need to notify call the helper, never Prisma directly.

---

### Task 1: `Notification` Prisma model

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/prisma-schema.test.ts`

**Interfaces:**
- Produces: a Prisma model `Notification` with fields `id: String`, `message: String`, `type: String`, `read: Boolean`, `createdAt: DateTime`, accessible at runtime as `prisma.notification` (Task 2 depends on this).

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe("Prisma schema", ...)` block in `tests/prisma-schema.test.ts` (after the last existing test):

```ts
  it("defines Notification with message, type, read and createdAt", () => {
    const fields = Prisma.dmmf.datamodel.models.find(m => m.name === "Notification")!.fields.map(f => f.name);
    expect(fields).toEqual(expect.arrayContaining(["id", "message", "type", "read", "createdAt"]));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prisma-schema.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'fields')`, because no model named `Notification` exists yet in `Prisma.dmmf.datamodel.models`.

- [ ] **Step 3: Add the model and regenerate the Prisma client**

Append to the end of `prisma/schema.prisma` (after the `GeneratedAvatar` model):

```prisma
model Notification {
  id        String   @id @default(cuid())
  message   String
  type      String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([createdAt])
}
```

Run: `npx prisma generate`

This regenerates the Prisma client (including `Prisma.dmmf`) from the schema file alone — it does not require a reachable database.

Separately, apply the migration against a real database when one is reachable:

```bash
npx prisma migrate dev --name add_notification
```

If Postgres is not reachable in your environment (`npx prisma migrate dev` fails to connect), skip it for now — `npx prisma generate` above is sufficient for every test in this plan, all of which mock `prisma` rather than hitting a real database. Before this ships to any real database, someone with a reachable Postgres must run the manual fallback below, which creates the migration by hand instead of via `migrate dev`:

1. Create a new folder under `prisma/migrations/` named `<UTC timestamp>_add_notification` (fourteen digits, `YYYYMMDDHHMMSS`, matching the existing `20260821043047_init` folder's naming).
2. Inside it, create `migration.sql` with:

```sql
-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
```

3. Run `npx prisma migrate resolve --applied <folder name>` once connected to the real database, so Prisma's migration history stays in sync.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prisma-schema.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma tests/prisma-schema.test.ts
git commit -m "feat: add Notification model to schema"
```

---

### Task 2: `createNotification` helper

**Files:**
- Create: `src/lib/notifications.ts`
- Test: `tests/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `prisma.notification.create`, `prisma.notification.findMany`, `prisma.notification.deleteMany` (from Task 1's model, via `@/lib/prisma`).
- Produces: `createNotification(message: string, type: string): Promise<void>`, importable from `@/lib/notifications` (Tasks 4 and 5 depend on this).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/notifications.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    notification: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { createNotification } from "../../src/lib/notifications";
import { prisma } from "../../src/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.notification.findMany as any).mockResolvedValue([]);
});

describe("createNotification", () => {
  it("inserts a notification row with the given message and type", async () => {
    await createNotification('Đã tạo campaign mới "FPT 38".', "campaign-create");

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { message: 'Đã tạo campaign mới "FPT 38".', type: "campaign-create" },
    });
  });

  it("deletes notifications beyond the 50 newest", async () => {
    (prisma.notification.findMany as any).mockResolvedValue([{ id: "old1" }, { id: "old2" }]);

    await createNotification("msg", "campaign-create");

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      skip: 50,
      select: { id: true },
    });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["old1", "old2"] } },
    });
  });

  it("does not call deleteMany when there is nothing beyond 50", async () => {
    (prisma.notification.findMany as any).mockResolvedValue([]);

    await createNotification("msg", "campaign-create");

    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/notifications.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/notifications"` (the module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/notifications.ts`:

```ts
import { prisma } from "@/lib/prisma";

const MAX_NOTIFICATIONS = 50;

export async function createNotification(message: string, type: string): Promise<void> {
  await prisma.notification.create({ data: { message, type } });

  const excess = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    skip: MAX_NOTIFICATIONS,
    select: { id: true },
  });

  if (excess.length > 0) {
    await prisma.notification.deleteMany({ where: { id: { in: excess.map(n => n.id) } } });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/notifications.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications.ts tests/lib/notifications.test.ts
git commit -m "feat: add createNotification helper with 50-row retention"
```

---

### Task 3: Notification API routes

**Files:**
- Create: `src/app/api/admin/notifications/route.ts`
- Create: `src/app/api/admin/notifications/mark-all-read/route.ts`
- Create: `src/app/api/admin/notifications/[id]/route.ts`
- Test: `tests/app/api/admin-notifications.test.ts`

**Interfaces:**
- Consumes: `requireAdmin()` from `@/lib/require-admin` (returns `{ ok: true, userId: string } | { ok: false, response: Response }`); `prisma.notification.findMany/deleteMany/updateMany/delete` via `@/lib/prisma`.
- Produces: `GET /api/admin/notifications` → `NotificationRow[]`; `DELETE /api/admin/notifications` → `{ ok: true }`; `PATCH /api/admin/notifications/mark-all-read` → `{ ok: true }`; `DELETE /api/admin/notifications/[id]` → `{ ok: true }` or 404 `{ error: string }`. These four endpoints are what Task 6's `NotificationBell` component calls.

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/admin-notifications.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../../src/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    notification: { findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  },
}));

import { GET, DELETE as DELETE_ALL } from "../../../src/app/api/admin/notifications/route";
import { PATCH } from "../../../src/app/api/admin/notifications/mark-all-read/route";
import { DELETE as DELETE_ONE } from "../../../src/app/api/admin/notifications/[id]/route";
import { prisma } from "../../../src/lib/prisma";
import { requireAdmin } from "../../../src/lib/require-admin";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("mock", { code, clientVersion: "5.22.0" });
}

describe("admin notifications API", () => {
  it("GET returns the 50 most recent notifications", async () => {
    (prisma.notification.findMany as any).mockResolvedValue([
      { id: "n1", message: "m", type: "campaign-create", read: false, createdAt: new Date() },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" }, take: 50 });
  });

  it("GET rejects when requireAdmin fails", async () => {
    (requireAdmin as any).mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("DELETE (collection) clears every notification", async () => {
    const res = await DELETE_ALL();

    expect(res.status).toBe(200);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({});
  });

  it("PATCH mark-all-read sets read true on every notification", async () => {
    const res = await PATCH();

    expect(res.status).toBe(200);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ data: { read: true } });
  });

  it("DELETE /[id] removes the notification by id", async () => {
    (prisma.notification.delete as any).mockResolvedValue({ id: "n1" });

    const res = await DELETE_ONE(new Request("http://x", { method: "DELETE" }), { params: { id: "n1" } });

    expect(res.status).toBe(200);
    expect(prisma.notification.delete).toHaveBeenCalledWith({ where: { id: "n1" } });
  });

  it("DELETE /[id] returns 404 when the notification does not exist", async () => {
    (prisma.notification.delete as any).mockRejectedValue(prismaError("P2025"));

    const res = await DELETE_ONE(new Request("http://x", { method: "DELETE" }), { params: { id: "nope" } });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-notifications.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/app/api/admin/notifications/route"` (none of the three route files exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/admin/notifications/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(notifications);
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await prisma.notification.deleteMany({});
  return NextResponse.json({ ok: true });
}
```

Create `src/app/api/admin/notifications/mark-all-read/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function PATCH() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await prisma.notification.updateMany({ data: { read: true } });
  return NextResponse.json({ ok: true });
}
```

Create `src/app/api/admin/notifications/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await prisma.notification.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-notifications.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/notifications tests/app/api/admin-notifications.test.ts
git commit -m "feat: add admin notifications list/mark-read/delete API routes"
```

---

### Task 4: Wire notifications into admin campaign routes

**Files:**
- Modify: `src/app/api/admin/campaigns/route.ts`
- Modify: `src/app/api/admin/campaigns/[slug]/route.ts`
- Test: `tests/app/api/admin-campaigns.test.ts`

**Interfaces:**
- Consumes: `createNotification(message: string, type: string): Promise<void>` from `@/lib/notifications` (Task 2).

- [ ] **Step 1: Write the failing tests**

At the top of `tests/app/api/admin-campaigns.test.ts`, add a mock for the notifications module (needed so the real `prisma.notification.*` — which this file's `prisma` mock does not define — is never reached) and import it for assertions. The file should start:

```ts
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
vi.mock("../../../src/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

import { GET, POST } from "../../../src/app/api/admin/campaigns/route";
import { PATCH, DELETE } from "../../../src/app/api/admin/campaigns/[slug]/route";
import { prisma } from "../../../src/lib/prisma";
import { requireAdmin } from "../../../src/lib/require-admin";
import { createNotification } from "../../../src/lib/notifications";
```

(Only the three `vi.mock` blocks and the final import line are new — the rest of the existing header is unchanged.)

Then add these five tests inside the existing `describe("admin campaigns API", ...)` block, after the existing tests:

```ts
  it("POST notifies with the campaign title after creating", async () => {
    (prisma.campaign.create as any).mockResolvedValue({ slug: "techweek-2026", displayConfig: { title: "Tech Week 2026" } });

    await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "techweek-2026", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "Tech Week 2026" } }),
    }));

    expect(createNotification).toHaveBeenCalledWith('Đã tạo campaign mới "Tech Week 2026".', "campaign-create");
  });

  it("POST does not notify when the slug already exists", async () => {
    (prisma.campaign.create as any).mockRejectedValue(prismaError("P2002"));

    await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "fpt38", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "T" } }),
    }));

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("PATCH notifies with the campaign title after updating", async () => {
    (prisma.campaign.update as any).mockResolvedValue({ slug: "fpt38", displayConfig: { title: "FPT 38" } });

    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ status: "active" }) }), { params: { slug: "fpt38" } });

    expect(createNotification).toHaveBeenCalledWith('Đã cập nhật campaign "FPT 38".', "campaign-update");
  });

  it("DELETE notifies with the campaign title after deleting", async () => {
    (prisma.campaign.delete as any).mockResolvedValue({ slug: "fpt38", displayConfig: { title: "FPT 38" } });

    await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38" } });

    expect(createNotification).toHaveBeenCalledWith('Đã xoá campaign "FPT 38".', "campaign-delete");
  });

  it("DELETE does not notify when the campaign does not exist", async () => {
    (prisma.campaign.delete as any).mockRejectedValue(prismaError("P2025"));

    await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "nope" } });

    expect(createNotification).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify the 5 new ones fail**

Run: `npx vitest run tests/app/api/admin-campaigns.test.ts`
Expected: the 6 pre-existing tests PASS (the new `notifications` mock doesn't change their behavior); the 5 new tests FAIL, each with `expected "createNotification" to be called ... but it was not called` (or, for the two "does not notify" tests, they'll actually already pass trivially since `createNotification` is never called anywhere yet — see note below).

Note: the two "does not notify" tests will pass immediately since no code calls `createNotification` yet. That's expected — they exist to lock in the no-notification-on-failure behavior once Step 3 wires up the success path; watching the three "notifies..." tests fail (and the two "does not notify" tests already green) is the correct RED state here.

- [ ] **Step 3: Write minimal implementation**

In `src/app/api/admin/campaigns/route.ts`, add the import and the notification call on the success path:

```ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { createNotification } from "@/lib/notifications";

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
    await createNotification(`Đã tạo campaign mới "${title}".`, "campaign-create");
    return NextResponse.json(campaign);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `Campaign slug "${body.slug}" already exists` }, { status: 409 });
    }
    throw err;
  }
}
```

In `src/app/api/admin/campaigns/[slug]/route.ts`, add the import and the two notification calls:

```ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStorage } from "@/lib/storage";
import { createNotification } from "@/lib/notifications";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaign = await prisma.campaign.findUnique({
    where: { slug: params.slug },
    include: { templates: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: `Campaign "${params.slug}" not found` }, { status: 404 });
  }

  const storage = getStorage();
  const templates = campaign.templates.map(t => ({
    ...t,
    frameImageUrl: storage.getPublicUrl(t.frameImageKey),
  }));

  return NextResponse.json({ ...campaign, templates });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const campaign = await prisma.campaign.update({ where: { slug: params.slug }, data: body });
  const title = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
  await createNotification(`Đã cập nhật campaign "${title}".`, "campaign-update");
  return NextResponse.json(campaign);
}

export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const campaign = await prisma.campaign.delete({ where: { slug: params.slug } });
    const title = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
    await createNotification(`Đã xoá campaign "${title}".`, "campaign-delete");
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/admin-campaigns.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/campaigns tests/app/api/admin-campaigns.test.ts
git commit -m "feat: notify on campaign create/update/delete"
```

---

### Task 5: Wire notification into the avatar generate route

**Files:**
- Modify: `src/app/api/campaigns/[slug]/generate/route.ts`
- Test: `tests/app/api/campaigns-generate.test.ts`

**Interfaces:**
- Consumes: `createNotification(message: string, type: string): Promise<void>` from `@/lib/notifications` (Task 2).

- [ ] **Step 1: Write the failing test**

At the top of `tests/app/api/campaigns-generate.test.ts`, add a mock for the notifications module and import it. The file should start:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    template: { findFirst: vi.fn() },
    campaign: { findUniqueOrThrow: vi.fn() },
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
  createNotification: vi.fn(),
}));

import { POST } from "../../../src/app/api/campaigns/[slug]/generate/route";
import { prisma } from "../../../src/lib/prisma";
import { createNotification } from "../../../src/lib/notifications";
```

(Only the new `vi.mock("../../../src/lib/notifications", ...)` block and the `createNotification` import line are added — everything else in the existing header, including the `overlays` const and `multipartRequest` helper below it, is unchanged.)

Then add these two tests inside the existing `describe("POST /api/campaigns/:slug/generate", ...)` block, after the existing tests:

```ts
  it("notifies admins after a successful avatar generation", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.campaign.findUniqueOrThrow as any).mockResolvedValue({ id: "c1", slug: "fpt38", displayConfig: { title: "FPT tròn 38 tuổi" } });
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
```

- [ ] **Step 2: Run tests to verify they fail as expected**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: the 3 pre-existing tests PASS; `"notifies admins after a successful avatar generation"` FAILS with `expected "createNotification" to be called with ... but it was not called`; `"does not notify when the template does not belong to the campaign"` already PASSES trivially (same reasoning as Task 4 Step 2 — nothing calls `createNotification` yet).

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/app/api/campaigns/[slug]/generate/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { compositeAvatar } from "@/lib/compositing/server-compositor";
import { validateOverlayValues } from "@/lib/compositing/validate-overlay-values";
import { createNotification } from "@/lib/notifications";

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const form = await req.formData();
  const templateId = form.get("templateId") as string;
  const overlayValues = JSON.parse(form.get("overlayValues") as string) as Record<string, string>;
  const photoFile = form.get("photo") as File;

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

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { slug: params.slug } });

  await prisma.generatedAvatar.create({
    data: {
      campaignId: campaign.id,
      templateId: template.id,
      overlayValues,
      resultImageKey: resultKey,
    },
  });

  const campaignTitle = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
  await createNotification(`Có lượt tải avatar mới: ${campaignTitle} – ${template.name}.`, "download");

  return NextResponse.json({ resultUrl: storage.getPublicUrl(resultKey) });
}
```

The only behavioral changes from the previous version: `prisma.campaign.findUniqueOrThrow(...)` is now called once and stored in `campaign` (previously it was called inline just to read `.id`), and a `createNotification` call is added after the `GeneratedAvatar` is created.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns tests/app/api/campaigns-generate.test.ts
git commit -m "feat: notify on successful avatar generation"
```

---

### Task 6: `NotificationBell` component

**Files:**
- Create: `src/components/notification-bell.tsx`
- Test: `tests/components/notification-bell.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/notifications`, `PATCH /api/admin/notifications/mark-all-read`, `DELETE /api/admin/notifications/[id]`, `DELETE /api/admin/notifications` (all from Task 3); `cn` from `@/lib/utils`.
- Produces: `NotificationBell` component, exported from `@/components/notification-bell` (Task 7 depends on this).

- [ ] **Step 1: Write the failing test**

Create `tests/components/notification-bell.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "../../src/components/notification-bell";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockNotificationsFetch(items: any[] = []) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => items });
}

describe("NotificationBell", () => {
  it("shows the unread count badge from the fetched list", async () => {
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-create", read: false, createdAt: "2026-08-22T00:00:00.000Z" },
      { id: "n2", message: "B", type: "campaign-create", read: true, createdAt: "2026-08-22T00:00:00.000Z" },
    ]);

    render(<NotificationBell />);

    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
  });

  it("opens the dropdown and lists the fetched notifications", async () => {
    mockNotificationsFetch([
      { id: "n1", message: 'Đã tạo campaign mới "FPT 38".', type: "campaign-create", read: false, createdAt: "2026-08-22T00:00:00.000Z" },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await userEvent.click(screen.getByLabelText("Thông báo"));

    expect(screen.getByText('Đã tạo campaign mới "FPT 38".')).toBeTruthy();
  });

  it("marks all as read and clears the badge", async () => {
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-create", read: false, createdAt: "2026-08-22T00:00:00.000Z" },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "n1", message: "A", type: "campaign-create", read: true, createdAt: "2026-08-22T00:00:00.000Z" }] });

    await userEvent.click(screen.getByText("Đánh dấu đã đọc"));

    await waitFor(() => expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/admin/notifications/mark-all-read", { method: "PATCH" }));
    await waitFor(() => expect(screen.queryByText("1")).toBeNull());
  });

  it("deletes a single notification", async () => {
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-create", read: false, createdAt: "2026-08-22T00:00:00.000Z" },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    await userEvent.click(screen.getByLabelText("Xoá thông báo"));

    await waitFor(() => expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/admin/notifications/n1", { method: "DELETE" }));
  });

  it("polls every 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockNotificationsFetch([]);

    render(<NotificationBell />);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30000);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/notification-bell.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/components/notification-bell"` (the component doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/components/notification-bell.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30000;

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
            <div className="flex gap-2">
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-primary hover:underline">
                Đánh dấu đã đọc
              </button>
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-destructive hover:underline">
                Xoá tất cả
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">Chưa có thông báo.</div>
            )}
            {items.map(item => (
              <div
                key={item.id}
                className={cn("flex items-start justify-between gap-2 rounded-lg px-2 py-2 text-sm", !item.read && "bg-muted/50")}
              >
                <div>
                  <div>{item.message}</div>
                  <div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("vi-VN")}</div>
                </div>
                <button type="button" onClick={() => deleteOne(item.id)} aria-label="Xoá thông báo" className="text-muted-foreground hover:text-destructive">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/notification-bell.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/notification-bell.tsx tests/components/notification-bell.test.tsx
git commit -m "feat: add NotificationBell component"
```

---

### Task 7: Mount `NotificationBell` in `AdminHeader`

**Files:**
- Modify: `src/components/admin-header.tsx`
- Modify: `tests/components/admin-header.test.tsx`

**Interfaces:**
- Consumes: `NotificationBell` from `@/components/notification-bell` (Task 6).

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/components/admin-header.test.tsx` with:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOutMock(...args) }));

import { AdminHeader } from "../../src/components/admin-header";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

afterEach(() => {
  cleanup();
  signOutMock.mockClear();
});

describe("AdminHeader", () => {
  it("renders a logout button that calls signOut with the login callback URL", async () => {
    render(<AdminHeader />);

    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/admin/login" });
  });

  it("renders the notification bell", () => {
    render(<AdminHeader />);

    expect(screen.getByLabelText("Thông báo")).toBeTruthy();
  });
});
```

(The only changes from the existing file: the `beforeEach` mocking `global.fetch` — needed because `NotificationBell` will fetch on mount once Step 3 wires it in — and the new second `it` block.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/admin-header.test.tsx`
Expected: the logout test PASSES; `"renders the notification bell"` FAILS — `Unable to find a label with the text of: Thông báo`.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/components/admin-header.tsx` with:

```tsx
"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";
import { NotificationBell } from "@/components/notification-bell";

export function AdminHeader() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-7 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-[50px] items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1">
          <Image
            src="/fpt-logo.webp"
            alt="FPT"
            width={42}
            height={24}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="text-[15px] font-bold">
          Avatar Frame Platform{" "}
          <span className="font-medium text-muted-foreground">· Admin</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/admin-header.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin-header.tsx tests/components/admin-header.test.tsx
git commit -m "feat: mount NotificationBell in AdminHeader"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: every test file passes except the pre-existing, unrelated `e2e/example.spec.ts` failure (a Playwright suite outside this plan's scope — already known-broken before this plan started).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 4: Commit** (only if any fixups were needed in Steps 1–3; otherwise skip)

```bash
git add -A
git commit -m "fix: address verification findings for notification bell"
```
