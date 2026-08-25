# Remove Public Login Gate + Account History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anonymous visitors browse campaigns and generate/download avatars on the public site with no sign-in required, replace the full-page login gate with a small "Đăng nhập" link in both public headers, and add a `/tai-khoan` page where signed-in users can see their own download history.

**Architecture:** Delete the two existing gate points (`HomePage`'s inline `<LoginGate/>` branch and `CampaignPage`'s `redirect()`-when-signed-out branch) so both pages always render their content. Relax `/api/campaigns/[slug]/generate` to stamp `userId: null` for anonymous callers instead of returning 401 (the column is already nullable — no schema change). Add a session-aware "Đăng nhập" / avatar-link control to both public headers (`public-header.tsx`, `campaign-header.tsx`). Add a new server-rendered `/tai-khoan` page that redirects anonymous visitors to `/admin/login` and otherwise lists the signed-in user's `GeneratedAvatar` rows newest-first.

**Tech Stack:** Next.js App Router (Server + Client Components), NextAuth (existing `getCurrentUser()`), Prisma, Vitest + Testing Library.

**Spec:** No written spec — this is a bounded change (existing login-gate flow already in the repo); the design was agreed in chat during brainstorming on 2026-08-25.

## Global Constraints

- No Prisma schema change — `GeneratedAvatar.userId` is already `String?` (nullable).
- Do not touch `/admin/*` auth (middleware, `requireAdmin()`, admin login) — unrelated and already correct.
- Do not change how a *signed-in* user's `userId` gets stamped — only remove the *requirement* to be signed in.
- Reuse the existing shared login page (`/admin/login`, already `callbackUrl`-aware) — do not create a new login page.
- Keep the two public headers visually and structurally separate (established project convention — no shared components between admin/public, and between the two public headers themselves, matching how `public-header.tsx` and `campaign-header.tsx` are already two independent files).
- After all tasks: `npx tsc --noEmit`, `npx next build`, `npx vitest run` must all pass.

---

## File Structure

- Modify `src/app/(public)/page.tsx` — remove the login-gate branch.
- Modify `src/app/(public)/c/[slug]/page.tsx` — remove the redirect-when-signed-out branch.
- Delete `src/app/(public)/login-gate.tsx` — no longer used by any page after the above two changes.
- Modify `src/lib/mock-fpt-auth.ts` — remove `signInAsMockUser` (becomes dead code once `login-gate.tsx` is deleted; `signInAsMockAdmin` stays, still used by `admin/login/page.tsx`).
- Modify `src/app/api/campaigns/[slug]/generate/route.ts` — allow anonymous callers, stamp `userId: user?.id ?? null`.
- Modify `src/lib/public-i18n.tsx` — add `headerLogin`, `accountPageTitle`, `accountEmpty`, `accountColFrame`, `accountColCampaign`, `accountColDate` keys (vi + en).
- Modify `src/components/public-header.tsx` — show "Đăng nhập" link when signed out; link the avatar to `/tai-khoan` when signed in.
- Modify `src/app/(public)/c/[slug]/campaign-header.tsx` — add the same session-aware controls (currently has none).
- Create `src/app/(public)/tai-khoan/page.tsx` — Server Component: redirect if signed out, else query `GeneratedAvatar` for the user and render `AccountHistory`.
- Create `src/app/(public)/tai-khoan/account-history.tsx` — Client Component: renders the list using `usePublicLang()`.
- Modify `tests/app/home-page.test.tsx`, `tests/app/c-slug-page.test.tsx`, `tests/app/api/campaigns-generate.test.ts`, `tests/components/public-header.test.tsx` — update for the new signed-out-allowed behavior.
- Create `tests/components/campaign-header.test.tsx` — new coverage for the header's new session-aware controls (none existed before).
- Create `tests/app/tai-khoan-page.test.tsx` — new page's tests.

## Interfaces used across tasks

- `getCurrentUser(): Promise<{ id: string; role: string } | null>` — `src/lib/session.ts:5`, unchanged.
- `usePublicLang()` returns `{ lang, setLang, t }`, `t(key: PublicDictKey): string` — `src/lib/public-i18n.tsx`.
- `prisma.generatedAvatar.findMany(...)` — Prisma model fields: `id`, `campaignId`, `templateId`, `userId`, `overlayValues`, `resultImageKey`, `language`, `createdAt`, relations `campaign` (→ `Campaign.displayConfig: Json`, `Campaign.slug`), `template` (→ `Template.name: string`).

