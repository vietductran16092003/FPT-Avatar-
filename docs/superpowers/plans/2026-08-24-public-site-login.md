# Public Site Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require Azure AD sign-in before any public page (`/`, `/c/[slug]`) can be viewed, show the signed-in user's avatar + logout in the public header (mirroring admin), and stamp `GeneratedAvatar.userId` with the real signed-in user.

**Architecture:** Reuse the existing NextAuth + Azure AD infrastructure that already provisions `role: "user"` accounts. Widen the middleware matcher to also gate the two public routes, make the shared `/admin/login` page callback-URL-aware so it can return visitors to either area, add a `SessionProvider` + avatar/logout UI to the public layout/header (separate components from the admin ones, matching this codebase's established pattern of never sharing UI between the admin and public areas), and add a session check to the `/generate` API route as defense-in-depth behind the middleware gate.

**Tech Stack:** Next.js (App Router), NextAuth (`next-auth/middleware` `withAuth`, `next-auth/react` `SessionProvider`/`useSession`/`signOut`), Prisma, Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-08-24-public-site-login-design.md](../specs/2026-08-24-public-site-login-design.md)

## Global Constraints

- Do not change the Prisma schema — `User.role` and `GeneratedAvatar.userId` already exist.
- Do not loosen `requireAdmin()` or existing admin authorization.
- Do not change the Azure AD provider config or the dev-login bypass.
- Do not widen `/admin/*` middleware behavior beyond adding the two new public paths.
- Do not create a separate `/login` page — reuse `/admin/login`.
- Do not share components between the admin and public areas — write a public-only `AvatarBadge`/logout button, matching the existing i18n/notification-bell split.
- After all tasks: `npx tsc --noEmit`, `npx next build`, `npx vitest run` must all pass.

---

## File Structure

- Modify `src/middleware.ts` — widen `matcher` to include `/` and `/c/:path*`.
- Create `tests/middleware.test.ts` — asserts the exported `config.matcher` contains the right patterns.
- Modify `src/app/admin/login/page.tsx` — read `callbackUrl` from the query string instead of hard-coding `/admin/campaigns`; neutral description copy.
- Create `tests/app/admin/login-page.test.tsx` — verifies both buttons use the query-string `callbackUrl`, with a default when absent.
- Modify `src/app/(public)/layout.tsx` — wrap children in `SessionProvider` (same as `src/app/admin/layout.tsx`).
- Modify `src/components/public-header.tsx` — add a public `AvatarBadge` + logout button, using `useSession`/`signOut` from `next-auth/react`.
- Modify `src/lib/public-i18n.tsx` — add a `logout` dictionary key (vi/en) so the new button follows the existing i18n pattern used by every other public-header string.
- Modify `tests/components/public-header.test.tsx` — replace the "no logout button" assertion with one that asserts the logout button *is* rendered and calls `signOut` correctly when a session exists.
- Modify `src/app/api/campaigns/[slug]/generate/route.ts` — add a `getCurrentUser()` check at the top (401 if absent) and pass `userId: user.id` into `prisma.generatedAvatar.create()`.
- Modify `tests/app/api/campaigns-generate.test.ts` — add a session mock (`vi.mock("../../../src/lib/session", ...)`), a 401 test, and assert `userId` is passed to `generatedAvatar.create` in the success test; update the other existing success tests to mock a signed-in user so they keep passing.

## Global Constraints Recap (interfaces used across tasks)

- `getCurrentUser(): Promise<{ id: string; role: string } | null>` — `src/lib/session.ts:5`, already exists, unchanged.
- `usePublicLang()` returns `{ lang, setLang, t }` where `t(key: PublicDictKey): string` — `src/lib/public-i18n.tsx:127`.
- `PublicLangProvider` self-deduplicates when nested (`src/lib/public-i18n.tsx:94-124`) — safe to keep wrapping `PublicHeader` tests in it directly even after `SessionProvider` is added to the real layout.

