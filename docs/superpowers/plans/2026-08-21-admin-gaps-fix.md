# Admin Gaps Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 7 real functional gaps found by comparing the built admin UI against the reference demo (`docs/superpowers/demo/`): missing logout, missing Campaign form fields, no delete confirmation, non-clickable status pill, fake template thumbnails, no upload size limit, and no KPI cards on the Thống kê page.

**Architecture:** All 7 fixes are localized to existing admin files — no new routes except a small, additive extension to two existing API responses (`GET /api/admin/campaigns/:slug` gains `templates[].frameImageUrl`; `GET /api/admin/analytics` gains `status` per row). No schema changes, no new libraries. `next-auth/react`'s `signOut()` needs no `SessionProvider` (only `useSession()` would) — confirmed by the existing `signIn()` usage in `src/app/admin/login/page.tsx`, which also has none.

**Tech Stack:** Next.js 14 (App Router), next-auth v4, Prisma, Tailwind + shadcn/ui, Vitest + Testing Library.

**Spec:** This plan has no separate spec document — it implements the 7 gaps identified in chat by comparing `docs/superpowers/demo/js/core/admin-app.js` against the current `src/app/admin/**` implementation (see conversation).

## Global Constraints

- Every admin API route calls `requireAdmin()` first, matching every existing admin route — no task in this plan adds a new unauthenticated admin surface.
- Do not add the demo's explicitly-excluded features while fixing these gaps: no i18n toggle, no toast manager, no notification bell, no bilingual (VI/EN) duplicate fields — the Campaign model stores one `displayConfig` object per campaign, not per-language content, and this plan does not change that.
- Do not change any existing component's exported prop types unless a task explicitly says so.
- After every task, run `npx tsc --noEmit` and `npx vitest run` — both must be clean (aside from the known, pre-existing, unrelated `e2e/example.spec.ts` Playwright collection failure) before moving to the next task.

---

## Task 1: Admin header — working "Đăng xuất" (logout) button

**Files:**
- Modify: `src/components/admin-header.tsx`
- Test: `tests/components/admin-header.test.tsx`

**Interfaces:**
- Consumes: `signOut` from `next-auth/react` (existing dependency, already used the same way by `signIn` in `src/app/admin/login/page.tsx`).
- Produces: `AdminHeader` remains the default... no — `AdminHeader` remains a named export `export function AdminHeader()`, same as today; only its rendered output gains a logout button. No prop signature (it takes none today and still takes none).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin-header.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOutMock(...args) }));

import { AdminHeader } from "../../src/components/admin-header";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/admin-header.test.tsx`
Expected: FAIL — no button with the accessible name "Đăng xuất" exists yet.

- [ ] **Step 3: Implement the logout button**

```tsx
// src/components/admin-header.tsx
"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";

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
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/admin/login" })}
        className="text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        Đăng xuất
      </button>
    </header>
  );
}
```

Note: this file had no `"use client"` directive before — it was a Server Component. `signOut()` is a client-only function, so the directive is required now.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/admin-header.test.tsx`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin-header.tsx tests/components/admin-header.test.tsx
git commit -m "feat: add working logout button to admin header"
```

---

## Task 2: Campaign form — add Badge, Mô tả, and Nhãn CTA fields

**Files:**
- Modify: `src/app/admin/campaigns/campaign-form.tsx`
- Modify: `tests/app/admin/campaign-form.test.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `CampaignDraft`'s `displayConfig` shape stays `{ title: string; description: string; ctaLabel: string; badge?: string }` (already declared this way — only `title` had an input; `description`/`ctaLabel` silently kept `initial`'s value or a hardcoded default; `badge` had no field at all and was never sent). After this task, all four are real, editable inputs. `CampaignForm`'s exported props (`onSubmit`, `initial`) are unchanged.

- [ ] **Step 1: Extend the existing test file with the three new fields**