---

### Task 1: Remove the login gate from the home page

**Files:**
- Modify: `src/app/(public)/page.tsx`
- Test: `tests/app/home-page.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUser()` (still called, just no longer gates rendering), `fetchActiveCampaigns()` from `src/app/campaigns-client.ts` (unchanged).
- Produces: `HomePage` no longer imports or renders `LoginGate`.

- [ ] **Step 1: Write the failing test**

Edit `tests/app/home-page.test.tsx`. Replace the last test (the one asserting a login prompt) with one asserting the opposite — campaigns render even when signed out:

```tsx
  it("shows the campaign dashboard (not a login prompt) even when signed out", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "fpt38", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi", displayConfig: { title: "FPT 38", description: "", ctaLabel: "Tạo avatar ngay" },
        _count: { templates: 1 },
      }],
    });

    render(await HomePage({}));

    expect(screen.getByRole("link").getAttribute("href")).toBe("/c/fpt38");
    expect(screen.queryByRole("button", { name: "Đăng nhập với tài khoản FPT" })).toBeNull();
  });
```

The full file (for reference — only the last `it` block changes, everything above it stays the same):

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("../../src/lib/session", () => ({ getCurrentUser: vi.fn() }));

import HomePage from "../../src/app/(public)/page";
import { getCurrentUser } from "../../src/lib/session";

beforeEach(() => {
  localStorage.clear();
  (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
});

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

    render(await HomePage({}));

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

    render(await HomePage({}));

    expect(screen.getByRole("link").getAttribute("href")).toBe("/c/fpt38");
  });

  it("shows the English title/description/CTA when the saved public language is en", async () => {
    localStorage.setItem("afp_public_lang", "en");
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "fpt38", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi",
        displayConfig: {
          title: "FPT tròn 38 tuổi", titleEn: "FPT turns 38",
          description: "Mô tả", descriptionEn: "Description",
          ctaLabel: "Tạo avatar ngay", ctaEn: "Create now",
        },
        _count: { templates: 1 },
      }],
    });

    render(await HomePage({}));

    await waitFor(() => expect(screen.getByText("FPT turns 38")).toBeTruthy());
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Create now")).toBeTruthy();
  });

  it("shows the campaign dashboard (not a login prompt) even when signed out", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "fpt38", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi", displayConfig: { title: "FPT 38", description: "", ctaLabel: "Tạo avatar ngay" },
        _count: { templates: 1 },
      }],
    });

    render(await HomePage({}));

    expect(screen.getByRole("link").getAttribute("href")).toBe("/c/fpt38");
    expect(screen.queryByRole("button", { name: "Đăng nhập với tài khoản FPT" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/home-page.test.tsx`
Expected: FAIL — `HomePage` still renders `<LoginGate/>` and never calls `fetch` when `getCurrentUser()` resolves `null`, so `screen.getByRole("link")` throws (no link exists).

- [ ] **Step 3: Update the page**

Edit `src/app/(public)/page.tsx`:

```tsx
import type { Metadata } from "next";
import { fetchActiveCampaigns } from "@/app/campaigns-client";
import { CampaignCards } from "./campaign-cards";

export const metadata: Metadata = {
  title: "Avatar sự kiện FPT",
  description: "Tạo avatar cá nhân theo khung ảnh của các chiến dịch sự kiện FPT đang diễn ra.",
};

export default async function HomePage() {
  const campaigns = await fetchActiveCampaigns();
  return <CampaignCards campaigns={campaigns} />;
}
```

(`getCurrentUser` and `LoginGate` imports are removed entirely — the page no longer needs a `searchParams` prop either, since there is no more callback-URL-driven redirect into it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/home-page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(public\)/page.tsx tests/app/home-page.test.tsx
git commit -m "feat(public): remove login gate from home page"
```

---

### Task 2: Remove the login gate from the campaign page

**Files:**
- Modify: `src/app/(public)/c/[slug]/page.tsx`
- Test: `tests/app/c-slug-page.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUser()` (removed from this file entirely — no longer needed here), `fetchCampaign()` (local helper, unchanged).
- Produces: `CampaignPage` no longer imports `redirect` from `next/navigation` or `getCurrentUser`.

- [ ] **Step 1: Write the failing test**

Edit `tests/app/c-slug-page.test.tsx`. Replace the last test (the one asserting a redirect) with one asserting the tool renders even when signed out:

```tsx
  it("renders the avatar creator (no redirect) even when signed out", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "fpt38",
        templates: [{ id: "t1", name: "Khung cam", frameImageUrl: "http://storage/frames/x.png", overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }],
      }),
    });

    render(await CampaignPage({ params: { slug: "fpt38" } }));

    expect(screen.getByRole("button", { name: "TẢI ẢNH" })).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
```

The full file (only the last `it` block changes):

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../src/lib/session", () => ({ getCurrentUser: vi.fn() }));
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

import CampaignPage from "../../src/app/(public)/c/[slug]/page";
import { getCurrentUser } from "../../src/lib/session";

beforeEach(() => {
  (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
  redirectMock.mockClear();
});

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

  it("renders the avatar creator when the campaign has templates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "fpt38",
        templates: [{ id: "t1", name: "Khung cam", frameImageUrl: "http://storage/frames/x.png", overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }],
      }),
    });

    render(await CampaignPage({ params: { slug: "fpt38" } }));

    expect(screen.getByRole("button", { name: "TẢI ẢNH" })).toBeTruthy();
  });

  it("shows the campaign's display title as a heading above the tool", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "fpt38",
        displayConfig: { title: "Khung Avatar Chào mừng sinh nhật FPT lần thứ 38" },
        templates: [{ id: "t1", name: "Khung cam", frameImageUrl: "http://storage/frames/x.png", overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }],
      }),
    });

    render(await CampaignPage({ params: { slug: "fpt38" } }));

    expect(screen.getByRole("heading", { name: "Khung Avatar Chào mừng sinh nhật FPT lần thứ 38" })).toBeTruthy();
  });

  it("renders the avatar creator (no redirect) even when signed out", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "fpt38",
        templates: [{ id: "t1", name: "Khung cam", frameImageUrl: "http://storage/frames/x.png", overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }],
      }),
    });

    render(await CampaignPage({ params: { slug: "fpt38" } }));

    expect(screen.getByRole("button", { name: "TẢI ẢNH" })).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/c-slug-page.test.tsx`
Expected: FAIL — `CampaignPage` still calls `redirect()` and throws `"NEXT_REDIRECT"` when `getCurrentUser()` resolves `null`, so `render(await CampaignPage(...))` rejects instead of returning a renderable element.

- [ ] **Step 3: Update the page**

Edit `src/app/(public)/c/[slug]/page.tsx`:

```tsx
import { getBaseUrl } from "@/lib/base-url";
import type { DisplayConfigLike } from "@/lib/localized-content";
import { AvatarCreator, type Template } from "./avatar-creator";