---

### Task 1: Widen middleware to gate public routes

**Files:**
- Modify: `src/middleware.ts`
- Test: `tests/middleware.test.ts` (create)

**Interfaces:**
- Produces: `config.matcher: string[]` exported from `src/middleware.ts`, consumed by Next.js routing (no other task imports this directly).

- [ ] **Step 1: Write the failing test**

Create `tests/middleware.test.ts`:

```ts
import { describe, it, expect } from "vitest";

vi.mock("next-auth/middleware", () => ({
  withAuth: vi.fn(() => vi.fn()),
}));

import { config } from "../src/middleware";

describe("middleware config", () => {
  it("gates the public home and campaign pages", () => {
    expect(config.matcher).toContain("/");
    expect(config.matcher).toContain("/c/:path*");
  });

  it("still gates admin pages except /admin/login", () => {
    expect(config.matcher).toContain("/admin/((?!login).*)");
  });
});
```

Note: `vi` must be imported too — add `vi` to the `vitest` import: `import { describe, it, expect, vi } from "vitest";`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/middleware.test.ts`
Expected: FAIL — `config.matcher` does not contain `"/"` or `"/c/:path*"` (current matcher is only `["/admin/((?!login).*)"]`).

- [ ] **Step 3: Update middleware**

Edit `src/middleware.ts`:

```ts
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/admin/login" },
});

// /admin/login itself must never be matched here, or an unauthenticated
// visitor gets redirected to the sign-in page in an infinite loop. The
// public home and campaign pages are gated the same way: any signed-in
// user (any role) may view them — role checks stay out of this layer.
export const config = { matcher: ["/", "/c/:path*", "/admin/((?!login).*)"] };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/middleware.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts tests/middleware.test.ts
git commit -m "feat(middleware): require sign-in on public home and campaign pages"
```

---

### Task 2: Make `/admin/login` callback-URL-aware

**Files:**
- Modify: `src/app/admin/login/page.tsx`
- Test: `tests/app/admin/login-page.test.tsx` (create)

**Interfaces:**
- Consumes: `useSearchParams` from `next/navigation`, `signIn` from `next-auth/react` (already imported in this file).
- Produces: no new exports — `AdminLoginPage` default export signature unchanged. Middleware (Task 1) relies on NextAuth appending `?callbackUrl=<path>` automatically when it redirects to `/admin/login`; this task makes the page read that param.

- [ ] **Step 1: Write the failing test**

Create `tests/app/admin/login-page.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signInMock = vi.fn();
let searchParamsValue = "";

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

import AdminLoginPage from "../../../src/app/admin/login/page";

beforeEach(() => {
  searchParamsValue = "";
});

afterEach(() => {
  cleanup();
  signInMock.mockClear();
});