Add these test cases to the existing `describe("CampaignForm", ...)` block in `tests/app/admin/campaign-form.test.tsx` (the file already has 4 tests from earlier tasks — add these as new `it(...)` blocks, don't remove the existing ones):

```tsx
  it("submits Badge, Mô tả and Nhãn CTA entered by the admin", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề"), "T");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.type(screen.getByLabelText("Badge"), "38");
    await userEvent.type(screen.getByLabelText("Mô tả"), "Tạo avatar kỷ niệm");
    await userEvent.type(screen.getByLabelText("Nhãn nút CTA"), "Bắt đầu ngay");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      displayConfig: expect.objectContaining({ badge: "38", description: "Tạo avatar kỷ niệm", ctaLabel: "Bắt đầu ngay" }),
    }));
  });

  it("pre-fills Badge, Mô tả and Nhãn CTA from initial when editing", async () => {
    const onSubmit = vi.fn();
    render(
      <CampaignForm
        onSubmit={onSubmit}
        initial={{
          slug: "fpt38",
          status: "active",
          startDate: "2026-08-13",
          endDate: "2026-09-13",
          language: "vi",
          displayConfig: { title: "FPT tròn 38 tuổi", description: "Mô tả cũ", ctaLabel: "CTA cũ", badge: "38" },
        }}
      />,
    );

    expect((screen.getByLabelText("Badge") as HTMLInputElement).value).toBe("38");
    expect((screen.getByLabelText("Mô tả") as HTMLTextAreaElement).value).toBe("Mô tả cũ");
    expect((screen.getByLabelText("Nhãn nút CTA") as HTMLInputElement).value).toBe("CTA cũ");
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx`
Expected: the 2 new tests FAIL (`getByLabelText("Badge")` etc. find nothing); the 6 pre-existing tests (4 from Task 8 of the demo-parity plan, plus 2 more if present) still PASS.

- [ ] **Step 3: Add the three fields to `CampaignForm`**

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
  displayConfig: { title: string; description: string; ctaLabel: string; badge?: string };
}

export function CampaignForm({ onSubmit, initial }: { onSubmit: (draft: CampaignDraft) => void; initial?: CampaignDraft }) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [status, setStatus] = useState<"draft" | "active">(initial?.status ?? "draft");
  const [title, setTitle] = useState(initial?.displayConfig.title ?? "");
  const [badge, setBadge] = useState(initial?.displayConfig.badge ?? "");
  const [description, setDescription] = useState(initial?.displayConfig.description ?? "");
  const [ctaLabel, setCtaLabel] = useState(initial?.displayConfig.ctaLabel ?? "Tạo avatar ngay");
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
      displayConfig: { title, description, ctaLabel, badge: badge || undefined },
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
        <div className="space-y-2">
          <Label htmlFor="campaign-badge">Badge</Label>
          <Input id="campaign-badge" placeholder="VD: 38" value={badge} onChange={e => setBadge(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-cta">Nhãn nút CTA</Label>
          <Input id="campaign-cta" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="campaign-description">Mô tả</Label>
          <textarea
            id="campaign-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        </div>
      </div>
      <Button type="submit" className="w-fit">{initial ? "Cập nhật" : "Lưu"}</Button>
    </form>
  );
}
```

- [ ] **Step 4: Run all CampaignForm tests to verify they pass**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/campaigns/campaign-form.tsx tests/app/admin/campaign-form.test.tsx
git commit -m "feat: add Badge, Mo ta, and CTA label fields to CampaignForm"
```

---

## Task 3: Confirm before deleting a Campaign or a Template

**Files:**
- Modify: `src/app/admin/campaigns/page.tsx`
- Modify: `src/app/admin/campaigns/[slug]/templates/page.tsx`
- Test: `tests/app/admin/campaigns-page.test.tsx` (new)
- Test: `tests/app/admin/templates-page.test.tsx` (new)

**Interfaces:**
- Consumes: `window.confirm` (browser global, mocked in tests).
- Produces: `handleDelete` in both pages now calls `window.confirm(...)` first and returns early (no fetch, no state change) when the admin cancels. No exported signatures change — both are page default exports with no props.

- [ ] **Step 1: Write the failing test for the Campaign list page**

```tsx
// tests/app/admin/campaigns-page.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminCampaignsPage from "../../../src/app/admin/campaigns/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockCampaignsFetch() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ slug: "fpt38", status: "active", language: "vi", startDate: "2026-08-13", endDate: "2026-09-13", displayConfig: { title: "FPT 38" }, _count: { templates: 1 } }],
  });
}

describe("AdminCampaignsPage delete confirmation", () => {
  it("does not call the DELETE endpoint when the admin cancels the confirm dialog", async () => {
    mockCampaignsFetch();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<AdminCampaignsPage />);
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    (global.fetch as any).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/admin/campaigns/fpt38", expect.objectContaining({ method: "DELETE" }));
  });

  it("calls the DELETE endpoint when the admin confirms", async () => {
    mockCampaignsFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminCampaignsPage />);
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/admin/campaigns/fpt38", expect.objectContaining({ method: "DELETE" })));
  });
});
```