async function fetchCampaign(slug: string): Promise<{ templates: Template[]; displayConfig: DisplayConfigLike } | null> {
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

  return <AvatarCreator slug={params.slug} templates={campaign.templates} displayConfig={campaign.displayConfig} />;
}
```

(`getCurrentUser` and `redirect` imports are removed entirely.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/c-slug-page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(public\)/c/\[slug\]/page.tsx tests/app/c-slug-page.test.tsx
git commit -m "feat(public): remove login redirect from campaign page"
```

---

### Task 3: Delete the now-unused login gate and its dead helper

**Files:**
- Delete: `src/app/(public)/login-gate.tsx`
- Modify: `src/lib/mock-fpt-auth.ts`

**Interfaces:**
- Produces: `src/lib/mock-fpt-auth.ts` still exports `MOCK_ADMIN_EMAIL`, `isMockFptLoginEnabled`, `signInAsMockAdmin` — unchanged. `signInAsMockUser` and `MOCK_USER_EMAIL` are removed (no longer referenced anywhere after Tasks 1–2).

This task has no test of its own — it is pure dead-code removal enabled by Tasks 1 and 2 (no file imports `LoginGate` or `signInAsMockUser` any more). Verification is that the build/typecheck still passes with nothing referencing the deleted symbols.

- [ ] **Step 1: Confirm nothing else references what you're about to delete**