describe("AdminLoginPage", () => {
  it("uses the callbackUrl from the query string for the Azure AD button", async () => {
    searchParamsValue = "callbackUrl=%2Fc%2Ffpt38";
    render(<AdminLoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập với tài khoản FPT/ }));

    expect(signInMock).toHaveBeenCalledWith("azure-ad", { callbackUrl: "/c/fpt38" });
  });

  it("defaults to /admin/campaigns when there is no callbackUrl", async () => {
    render(<AdminLoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập với tài khoản FPT/ }));

    expect(signInMock).toHaveBeenCalledWith("azure-ad", { callbackUrl: "/admin/campaigns" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/admin/login-page.test.tsx`
Expected: FAIL — button still calls `signIn("azure-ad", { callbackUrl: "/admin/campaigns" })` regardless of query string (first test expects `/c/fpt38`).

- [ ] **Step 3: Update the login page**

Edit `src/app/admin/login/page.tsx`. Add the import and read the param, thread it into both the Azure AD button and `DevLoginForm`:

```tsx
"use client";

import Image from "next/image";
import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
```

Change `DevLoginForm` to accept `callbackUrl` as a prop instead of hard-coding it:

```tsx
function DevLoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    signIn("dev-login", { email, callbackUrl });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <p className="text-[12.5px] text-muted-foreground">Dev login (chỉ có ở local, bỏ qua Azure AD)</p>
      <input
        type="email"
        required
        placeholder="ban@fpt.com.vn"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
      >
        Đăng nhập dev
      </button>
    </form>
  );
}
```

Change `AdminLoginPage`:

```tsx
export default function AdminLoginPage() {
  const devLoginEnabled = process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === "true";
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin/campaigns";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 text-center shadow-lg">
        <div className="mx-auto mb-5 flex h-14 w-[88px] items-center justify-center rounded-xl border border-border bg-white p-1.5">
          <Image
            src="/fpt-logo.webp"
            alt="FPT"
            width={76}
            height={44}
            className="h-full w-full object-contain"
          />
        </div>
        <h1 className="mb-2 text-[22px] font-extrabold tracking-tight">
          Avatar Frame Platform
        </h1>
        <p className="mb-7 text-[14.5px] text-muted-foreground">
          Đăng nhập bằng tài khoản FPT để tiếp tục.
        </p>
        <button
          type="button"
          onClick={() => signIn("azure-ad", { callbackUrl })}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-5 py-3.5 text-[15px] font-bold text-background transition-opacity hover:opacity-90"
        >
          <MicrosoftLogo />
          Đăng nhập với tài khoản FPT
        </button>
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          Chỉ dành cho nhân viên FPT · Xác thực qua Azure AD
        </p>
        {devLoginEnabled && <DevLoginForm callbackUrl={callbackUrl} />}
      </div>
    </div>
  );
}
```

(`MicrosoftLogo` is unchanged — leave it as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/admin/login-page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/login/page.tsx tests/app/admin/login-page.test.tsx
git commit -m "feat(login): read callbackUrl from query string instead of hard-coding admin path"
```

---

### Task 3: Add `SessionProvider` to the public layout

**Files:**
- Modify: `src/app/(public)/layout.tsx`

**Interfaces:**
- Consumes: `SessionProvider` from `next-auth/react` (same import used in `src/app/admin/layout.tsx:4`).
- Produces: public pages and `PublicHeader` (Task 4) can now call `useSession()` without throwing "No SessionProvider" errors.

No new test file for this task — it has no behavior of its own to unit-test in isolation (a bare provider wrapper); its effect is verified by Task 4's `PublicHeader` test, which needs `useSession()` to work when rendered under this layout's pattern. This mirrors how `src/app/admin/layout.tsx`'s own `SessionProvider` line has no dedicated test.

- [ ] **Step 1: Update the public layout**

Edit `src/app/(public)/layout.tsx`:

```tsx
import { SessionProvider } from "next-auth/react";
import { PublicLangProvider } from "@/lib/public-i18n";
import { PublicHeader } from "@/components/public-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PublicLangProvider>
        <div className="flex min-h-screen flex-col">
          <PublicHeader />
          <main className="flex-1">{children}</main>
        </div>
      </PublicLangProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 2: Run the existing public page test suite to confirm no regressions**

Run: `npx vitest run tests/app/home-page.test.tsx tests/app/c-slug-page.test.tsx`
Expected: PASS — these tests render page content directly, not through this layout file, so they should be unaffected. This step just confirms nothing else broke.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(public\)/layout.tsx
git commit -m "feat(public): wrap public layout in SessionProvider"
```

---

### Task 4: Public header — avatar badge + logout

**Files:**
- Modify: `src/components/public-header.tsx`
- Modify: `src/lib/public-i18n.tsx`
- Modify: `tests/components/public-header.test.tsx`

**Interfaces:**
- Consumes: `useSession`, `signOut` from `next-auth/react`; `usePublicLang().t("logout")` from Task's `public-i18n.tsx` change.
- Produces: no new exports — `PublicHeader` signature unchanged, still a zero-prop component.