- [ ] **Step 2: Write the failing test for the Template list page**

```tsx
// tests/app/admin/templates-page.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useParams: () => ({ slug: "fpt38" }) }));

import AdminTemplatesPage from "../../../src/app/admin/campaigns/[slug]/templates/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockTemplatesFetch() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      templates: [{ id: "t1", name: "Khung cam chuẩn", overlayConfig: { photoArea: { x: 18, y: 14, w: 64, h: 64 } } }],
    }),
  });
}

describe("AdminTemplatesPage delete confirmation", () => {
  it("does not call the DELETE endpoint when the admin cancels the confirm dialog", async () => {
    mockTemplatesFetch();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<AdminTemplatesPage />);
    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());

    (global.fetch as any).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/admin/campaigns/fpt38/templates/t1", expect.objectContaining({ method: "DELETE" }));
  });

  it("calls the DELETE endpoint when the admin confirms", async () => {
    mockTemplatesFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminTemplatesPage />);
    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/admin/campaigns/fpt38/templates/t1", expect.objectContaining({ method: "DELETE" })));
  });
});
```

- [ ] **Step 3: Run both new test files to verify they fail**

Run: `npx vitest run tests/app/admin/campaigns-page.test.tsx tests/app/admin/templates-page.test.tsx`
Expected: FAIL — `window.confirm` is never called by the current `handleDelete` implementations, so the "cancels" tests find `fetch` was still called, and the mock-confirm assertion (`expect(window.confirm).toHaveBeenCalled()`) fails outright.

- [ ] **Step 4: Add the confirm gate to `AdminCampaignsPage`'s `handleDelete`**

In `src/app/admin/campaigns/page.tsx`, change only the `handleDelete` function:

```tsx
  async function handleDelete(slug: string) {
    if (!window.confirm(`Xóa campaign "${slug}"? Không thể hoàn tác.`)) return;
    await fetch(`/api/admin/campaigns/${slug}`, { method: "DELETE" });
    loadCampaigns();
  }
```

- [ ] **Step 5: Add the confirm gate to `AdminTemplatesPage`'s `handleDelete`**

In `src/app/admin/campaigns/[slug]/templates/page.tsx`, change only the `handleDelete` function:

```tsx
  async function handleDelete(id: string) {
    if (!window.confirm("Xóa khung này? Không thể hoàn tác.")) return;
    await fetch(`/api/admin/campaigns/${slug}/templates/${id}`, { method: "DELETE" });
    loadTemplates();
  }
```

- [ ] **Step 6: Run both test files to verify they pass**