Run: `grep -r "LoginGate\|signInAsMockUser" src tests` (or use your editor's find-in-files)
Expected: The only matches are inside `src/app/(public)/login-gate.tsx` itself and the `signInAsMockUser` function definition/export in `src/lib/mock-fpt-auth.ts` — nothing in `src/app/(public)/page.tsx` or `src/app/(public)/c/[slug]/page.tsx` any more, since Tasks 1–2 already removed those imports.

- [ ] **Step 2: Delete the file**

```bash
git rm src/app/\(public\)/login-gate.tsx
```

- [ ] **Step 3: Remove the now-dead export from `mock-fpt-auth.ts`**

Edit `src/lib/mock-fpt-auth.ts` to remove `MOCK_USER_EMAIL` and `signInAsMockUser`, keeping everything else:

```ts
import { signIn } from "next-auth/react";

// One fixed mock account for local dev without real Azure AD credentials —
// used by the admin login page's "Đăng nhập với tài khoản FPT" button (see
// auth-options.ts for how this email is granted role "admin").
export const MOCK_ADMIN_EMAIL = "admin@fpt.com.vn";

// Reuses the same public flag the old dev-login form used to decide whether
// a non-Azure local login path is available (see NEXT_PUBLIC_DEV_LOGIN_ENABLED
// in .env.example) instead of a second flag, so there is one source of truth
// to flip back off once real Azure AD credentials are configured.
export function isMockFptLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === "true";
}

// Same idea as before, but for the admin login page — signs in as the fixed
// mock ADMIN account instead, so admin-only screens can be tested locally.
export function signInAsMockAdmin(callbackUrl: string) {
  if (isMockFptLoginEnabled()) {
    return signIn("dev-login", { email: MOCK_ADMIN_EMAIL, callbackUrl });
  }
  return signIn("azure-ad", { callbackUrl });
}
```

- [ ] **Step 4: Run the full test suite and type-check to confirm nothing broke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` reports no errors; test suite still passes (no test imported the deleted symbols).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(public): remove login-gate.tsx and its now-unused mock-user helper"
```

---

### Task 4: Allow anonymous avatar generation

**Files:**
- Modify: `src/app/api/campaigns/[slug]/generate/route.ts`
- Test: `tests/app/api/campaigns-generate.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser()` — unchanged signature, still called, but its `null` result no longer short-circuits the request.
- Produces: `POST` response is `200` for both signed-in and anonymous callers (previously `401` for anonymous). `GeneratedAvatar.userId` is the signed-in user's id, or `null` for anonymous.

- [ ] **Step 1: Write the failing tests**

Edit `tests/app/api/campaigns-generate.test.ts`. Replace the existing `"returns 401 when there is no signed-in session"` test with two new tests, and update `beforeEach`'s comment (the mock default itself — `{ id: "u1", role: "user" }` — stays as-is, since most existing tests assume a signed-in caller):

```ts
  it("succeeds with a null userId when there is no signed-in session", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(200);
    expect(prisma.generatedAvatar.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: null }),
    });
  });

  it("still stamps the signed-in user's id when a session is present", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(prisma.generatedAvatar.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1" }),
    });
  });
```

Delete the old `"returns 401 when there is no signed-in session"` test — anonymous calls no longer 401. Leave the existing `"stamps the signed-in user's id onto the created GeneratedAvatar"` test in place too (it's now redundant with the new `"still stamps..."` test above — delete that older duplicate instead of keeping both, so there is exactly one test per case: the block named `"stamps the signed-in user's id onto the created GeneratedAvatar"` should be removed since `"still stamps the signed-in user's id when a session is present"` replaces it).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: FAIL — the new `"succeeds with a null userId..."` test gets `res.status === 401` (the route still short-circuits on `!user`), not `200`.

- [ ] **Step 3: Update the route**

Edit `src/app/api/campaigns/[slug]/generate/route.ts`. Change only the auth guard at the top and the `userId` field in the `create()` call — everything else (form parsing, validation, compositing, notification) stays exactly as-is:

```ts
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const user = await getCurrentUser();

  const form = await req.formData();
  const templateId = form.get("templateId") as string;
  const photoFile = form.get("photo");
  const overlayValuesRaw = form.get("overlayValues");
  const language = form.get("language") === "en" ? "en" : "vi";
```

(The `if (!user) { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }` block is deleted entirely — `user` can now be `null` and the request proceeds.)

Then, further down, change the `create()` call's `userId` field:

```ts
  await prisma.generatedAvatar.create({
    data: {
      campaignId: campaign.id,
      templateId: template.id,
      userId: user?.id ?? null,
      overlayValues,
      resultImageKey: resultKey,
      language,
    },
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: PASS (all tests — the file should now have one fewer test than before this task, since one old test was replaced by two new ones and one duplicate was removed: net +1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/\[slug\]/generate/route.ts tests/app/api/campaigns-generate.test.ts
git commit -m "feat(generate): allow anonymous avatar generation, stamp null userId"
```

---

### Task 5: Add sign-in i18n keys

**Files:**
- Modify: `src/lib/public-i18n.tsx`

**Interfaces:**
- Produces: new `PublicDictKey` values `headerLogin`, `accountPageTitle`, `accountEmpty`, `accountColFrame`, `accountColCampaign`, `accountColDate`, available in both `vi` and `en` — consumed by Tasks 6 and 7.

No test of its own — this is a pure dictionary addition, exercised by the tests in Tasks 6–7 that render text through these keys.

- [ ] **Step 1: Add the keys**

Edit `src/lib/public-i18n.tsx`. Add to the `vi` object (after `goAdmin: "Trang quản trị",`):

```ts
    goAdmin: "Trang quản trị",
    headerLogin: "Đăng nhập",
    accountPageTitle: "Lịch sử tải ảnh",
    accountEmpty: "Bạn chưa tải ảnh nào.",
    accountColFrame: "Khung",
    accountColCampaign: "Chiến dịch",
    accountColDate: "Ngày tải",
  },
```

Add to the `en` object (after `goAdmin: "Admin panel",`):

```ts
    goAdmin: "Admin panel",
    headerLogin: "Login",
    accountPageTitle: "Download history",
    accountEmpty: "You haven't downloaded any avatars yet.",
    accountColFrame: "Frame",
    accountColCampaign: "Campaign",
    accountColDate: "Downloaded on",
  },
```

- [ ] **Step 2: Verify with the type-checker**

Run: `npx tsc --noEmit`
Expected: no errors (the keys are structurally identical between `vi` and `en`, satisfying `PublicDictKey = keyof typeof PUBLIC_DICT["vi"]`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/public-i18n.tsx
git commit -m "feat(public): add i18n keys for header login link and account history page"
```

---

### Task 6: Add sign-in/account controls to both public headers

**Files:**
- Modify: `src/components/public-header.tsx`
- Modify: `src/app/(public)/c/[slug]/campaign-header.tsx`
- Modify: `tests/components/public-header.test.tsx`
- Create: `tests/components/campaign-header.test.tsx`

**Interfaces:**
- Consumes: `t("headerLogin")` from Task 5.
- Produces: no new exports — both headers remain zero-prop components. The avatar control in each is now wrapped in `<Link href="/tai-khoan">` (consumed visually by a human, not by other code).

- [ ] **Step 1: Write the failing tests for `public-header.tsx`**

Edit `tests/components/public-header.test.tsx`. Replace the `"hides session-only controls..."` test with one asserting the new signed-out login link, and update the avatar test to check it's a link to `/tai-khoan`:

```tsx
  it("shows a 'Đăng nhập' link (not the avatar/logout/notifications) when no one is signed in", () => {
    sessionValue = { data: null };
    renderHeader();
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thông báo" })).toBeNull();
    expect(screen.queryByText("Nguyen Van A")).toBeNull();
    const loginLink = screen.getByText("Đăng nhập");
    expect(loginLink.getAttribute("href")).toBe("/admin/login?callbackUrl=%2F");
  });
```

Add one more test (the existing `"renders an avatar badge..."` test stays as-is, but add this alongside it):

```tsx
  it("links the avatar/name to the account history page when signed in", () => {
    renderHeader();
    const nameLink = screen.getByText("Nguyen Van A").closest("a");
    expect(nameLink?.getAttribute("href")).toBe("/tai-khoan");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/public-header.test.tsx`
Expected: FAIL — `screen.getByText("Đăng nhập")` throws (no such element yet), and `"Nguyen Van A"` has no enclosing `<a>`.

- [ ] **Step 3: Update `public-header.tsx`**

Edit `src/components/public-header.tsx`. Wrap `AvatarWithName` in a link, and add the signed-out branch:

```tsx
// src/components/public-header.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePublicLang, type PublicLang } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";
import { PublicNotificationBell } from "@/components/public-notification-bell";

function LangToggle() {
  const { lang, setLang } = usePublicLang();
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-border bg-muted p-0.5" role="group" aria-label="VI/EN">
      {(["vi", "en"] as PublicLang[]).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={cn(
            "rounded-full px-3 py-1 text-[12.5px] font-bold uppercase transition-colors",
            lang === code ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
          )}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function AvatarWithName() {
  const { data: session } = useSession();
  const name = session?.user?.name || session?.user?.email || "?";
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <Link href="/tai-khoan" className="flex items-center gap-2">
      <div className="flex size-[30px] items-center justify-center rounded-full bg-[#FDE6D2] text-[12px] font-bold text-[#C25A00]">
        {initial}
      </div>
      <span className="text-[13.5px] font-semibold text-muted-foreground">{name}</span>
    </Link>
  );
}

export function PublicHeader() {
  const { t } = usePublicLang();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

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
        <div className="text-[15px] font-bold">Avatar Frame Platform</div>
      </div>
      <div className="flex items-center gap-3">
        <LangToggle />
        {session?.user ? (
          <>
            {isAdmin && (
              <Link href="/admin/campaigns" className="text-sm font-semibold text-primary hover:underline">
                {t("goAdmin")}
              </Link>
            )}
            <PublicNotificationBell />
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              {t("logout")}
            </button>
            <AvatarWithName />
          </>
        ) : (
          <Link href="/admin/login?callbackUrl=%2F" className="text-sm font-semibold text-primary hover:underline">
            {t("headerLogin")}
          </Link>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/public-header.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Write the failing tests for `campaign-header.tsx`**

Create `tests/components/campaign-header.test.tsx` (no test file existed for this component before):

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignHeader } from "../../src/app/(public)/c/[slug]/campaign-header";
import { PublicLangProvider } from "../../src/lib/public-i18n";

const signOutMock = vi.fn();
let sessionValue: { data: { user: { name?: string; email?: string; role?: string } } | null } = {
  data: { user: { name: "Nguyen Van A", role: "user" } },
};

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  useSession: () => sessionValue,
}));

// CampaignHeader reads the route's [slug] param via next/navigation's
// useParams() to build the signed-out login link's callbackUrl — outside a
// real Next.js router (as in this unit test) that hook has no route to read
// from, so it must be mocked to return the slug this suite tests against.
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "fpt38" }),
}));