- [ ] **Step 1: Add the `logout` i18n key**

Edit `src/lib/public-i18n.tsx`. Add `logout: "Đăng xuất",` to the `vi` object (after `notifHourAgo`) and `logout: "Log out",` to the `en` object (after `notifHourAgo`):

```ts
  vi: {
    // ...existing keys...
    notifHourAgo: "giờ trước",
    logout: "Đăng xuất",
  },
  en: {
    // ...existing keys...
    notifHourAgo: "hr ago",
    logout: "Log out",
  },
```

- [ ] **Step 2: Write the failing test**

Replace the `"does not render a logout button or any admin identity"` test in `tests/components/public-header.test.tsx` with tests for the new signed-in behavior. Replace the whole file's content with:

```tsx
// tests/components/public-header.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicHeader } from "../../src/components/public-header";
import { PublicLangProvider } from "../../src/lib/public-i18n";

const signOutMock = vi.fn();
let sessionValue: { data: { user: { name?: string; email?: string } } | null } = {
  data: { user: { name: "Nguyen Van A" } },
};

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  useSession: () => sessionValue,
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  sessionValue = { data: { user: { name: "Nguyen Van A" } } };
});

afterEach(() => {
  cleanup();
  signOutMock.mockClear();
});

function renderHeader() {
  return render(
    <PublicLangProvider>
      <PublicHeader />
    </PublicLangProvider>,
  );
}

describe("PublicHeader", () => {
  it("renders the app name and a VI/EN lang toggle defaulting to vi active", () => {
    renderHeader();
    expect(screen.getByText("Avatar Frame Platform")).toBeTruthy();
    const viBtn = screen.getByRole("button", { name: "VI" });
    expect(viBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders an avatar badge with the signed-in user's initial", () => {
    renderHeader();
    expect(screen.getByText("N")).toBeTruthy();
  });

  it("renders a logout button that calls signOut with the login callback URL", async () => {
    renderHeader();

    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/admin/login" });
  });

  it("renders the public notification bell", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Thông báo" })).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/public-header.test.tsx`
Expected: FAIL — no avatar badge or "Đăng xuất" button exists yet in `PublicHeader`.

- [ ] **Step 4: Update `PublicHeader`**

Edit `src/components/public-header.tsx`:

```tsx
// src/components/public-header.tsx
"use client";

import Image from "next/image";
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

function AvatarBadge() {
  const { data: session } = useSession();
  const name = session?.user?.name || session?.user?.email || "?";
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="flex size-[30px] items-center justify-center rounded-full bg-[#FDE6D2] text-[12px] font-bold text-[#C25A00]">
      {initial}
    </div>
  );
}

export function PublicHeader() {
  const { t } = usePublicLang();

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
        <PublicNotificationBell />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {t("logout")}
        </button>
        <AvatarBadge />
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/public-header.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/public-header.tsx src/lib/public-i18n.tsx tests/components/public-header.test.tsx
git commit -m "feat(public): show avatar badge and logout button in public header"
```

---

### Task 5: Stamp `userId` on generated avatars, 401 when signed out

**Files:**
- Modify: `src/app/api/campaigns/[slug]/generate/route.ts`
- Modify: `tests/app/api/campaigns-generate.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser(): Promise<{ id: string; role: string } | null>` from `src/lib/session.ts` (unchanged signature).
- Produces: no new exports — `POST` signature unchanged; response now includes a 401 case.

- [ ] **Step 1: Write the failing tests**

Edit `tests/app/api/campaigns-generate.test.ts`. Add a `getCurrentUser` mock near the top (after the existing `vi.mock` calls) and default it to a signed-in user in `beforeEach`, then add a dedicated 401 test and extend the success-path assertion.

Add this mock alongside the existing ones (after the `notifications` mock, before the imports):

```ts
vi.mock("../../../src/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));
```

Add the import:

```ts
import { getCurrentUser } from "../../../src/lib/session";
```