Run: `npx vitest run tests/app/admin/campaigns-page.test.tsx tests/app/admin/templates-page.test.tsx`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/campaigns/page.tsx "src/app/admin/campaigns/[slug]/templates/page.tsx" tests/app/admin/campaigns-page.test.tsx tests/app/admin/templates-page.test.tsx
git commit -m "feat: require confirmation before deleting a Campaign or Template"
```

---

## Task 4: Click the status pill to cycle Campaign status (draft ⇄ active)

**Files:**
- Modify: `src/app/admin/campaigns/page.tsx`
- Modify: `tests/app/admin/campaigns-page.test.tsx`

**Interfaces:**
- Consumes: existing `PATCH /api/admin/campaigns/:slug` (already accepts a partial body and applies it via `prisma.campaign.update`).
- Produces: a new `handleCycleStatus(slug: string, currentStatus: string)` function in the page (not exported — internal to the Client Component), wired to an `onClick` on the status `<span>`. No prop signature changes.

- [ ] **Step 1: Add the failing test to `tests/app/admin/campaigns-page.test.tsx`**

Add this test to the existing `describe("AdminCampaignsPage delete confirmation", ...)` block — or add a second `describe` block in the same file; either is fine, just don't remove the Task 3 tests:

```tsx
describe("AdminCampaignsPage status pill", () => {
  it("PATCHes the opposite status when the pill is clicked", async () => {
    mockCampaignsFetch();

    render(<AdminCampaignsPage />);
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByText("Hoạt động"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/campaigns/fpt38",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      }),
    ));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/admin/campaigns-page.test.tsx`
Expected: the new test FAILs — clicking the pill today does nothing (no `onClick`), so `fetch` is never called with a PATCH.

- [ ] **Step 3: Implement `handleCycleStatus` and wire it to the pill**

In `src/app/admin/campaigns/page.tsx`, add the function (near `handleDelete`) and change the status `<span>` to a `<button>`:

```tsx
  async function handleCycleStatus(slug: string, currentStatus: string) {
    const nextStatus = currentStatus === "active" ? "draft" : "active";
    await fetch(`/api/admin/campaigns/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    loadCampaigns();
  }
```

Replace the existing status `<td>` cell body:

```tsx
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleCycleStatus(c.slug, c.status)}
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-bold transition-opacity hover:opacity-80",
                      c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {c.status === "active" ? "Hoạt động" : "Nháp"}
                  </button>
                </td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/admin/campaigns-page.test.tsx`
Expected: PASS (all tests in the file, Task 3's and Task 4's).

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/campaigns/page.tsx tests/app/admin/campaigns-page.test.tsx
git commit -m "feat: click the status pill to toggle a Campaign between draft and active"
```

---

## Task 5: Show the real uploaded frame image on Template cards

**Files:**
- Modify: `src/app/api/admin/campaigns/[slug]/route.ts`
- Modify: `tests/app/api/admin-campaign-detail.test.ts`
- Modify: `src/app/admin/campaigns/[slug]/templates/page.tsx`
- Modify: `tests/app/admin/templates-page.test.tsx`

**Interfaces:**
- Consumes: `getStorage()` (existing, `src/lib/storage/index.ts`) — `getPublicUrl(key: string): string`.
- Produces: `GET /api/admin/campaigns/:slug`'s JSON response gains `templates[].frameImageUrl: string` (computed from the stored `frameImageKey`, alongside the existing raw fields — nothing is removed from the response).

- [ ] **Step 1: Extend the failing test for the detail route**

Add this test to the existing `describe("GET /api/admin/campaigns/:slug", ...)` block in `tests/app/api/admin-campaign-detail.test.ts`. First add the storage mock near the top of the file, alongside the existing `prisma`/`requireAdmin` mocks:

```ts
vi.mock("../../../src/lib/storage", () => ({
  getStorage: () => ({
    getPublicUrl: (key: string) => `http://storage/${key}`,
  }),
}));
```

Then add the test:

```ts
  it("adds a computed frameImageUrl to each template", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({
      slug: "fpt38",
      templates: [{ id: "t1", name: "Khung cam", frameImageKey: "frames/fpt38-orange.png" }],
    });

    const res = await GET(new Request("http://x"), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(body.templates[0].frameImageUrl).toBe("http://storage/frames/fpt38-orange.png");
    expect(body.templates[0].name).toBe("Khung cam"); // existing fields still present
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-campaign-detail.test.ts`
Expected: FAIL — the route's response has no `frameImageUrl` field yet.

- [ ] **Step 3: Compute `frameImageUrl` in the route**

```ts
// src/app/api/admin/campaigns/[slug]/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStorage } from "@/lib/storage";

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
```

(`PATCH` and `DELETE` in this same file are untouched — only `GET` changes.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-campaign-detail.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Extend the Template list page test for the thumbnail**

Add this test to `tests/app/admin/templates-page.test.tsx` (in the existing `describe` block or a new one in the same file):

```tsx
describe("AdminTemplatesPage template thumbnail", () => {
  it("renders the real frame image when frameImageUrl is present", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templates: [{ id: "t1", name: "Khung cam chuẩn", frameImageUrl: "http://storage/frames/fpt38-orange.png", overlayConfig: { photoArea: { x: 18, y: 14, w: 64, h: 64 } } }],
      }),
    });

    render(<AdminTemplatesPage />);

    const img = await screen.findByRole("img", { name: "Khung cam chuẩn" });
    expect(img.getAttribute("src")).toBe("http://storage/frames/fpt38-orange.png");
  });

  it("falls back to the gradient placeholder when frameImageUrl is absent", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templates: [{ id: "t1", name: "Khung cam chuẩn", overlayConfig: { photoArea: { x: 18, y: 14, w: 64, h: 64 } } }],
      }),
    });

    render(<AdminTemplatesPage />);

    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());
    expect(screen.queryByRole("img", { name: "Khung cam chuẩn" })).toBeNull();
  });
});
```

- [ ] **Step 6: Run the two new tests to verify they fail**

Run: `npx vitest run tests/app/admin/templates-page.test.tsx`
Expected: the thumbnail tests FAIL — the page currently always renders the gradient placeholder `<div>`, never an `<img>`.

- [ ] **Step 7: Render the real image when `frameImageUrl` is present**

In `src/app/admin/campaigns/[slug]/templates/page.tsx`, replace the card media block:

```tsx
            <div className="relative aspect-square bg-gradient-to-br from-primary/20 to-secondary/10">
              {t.frameImageUrl ? (
                <img src={t.frameImageUrl} alt={t.name} className="h-full w-full object-contain" />
              ) : (
                <div className="absolute inset-[8%] rounded-lg border-[6px] border-primary/60" />
              )}
            </div>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/app/admin/templates-page.test.tsx`
Expected: PASS (all tests in the file — Task 3, 4-adjacent, and this task's).

- [ ] **Step 9: Run typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add "src/app/api/admin/campaigns/[slug]/route.ts" tests/app/api/admin-campaign-detail.test.ts "src/app/admin/campaigns/[slug]/templates/page.tsx" tests/app/admin/templates-page.test.tsx
git commit -m "feat: show the real uploaded frame image on admin Template cards"
```