beforeEach(() => {
  sessionValue = { data: { user: { name: "Nguyen Van A", role: "user" } } };
});

afterEach(() => {
  cleanup();
  signOutMock.mockClear();
});

function renderHeader() {
  return render(
    <PublicLangProvider>
      <CampaignHeader />
    </PublicLangProvider>,
  );
}

describe("CampaignHeader", () => {
  it("shows a 'Đăng nhập' link when no one is signed in", () => {
    sessionValue = { data: null };
    renderHeader();
    const loginLink = screen.getByText("Đăng nhập");
    expect(loginLink.getAttribute("href")).toBe("/admin/login?callbackUrl=%2Fc%2Ffpt38");
  });

  it("shows the avatar initial linking to /tai-khoan when signed in", () => {
    renderHeader();
    const nameEl = screen.getByText("N");
    expect(nameEl.closest("a")?.getAttribute("href")).toBe("/tai-khoan");
  });

  it("renders a logout button that calls signOut", async () => {
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/components/campaign-header.test.tsx`
Expected: FAIL — `CampaignHeader` currently renders no session-aware UI at all, so none of `"Đăng nhập"`, the avatar initial, or a logout button exist.

- [ ] **Step 7: Update `campaign-header.tsx`**

Edit `src/app/(public)/c/[slug]/campaign-header.tsx`. The lang-toggle dropdown logic is unchanged — only the right-hand side gains session-aware controls. `useParams` is used to build the `callbackUrl` for the signed-out login link (Next.js's own hook, no new dependency):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Globe, ChevronDown } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { usePublicLang, type PublicLang } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";

const LANG_LABELS: Record<PublicLang, string> = { vi: "Tiếng Việt", en: "English" };

function AvatarLink() {
  const { data: session } = useSession();
  const name = session?.user?.name || session?.user?.email || "?";
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <Link href="/tai-khoan" className="flex size-8 items-center justify-center rounded-full bg-white text-[12px] font-bold text-[#C25A00]">
      {initial}
    </Link>
  );
}

export function CampaignHeader() {
  const { lang, setLang, t } = usePublicLang();
  const { data: session } = useSession();
  const params = useParams<{ slug: string }>();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onOutsideClick, true);
    return () => document.removeEventListener("click", onOutsideClick, true);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-r from-[#FF6A00] via-[#FF5A01] to-[#E5450A] px-4 py-2.5 shadow-sm sm:px-8 sm:py-3.5">
      <div className="flex items-center gap-3">
        <img src="/header-fpt-logo.svg" alt="FPT" className="h-7 w-auto sm:h-9" />
        <img src="/header-fpt-38-badge.svg" alt="38 năm FPT" className="h-9 w-auto sm:h-11" />
      </div>

      <div className="flex items-center gap-3">
        <div ref={wrapRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            <Globe className="size-4" />
            <span className="hidden sm:inline">{LANG_LABELS[lang]}</span>
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div role="listbox" className="absolute right-0 top-full z-30 mt-2 w-36 overflow-hidden rounded-xl border border-black/5 bg-white py-1 text-sm shadow-lg">
              {(["vi", "en"] as PublicLang[]).map(code => (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={lang === code}
                  onClick={() => {
                    setLang(code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center px-3.5 py-2 text-left font-semibold text-foreground hover:bg-muted",
                    lang === code && "text-primary",
                  )}
                >
                  {LANG_LABELS[code]}
                </button>
              ))}
            </div>
          )}
        </div>

        {session?.user ? (
          <>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-[13px] font-semibold text-white/90 hover:text-white"
            >
              {t("logout")}
            </button>
            <AvatarLink />
          </>
        ) : (
          <Link href={`/admin/login?callbackUrl=${encodeURIComponent(`/c/${params.slug}`)}`} className="text-[13px] font-semibold text-white hover:underline">
            {t("headerLogin")}
          </Link>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/components/campaign-header.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add src/components/public-header.tsx src/app/\(public\)/c/\[slug\]/campaign-header.tsx tests/components/public-header.test.tsx tests/components/campaign-header.test.tsx
git commit -m "feat(public): add sign-in link and account-history link to both public headers"
```

---

### Task 7: `/tai-khoan` account history page

**Files:**
- Create: `src/app/(public)/tai-khoan/page.tsx`
- Create: `src/app/(public)/tai-khoan/account-history.tsx`
- Test: `tests/app/tai-khoan-page.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUser()` from `src/lib/session.ts`, `prisma` from `src/lib/prisma.ts`, `t("accountPageTitle")` / `t("accountEmpty")` / `t("accountColFrame")` / `t("accountColCampaign")` / `t("accountColDate")` from Task 5.
- Produces: `AccountHistory` component with props `{ entries: AccountHistoryEntry[] }` where `AccountHistoryEntry = { id: string; frameName: string; campaignTitle: string; campaignTitleEn?: string; createdAt: string }` (an ISO date string — Server Components can't pass `Date` objects to Client Components, so the page serializes it before passing down).

- [ ] **Step 1: Write the failing test**

Create `tests/app/tai-khoan-page.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../src/lib/session", () => ({ getCurrentUser: vi.fn() }));
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("../../src/lib/prisma", () => ({
  prisma: { generatedAvatar: { findMany: vi.fn() } },
}));

import AccountPage from "../../src/app/(public)/tai-khoan/page";
import { getCurrentUser } from "../../src/lib/session";
import { prisma } from "../../src/lib/prisma";

beforeEach(() => {
  redirectMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AccountPage", () => {
  it("redirects to login with a callbackUrl when signed out", async () => {
    (getCurrentUser as any).mockResolvedValue(null);

    await expect(AccountPage({})).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/admin/login?callbackUrl=%2Ftai-khoan");
    expect(prisma.generatedAvatar.findMany).not.toHaveBeenCalled();
  });

  it("shows an empty-state message when the user has no downloads", async () => {
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (prisma.generatedAvatar.findMany as any).mockResolvedValue([]);

    render(await AccountPage({}));

    expect(screen.getByText("Bạn chưa tải ảnh nào.")).toBeTruthy();
  });

  it("lists each download newest-first with frame name, campaign title, and date", async () => {
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (prisma.generatedAvatar.findMany as any).mockResolvedValue([
      {
        id: "ga1",
        createdAt: new Date("2026-08-24T10:00:00.000Z"),
        template: { name: "Khung cam chuẩn" },
        campaign: { displayConfig: { title: "FPT tròn 38 tuổi" } },
      },
    ]);

    render(await AccountPage({}));

    expect(prisma.generatedAvatar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(screen.getByText("Khung cam chuẩn")).toBeTruthy();
    expect(screen.getByText("FPT tròn 38 tuổi")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/tai-khoan-page.test.tsx`
Expected: FAIL — `Cannot find module '../../src/app/(public)/tai-khoan/page'` (the file doesn't exist yet).

- [ ] **Step 3: Write the client component**

Create `src/app/(public)/tai-khoan/account-history.tsx`:

```tsx
"use client";

import { PublicLangProvider, usePublicLang } from "@/lib/public-i18n";

export interface AccountHistoryEntry {
  id: string;
  frameName: string;
  campaignTitle: string;
  campaignTitleEn?: string;
  createdAt: string;
}

function AccountHistoryInner({ entries }: { entries: AccountHistoryEntry[] }) {
  const { t, lang } = usePublicLang();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">{t("accountPageTitle")}</h1>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("accountEmpty")}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-left">
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("accountColFrame")}</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("accountColCampaign")}</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("accountColDate")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="px-4 py-3">{entry.frameName}</td>
                  <td className="px-4 py-3">{lang === "en" && entry.campaignTitleEn ? entry.campaignTitleEn : entry.campaignTitle}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString(lang === "en" ? "en-US" : "vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AccountHistory({ entries }: { entries: AccountHistoryEntry[] }) {
  return (
    <PublicLangProvider>
      <AccountHistoryInner entries={entries} />
    </PublicLangProvider>
  );
}
```

- [ ] **Step 4: Write the server page**

Create `src/app/(public)/tai-khoan/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AccountHistory, type AccountHistoryEntry } from "./account-history";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/admin/login?callbackUrl=${encodeURIComponent("/tai-khoan")}`);
  }

  const avatars = await prisma.generatedAvatar.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { template: true, campaign: true },
  });

  const entries: AccountHistoryEntry[] = avatars.map(a => {
    const displayConfig = a.campaign.displayConfig as { title?: string; titleEn?: string };
    return {
      id: a.id,
      frameName: a.template.name,
      campaignTitle: displayConfig?.title ?? a.campaign.slug,
      campaignTitleEn: displayConfig?.titleEn,
      createdAt: a.createdAt.toISOString(),
    };
  });

  return <AccountHistory entries={entries} />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/app/tai-khoan-page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(public\)/tai-khoan tests/app/tai-khoan-page.test.tsx
git commit -m "feat(public): add /tai-khoan account download-history page"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Build**

Run: `npx next build`
Expected: build succeeds. `/tai-khoan` is a new dynamic (session-dependent) route — if the build complains about it being statically prerendered when it shouldn't be, that's because it reads the session via `getCurrentUser()` (which calls `getServerSession`, a request-scoped API) — Next.js should already detect this and mark the route dynamic automatically, matching how `/admin/campaigns` and other session-reading pages already build correctly. Only add `export const dynamic = "force-dynamic";` to `src/app/(public)/tai-khoan/page.tsx` if the build actually fails without it — do not add it preemptively.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including every file touched or created in Tasks 1–7.

- [ ] **Step 4: Manual smoke check (dev server)**

With Docker services up and `npm run dev` running:
1. Visit `/` while signed out → campaigns list renders directly, no login prompt. Header shows a "Đăng nhập" link, not an avatar.
2. Visit `/c/[slug]` while signed out → avatar creator renders directly, no redirect. `CampaignHeader` shows "Đăng nhập".
3. Upload a photo, fill required fields, click "Tải ảnh" while still signed out → download succeeds (no 401).
4. Check (via Prisma Studio or a DB query) that the new `GeneratedAvatar` row has `userId: null`.
5. Sign in (dev-login) → both headers now show the avatar/name and a logout button instead of "Đăng nhập".
6. Click the avatar/name → lands on `/tai-khoan`, showing the download from step 3 is *not* listed there (it was anonymous — `userId: null` doesn't match the now-signed-in user), but a *new* download made while signed in *does* show up with the correct frame name, campaign title, and date.
7. Visit `/tai-khoan` directly while signed out → redirected to `/admin/login?callbackUrl=%2Ftai-khoan`.

- [ ] **Step 5: Commit (if step 4 required any fixes) or finish**

If manual smoke testing required no code changes, this task needs no commit — Task 7's commit is the last one. If fixes were needed, commit them with an appropriate message before finishing.