In `beforeEach`, add a default signed-in mock:

```ts
  beforeEach(() => {
    vi.clearAllMocks();
    (compositeAvatar as any).mockResolvedValue(Buffer.from("png-bytes"));
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "c1", slug: "fpt38", status: "active", startDate: new Date("2020-01-01"), endDate: new Date("2099-01-01"), displayConfig: { title: "FPT tròn 38 tuổi" } });
  });
```

Add these two new test cases inside the `describe` block (near the end, before the closing `});`):

```ts
  it("returns 401 when there is no signed-in session", async () => {
    (getCurrentUser as any).mockResolvedValue(null);

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(401);
    expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
  });

  it("stamps the signed-in user's id onto the created GeneratedAvatar", async () => {
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: FAIL — `getCurrentUser` mock doesn't exist in the source yet, so the 401 test gets a 200 instead of 401, and the `userId` test finds `generatedAvatar.create` called without a `userId` field.

- [ ] **Step 3: Update the route**

Edit `src/app/api/campaigns/[slug]/generate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { compositeAvatar } from "@/lib/compositing/server-compositor";
import { validateOverlayValues } from "@/lib/compositing/validate-overlay-values";
import { createNotification } from "@/lib/notifications";
import { isCampaignPubliclyVisible } from "@/lib/campaign-visibility";
import { getCurrentUser } from "@/lib/session";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const templateId = form.get("templateId") as string;
  const photoFile = form.get("photo");
  const overlayValuesRaw = form.get("overlayValues");

  if (typeof overlayValuesRaw !== "string") {
    return NextResponse.json({ error: "Missing overlayValues" }, { status: 400 });
  }

  let overlayValues: Record<string, string>;
  try {
    const parsed = JSON.parse(overlayValuesRaw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid overlayValues JSON" }, { status: 400 });
    }
    overlayValues = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid overlayValues JSON" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { slug: params.slug } });
  if (!campaign || !isCampaignPubliclyVisible(campaign)) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (!(photoFile instanceof File) || photoFile.size > MAX_PHOTO_BYTES) {
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
      userId: user.id,
      overlayValues,
      resultImageKey: resultKey,
    },
  });

  const campaignTitle = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
  createNotification(`Có lượt tải avatar mới: ${campaignTitle} – ${template.name}.`, "download").catch(err => console.error("notification failed", err));

  return NextResponse.json({ resultUrl: storage.getPublicUrl(resultKey) });
}
```

(Only the `getCurrentUser` import, the guard at the top, and the `userId: user.id` line are new — everything else is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: PASS (all tests, including the two new ones — the pre-existing tests keep passing because `beforeEach` now defaults `getCurrentUser` to a signed-in user).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/\[slug\]/generate/route.ts tests/app/api/campaigns-generate.test.ts
git commit -m "feat(generate): require sign-in and stamp userId on GeneratedAvatar"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Build**

Run: `npx next build`
Expected: build succeeds (watch for the known `force-dynamic` pitfall on any new GET route with a Prisma query — this plan adds none, so it should not recur).

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including every file touched in Tasks 1–5.

- [ ] **Step 4: Manual smoke check (dev server)**

With `docker-compose.dev.yml` services up and `npm run dev` running:
1. Visit `/` while signed out → redirected to `/admin/login?callbackUrl=%2F`.
2. Sign in via dev-login → redirected back to `/`.
3. Confirm the public header shows an avatar badge and a working "Đăng xuất" button.
4. Generate an avatar on a live campaign → confirm no 401, and check (via Prisma Studio or a DB query) that the new `GeneratedAvatar` row has a non-null `userId`.
5. Sign out → confirm `/` and `/c/[slug]` redirect to login again.

- [ ] **Step 5: Commit (if step 4 required any fixes) or finish**

If manual smoke testing required no code changes, this task needs no commit — Task 5's commit is the last one. If fixes were needed, commit them with an appropriate message before finishing.