---

## Task 6: Enforce a frame-image upload size limit (5MB) in `TemplateForm`

**Files:**
- Modify: `src/app/admin/campaigns/[slug]/templates/template-form.tsx`
- Modify: `tests/app/admin/template-form.test.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `TemplateForm`'s exported props (`onSubmit`, `initial`) are unchanged. A file over 5MB is rejected at selection time (never stored in `frameImage` state, `onSubmit` never called with it) with a visible error, instead of silently being accepted and uploaded.

- [ ] **Step 1: Add the failing test**

Add this test to the existing `describe("TemplateForm", ...)` block in `tests/app/admin/template-form.test.tsx`:

```tsx
  it("rejects a frame image over 5MB with a visible error and does not stage it", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung to");

    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), oversized);

    expect(screen.getByRole("alert").textContent).toMatch(/5MB/);

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/admin/template-form.test.tsx`
Expected: FAIL — today the form accepts any file size; no error is shown, and (since `name` and `frameImage` would both be set) `onSubmit` would actually fire — the test's second assertion (`not.toHaveBeenCalled()`) fails.

- [ ] **Step 3: Add the size check to the file input's `onChange`**

In `src/app/admin/campaigns/[slug]/templates/template-form.tsx`, add a constant near the top of the file (after the imports, before `emptyOverlay`):

```tsx
const MAX_FRAME_IMAGE_BYTES = 5 * 1024 * 1024;
```

Change the frame-image `<Input>`'s `onChange`:

```tsx
          <Input
            id="template-frame"
            type="file"
            accept="image/png"
            onChange={e => {
              const file = e.target.files?.[0] ?? null;
              if (file && file.size > MAX_FRAME_IMAGE_BYTES) {
                setError("File ảnh khung vượt quá 5MB, vui lòng chọn file nhỏ hơn.");
                e.target.value = "";
                return;
              }
              setError(null);
              setFrameImage(file);
            }}
          />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/admin/template-form.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/campaigns/[slug]/templates/template-form.tsx" tests/app/admin/template-form.test.tsx
git commit -m "feat: reject frame image uploads over 5MB in TemplateForm"
```

---

## Task 7: KPI cards on the Thống kê (Analytics) page

**Files:**
- Modify: `src/app/api/admin/analytics/route.ts`
- Modify: `tests/app/api/admin-analytics.test.ts`
- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `tests/app/admin/analytics-page.test.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `GET /api/admin/analytics`'s response rows gain a `status: string` field (`{ slug, title, count, status }[]`, still sorted by `count` descending) — the KPI cards are computed client-side from this same array (total downloads = sum of `count`; active campaigns = rows with `status === "active"`; top campaign = `rows[0]`, since the array is already sorted descending), so no new endpoint is needed.

- [ ] **Step 1: Extend the failing test for the analytics API**

Update the two `prisma.campaign.findMany` mock return values in the existing tests in `tests/app/api/admin-analytics.test.ts` to include `status`, and extend the assertions. Replace the file's first test with:

```ts
  it("returns each campaign's generated-avatar count and status, sorted descending by count", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      { slug: "fpt38", status: "active", displayConfig: { title: "FPT tròn 38 tuổi" }, _count: { avatars: 5 } },
      { slug: "techweek-2026", status: "draft", displayConfig: { title: "Tech Week" }, _count: { avatars: 12 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual([
      { slug: "techweek-2026", title: "Tech Week", count: 12, status: "draft" },
      { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5, status: "active" },
    ]);
    expect(prisma.campaign.findMany).toHaveBeenCalledWith({
      select: { slug: true, status: true, displayConfig: true, _count: { select: { avatars: true } } },
    });
  });
```

Update the second test's mock (`falls back to the slug when displayConfig has no title`) to include `status: "draft"` in its mock object and `status: "draft"` in the expected result, so it still passes with the new field present. Leave the third test (`returns 401 when requireAdmin fails`) unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-analytics.test.ts`
Expected: FAIL — the route doesn't select or return `status` yet.

- [ ] **Step 3: Add `status` to the query and response**

```ts
// src/app/api/admin/analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaigns = await prisma.campaign.findMany({
    select: { slug: true, status: true, displayConfig: true, _count: { select: { avatars: true } } },
  });

  const result = campaigns
    .map(c => ({
      slug: c.slug,
      title: (c.displayConfig as { title?: string })?.title || c.slug,
      count: c._count.avatars,
      status: c.status,
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-analytics.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Extend the failing test for the KPI cards on the page**

Add this test to the existing `describe("AdminAnalyticsPage", ...)` block in `tests/app/admin/analytics-page.test.tsx`:

```tsx
  it("renders KPI cards for total downloads, active campaigns, and the top campaign", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { slug: "techweek-2026", title: "Tech Week", count: 12, status: "draft" },
        { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5, status: "active" },
      ],
    });

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("17")).toBeTruthy()); // 12 + 5 total downloads
    expect(screen.getByText("1")).toBeTruthy(); // 1 active campaign
    expect(screen.getByText("Tech Week")).toBeTruthy(); // top campaign (highest count, already sorted first)
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/app/admin/analytics-page.test.tsx`
Expected: FAIL — no KPI cards exist on the page yet, so `"17"` and `"1"` are never rendered.

- [ ] **Step 7: Add the KPI cards and the `AnalyticsRow` type field**

```tsx
// src/app/admin/analytics/page.tsx
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
            <div className="mt-1 truncate text-base font-bold">{topCampaign}</div>
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
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/app/admin/analytics-page.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 9: Run typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/admin/analytics/route.ts tests/app/api/admin-analytics.test.ts src/app/admin/analytics/page.tsx tests/app/admin/analytics-page.test.tsx
git commit -m "feat: add KPI cards (total downloads, active campaigns, top campaign) to the Thong ke page"
```

---

## Task 8: Final verification and build

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (the pre-existing, unrelated `e2e/example.spec.ts` Playwright collection failure is out of scope for this plan — do not fix it here unless asked).

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the production build**

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 4: Manual browser walkthrough**

With the dev server running and a signed-in dev-login admin session:
1. `/admin/campaigns` — click "Đăng xuất" in the header, confirm it redirects to `/admin/login` and the session is actually cleared (reloading `/admin/campaigns` redirects back to login).
2. Sign back in. Open "+ Campaign mới" or "Sửa" on an existing campaign — confirm Badge, Mô tả, and Nhãn CTA fields are present and editable, and that saving persists them (check by re-opening "Sửa" on the same campaign).
3. Click a status pill — confirm it toggles between "Nháp" and "Hoạt động" without opening the edit form.
4. Click "Xóa" on a campaign — confirm a browser confirm dialog appears, and cancelling leaves the row in place.
5. `/admin/campaigns/fpt38/templates` — confirm "Khung cam chuẩn" now shows its real uploaded frame image (not the gradient placeholder), assuming a real frame image was uploaded for it in local testing; try uploading a file over 5MB and confirm the error message appears and the file is rejected.
6. `/admin/analytics` — confirm the 3 KPI cards render above the bar chart with correct numbers.

- [ ] **Step 5: Commit any final fixes found during the walkthrough, then stop — no further tasks in this plan.**
