# Admin Demo Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the admin console (`/admin/*`) to match `docs/superpowers/demo/admin.html` visually and, where explicitly agreed, structurally — while preserving the existing overlay-editor engine, routes' underlying data, and all previously-hardened validation.

**Architecture:** Add a small admin-only i18n layer (React context + dictionary, static labels + a `pickLocalized` helper for bilingual campaign content) and a shared `COMPONENT_PRESETS` constant. Merge the "Quản lý khung" (Templates) page into the Campaign edit form as a nested section, reusing the existing Template API and `TemplateForm` component (moved, not rewritten). Add one additive analytics query (by-day) and one frontend-only placeholder chart (by-unit). No Prisma schema changes; `displayConfig` (already `Json`) grows two new optional string fields.

**Tech Stack:** Next.js App Router, React (client components), Tailwind (CSS variable tokens already ported into `globals.css`), Vitest + Testing Library, Prisma/Postgres.

**Spec:** [docs/superpowers/specs/2026-08-22-admin-demo-parity-design.md](../specs/2026-08-22-admin-demo-parity-design.md)

## Global Constraints

- No Prisma schema/migration changes — bilingual fields live inside the existing `Campaign.displayConfig` Json column.
- No changes to existing hardened validation (slug kebab-case regex, file-size caps, mass-assignment whitelists) — only additive.
- The overlay editor (`TextOverlay[]`, per-field x/y/fontSize/color) must keep working exactly as today; the 4 component-preset checkboxes are a shortcut that writes into that same array, never a replacement.
- Default admin language is `vi`; every existing hard-coded Vietnamese string a test currently asserts on must still render in `vi` mode (i18n is additive, not a rename).
- Old route `/admin/campaigns/[slug]/templates` is deleted outright (no redirect — confirmed with user).
- Run `npx tsc --noEmit`, `npx next build`, and `npx vitest run` before considering any task's changes final (per project history: vitest passing alone has missed real type errors before).

---

## Task 1: Admin i18n foundation (dictionary + provider + hook)

**Files:**
- Create: `src/lib/admin-i18n.tsx`
- Test: `tests/lib/admin-i18n.test.tsx`

**Interfaces:**
- Produces: `AdminLangProvider({ children }: { children: React.ReactNode })` (client component), `useAdminLang(): { lang: "vi" | "en"; setLang: (lang: "vi" | "en") => void; t: (key: AdminDictKey) => string }`, `type AdminDictKey` (union of dictionary keys), `ADMIN_LANG_STORAGE_KEY` constant (`"afp_admin_lang"`).
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/lib/admin-i18n.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminLangProvider, useAdminLang, ADMIN_LANG_STORAGE_KEY } from "../../src/lib/admin-i18n";

function Probe() {
  const { lang, setLang, t } = useAdminLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="label">{t("adminCampaigns")}</span>
      <button onClick={() => setLang(lang === "vi" ? "en" : "vi")}>toggle</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("AdminLangProvider / useAdminLang", () => {
  it("defaults to vi and renders the vi label", () => {
    render(<AdminLangProvider><Probe /></AdminLangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("vi");
    expect(screen.getByTestId("label").textContent).toBe("Campaign");
  });

  it("switches language, updates the translated label, and persists to localStorage", async () => {
    render(<AdminLangProvider><Probe /></AdminLangProvider>);
    await userEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("label").textContent).toBe("Campaigns");
    expect(localStorage.getItem(ADMIN_LANG_STORAGE_KEY)).toBe("en");
  });

  it("restores a previously saved language on mount", () => {
    localStorage.setItem(ADMIN_LANG_STORAGE_KEY, "en");
    render(<AdminLangProvider><Probe /></AdminLangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("falls back to the key itself when a translation is missing", () => {
    function MissingKeyProbe() {
      const { t } = useAdminLang();
      // @ts-expect-error - deliberately testing an unknown key at runtime
      return <span data-testid="missing">{t("thisKeyDoesNotExist")}</span>;
    }
    render(<AdminLangProvider><MissingKeyProbe /></AdminLangProvider>);
    expect(screen.getByTestId("missing").textContent).toBe("thisKeyDoesNotExist");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/admin-i18n.test.tsx`
Expected: FAIL — `Cannot find module '../../src/lib/admin-i18n'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/lib/admin-i18n.tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const ADMIN_LANG_STORAGE_KEY = "afp_admin_lang";

const ADMIN_DICT = {
  vi: {
    adminCampaigns: "Campaign",
    adminAnalytics: "Thống kê",
    adminLogout: "Đăng xuất",
    adminNewCampaign: "+ Campaign mới",
    adminEdit: "Sửa",
    adminDelete: "Xóa",
    adminSave: "Lưu",
    adminUpdate: "Cập nhật",
    adminCancel: "Đóng",
    adminDeleteCampaign: "Xóa Campaign",
    colSlug: "Slug",
    colTitle: "Tiêu đề",
    colLang: "Ngôn ngữ",
    colTime: "Thời gian",
    colStatus: "Trạng thái",
    colTemplates: "Số khung",
    campaignFormTitle: "Thông tin Campaign",
    fSlug: "Slug",
    fLang: "Ngôn ngữ",
    fStart: "Ngày bắt đầu",
    fEnd: "Ngày kết thúc",
    fStatus: "Trạng thái",
    fBadge: "Badge",
    fTitle: "Tiêu đề (VI)",
    fTitleEn: "Tiêu đề (EN)",
    fDesc: "Mô tả (VI)",
    fDescEn: "Mô tả (EN)",
    fCta: "Nhãn nút CTA (VI)",
    fCtaEn: "Nhãn nút CTA (EN)",
    statusOptDraft: "Nháp",
    statusOptActive: "Hoạt động",
    statusOptArchived: "Lưu trữ",
    adminNewTemplate: "+ Khung mới",
    templateFormTitle: "Cấu hình khung ảnh",
    fTplName: "Tên khung",
    fFrameUpload: "Ảnh khung (PNG)",
    fPhotoArea: "Vùng ảnh cá nhân (%)",
    campaignFramesTitle: "Khung ảnh của Campaign này",
    campaignFramesHint: "Quản lý khung ảnh ngay tại đây — không cần chuyển trang.",
    saveThisCampaignFirst: "Lưu Campaign này trước để bắt đầu thêm khung ảnh.",
    fQuickAdd: "Thêm nhanh trường phổ biến",
    kpiTotal: "Tổng lượt tải",
    kpiActive: "Campaign đang chạy",
    kpiTop: "Campaign nhiều lượt tải nhất",
    byCampaign: "Lượt tải theo Campaign",
    byUnit: "Lượt tải theo đơn vị",
    byDay: "Lượt tải theo ngày (7 ngày gần nhất)",
    liveDataNote: "(số liệu minh hoạ — chưa kết nối dữ liệu thật)",
  },
  en: {
    adminCampaigns: "Campaigns",
    adminAnalytics: "Analytics",
    adminLogout: "Log out",
    adminNewCampaign: "+ New campaign",
    adminEdit: "Edit",
    adminDelete: "Delete",
    adminSave: "Save",
    adminUpdate: "Update",
    adminCancel: "Close",
    adminDeleteCampaign: "Delete campaign",
    colSlug: "Slug",
    colTitle: "Title",
    colLang: "Language",
    colTime: "Schedule",
    colStatus: "Status",
    colTemplates: "Frames",
    campaignFormTitle: "Campaign details",
    fSlug: "Slug",
    fLang: "Language",
    fStart: "Start date",
    fEnd: "End date",
    fStatus: "Status",
    fBadge: "Badge",
    fTitle: "Title (VI)",
    fTitleEn: "Title (EN)",
    fDesc: "Description (VI)",
    fDescEn: "Description (EN)",
    fCta: "CTA label (VI)",
    fCtaEn: "CTA label (EN)",
    statusOptDraft: "Draft",
    statusOptActive: "Active",
    statusOptArchived: "Archived",
    adminNewTemplate: "+ Add frame",
    templateFormTitle: "Frame configuration",
    fTplName: "Frame name",
    fFrameUpload: "Frame image (PNG)",
    fPhotoArea: "Photo placement area (%)",
    campaignFramesTitle: "Frames for this campaign",
    campaignFramesHint: "Manage frames right here — no page switching needed.",
    saveThisCampaignFirst: "Save this campaign first to start adding frames.",
    fQuickAdd: "Quick-add common fields",
    kpiTotal: "Total downloads",
    kpiActive: "Active campaigns",
    kpiTop: "Top campaign",
    byCampaign: "Downloads by campaign",
    byUnit: "Downloads by business unit",
    byDay: "Downloads by day (last 7 days)",
    liveDataNote: "(sample data — not yet connected to real data)",
  },
} as const;

export type AdminLang = "vi" | "en";
export type AdminDictKey = keyof typeof ADMIN_DICT["vi"];

interface AdminLangContextValue {
  lang: AdminLang;
  setLang: (lang: AdminLang) => void;
  t: (key: AdminDictKey | string) => string;
}

const AdminLangContext = createContext<AdminLangContextValue | null>(null);

function loadSavedLang(): AdminLang {
  try {
    const saved = localStorage.getItem(ADMIN_LANG_STORAGE_KEY);
    return saved === "vi" || saved === "en" ? saved : "vi";
  } catch {
    return "vi";
  }
}

export function AdminLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AdminLang>("vi");

  useEffect(() => {
    setLangState(loadSavedLang());
  }, []);

  const setLang = useCallback((next: AdminLang) => {
    setLangState(next);
    try {
      localStorage.setItem(ADMIN_LANG_STORAGE_KEY, next);
    } catch {
      // storage unavailable — language choice just won't persist across reloads
    }
  }, []);

  const t = useCallback(
    (key: AdminDictKey | string) => (ADMIN_DICT[lang] as Record<string, string>)[key] ?? key,
    [lang],
  );

  return <AdminLangContext.Provider value={{ lang, setLang, t }}>{children}</AdminLangContext.Provider>;
}

export function useAdminLang(): AdminLangContextValue {
  const ctx = useContext(AdminLangContext);
  if (!ctx) throw new Error("useAdminLang must be used within AdminLangProvider");
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/admin-i18n.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-i18n.tsx tests/lib/admin-i18n.test.tsx
git commit -m "feat(admin): add admin-only VI/EN i18n provider"
```

---

## Task 2: `pickLocalized` helper for bilingual campaign content

**Files:**
- Create: `src/lib/localized-content.ts`
- Test: `tests/lib/localized-content.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pickLocalized(displayConfig: DisplayConfigLike | null | undefined, field: "title" | "description" | "ctaLabel", lang: "vi" | "en"): string`, `type DisplayConfigLike`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/localized-content.test.ts
import { describe, it, expect } from "vitest";
import { pickLocalized } from "../../src/lib/localized-content";

describe("pickLocalized", () => {
  it("returns the VI value when lang is vi", () => {
    expect(pickLocalized({ title: "Tiêu đề", titleEn: "Title" }, "title", "vi")).toBe("Tiêu đề");
  });

  it("returns the EN value when lang is en and it is present", () => {
    expect(pickLocalized({ title: "Tiêu đề", titleEn: "Title" }, "title", "en")).toBe("Title");
  });

  it("falls back to the VI value when lang is en but the EN field is empty", () => {
    expect(pickLocalized({ title: "Tiêu đề", titleEn: "" }, "title", "en")).toBe("Tiêu đề");
  });

  it("maps the ctaLabel field to the ctaEn key, not ctaLabelEn", () => {
    expect(pickLocalized({ ctaLabel: "Tạo ngay", ctaEn: "Create now" }, "ctaLabel", "en")).toBe("Create now");
  });

  it("returns an empty string when displayConfig is null or undefined", () => {
    expect(pickLocalized(null, "title", "vi")).toBe("");
    expect(pickLocalized(undefined, "description", "en")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/localized-content.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/localized-content'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/localized-content.ts
export interface DisplayConfigLike {
  title?: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  ctaLabel?: string;
  ctaEn?: string;
  badge?: string;
}

type LocalizableField = "title" | "description" | "ctaLabel";

function enKeyFor(field: LocalizableField): keyof DisplayConfigLike {
  if (field === "ctaLabel") return "ctaEn";
  return `${field}En` as keyof DisplayConfigLike;
}

export function pickLocalized(
  displayConfig: DisplayConfigLike | null | undefined,
  field: LocalizableField,
  lang: "vi" | "en",
): string {
  if (!displayConfig) return "";
  if (lang === "en") {
    const enValue = displayConfig[enKeyFor(field)];
    if (enValue) return enValue;
  }
  return displayConfig[field] ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/localized-content.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/localized-content.ts tests/lib/localized-content.test.ts
git commit -m "feat(admin): add pickLocalized helper for bilingual campaign content"
```

---

## Task 3: Wire i18n into the admin shell, header, and nav

**Files:**
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/components/admin-header.tsx`
- Modify: `src/components/admin-shell.tsx`
- Modify: `tests/components/admin-header.test.tsx`
- Test: `tests/components/admin-shell.test.tsx` (new)

**Interfaces:**
- Consumes: `AdminLangProvider`, `useAdminLang` from `src/lib/admin-i18n.tsx` (Task 1).
- Produces: nothing new consumed by later tasks (leaf UI).

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/components/admin-shell.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/campaigns" }));

import { AdminShell } from "../../src/components/admin-shell";
import { AdminLangProvider } from "../../src/lib/admin-i18n";

afterEach(() => cleanup());

describe("AdminShell", () => {
  it("renders VI nav labels by default and marks the active item", () => {
    render(
      <AdminLangProvider>
        <AdminShell>content</AdminShell>
      </AdminLangProvider>,
    );
    const active = screen.getByText("Campaign");
    expect(active.className).toContain("bg-[#FDE9D6]");
    expect(screen.getByText("Thống kê")).toBeTruthy();
  });
});
```

Append to `tests/components/admin-header.test.tsx` (inside the existing `describe("AdminHeader")` block, after the existing two tests — keep the existing tests and mocks as-is, add these):

```tsx
  it("shows a VI/EN language toggle defaulting to vi active", () => {
    render(<AdminHeader />);
    const viBtn = screen.getByRole("button", { name: "VI" });
    expect(viBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches the logout label to English when EN is selected", async () => {
    render(<AdminHeader />);
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  });
```

This requires wrapping the existing `render(<AdminHeader />)` calls with `AdminLangProvider` — update the test file's render helper:

```tsx
import { AdminLangProvider } from "../../src/lib/admin-i18n";

function renderHeader() {
  return render(
    <AdminLangProvider>
      <AdminHeader />
    </AdminLangProvider>,
  );
}
```

Replace every `render(<AdminHeader />)` call in the file with `renderHeader()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/admin-header.test.tsx tests/components/admin-shell.test.tsx`
Expected: FAIL — `AdminShell` throws `useAdminLang must be used within AdminLangProvider` (or "VI"/"EN" buttons not found), `Cannot find module` for the new shell test only if `admin-shell.test.tsx` didn't exist — it now does, so expect assertion failures instead.

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/admin/layout.tsx
"use client";

import { usePathname } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { AdminShell } from "@/components/admin-shell";
import { AdminLangProvider } from "@/lib/admin-i18n";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <AdminLangProvider>
      <div className="flex min-h-screen flex-col">
        <AdminHeader />
        <AdminShell>{children}</AdminShell>
      </div>
    </AdminLangProvider>
  );
}
```

```tsx
// src/components/admin-shell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAdminLang } from "@/lib/admin-i18n";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useAdminLang();

  const NAV_ITEMS = [
    { id: "campaigns", label: t("adminCampaigns"), href: "/admin/campaigns" },
    { id: "analytics", label: t("adminAnalytics"), href: "/admin/analytics" },
  ];

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
                  ? "bg-[#FDE9D6] text-[#C25A00]"
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

```tsx
// src/components/admin-header.tsx
"use client";

import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { NotificationBell } from "@/components/notification-bell";
import { useAdminLang, type AdminLang } from "@/lib/admin-i18n";
import { cn } from "@/lib/utils";

function LangToggle() {
  const { lang, setLang } = useAdminLang();
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-border bg-muted p-0.5" role="group" aria-label="VI/EN">
      {(["vi", "en"] as AdminLang[]).map((code) => (
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
          {code}
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

export function AdminHeader() {
  const { t } = useAdminLang();

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
        <LangToggle />
        <NotificationBell />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {t("adminLogout")}
        </button>
        <AvatarBadge />
      </div>
    </header>
  );
}
```

`useSession` requires the header to run under `SessionProvider` — check `src/app/layout.tsx`/`src/app/providers.tsx` (or equivalent) for an existing `SessionProvider` before wiring `AvatarBadge`. If none exists yet, wrap `AdminLangProvider` in `admin/layout.tsx` with `SessionProvider` from `next-auth/react` instead of adding a new provider file — `next-auth` is already a dependency (see `admin-header.tsx`'s existing `signOut` import) so no new install is needed. Update the test file's `next-auth/react` mock to also export a `useSession` mock returning `{ data: { user: { name: "Test Admin" } } }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/admin-header.test.tsx tests/components/admin-shell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/layout.tsx src/components/admin-shell.tsx src/components/admin-header.tsx tests/components/admin-header.test.tsx tests/components/admin-shell.test.tsx
git commit -m "feat(admin): wire i18n provider into shell, add lang toggle and avatar badge"
```

---

## Task 4: Bilingual fields in the Campaign form

**Files:**
- Modify: `src/app/admin/campaigns/campaign-form.tsx`
- Modify: `tests/app/admin/campaign-form.test.tsx`
- Modify: `tests/app/admin/campaigns-page.test.tsx` (one label-text call site only, see Step 3)

**Interfaces:**
- Consumes: nothing new (pure form component, no i18n needed inside the form fields themselves per spec — labels stay hard-coded VI/EN pairs side by side, not toggled).
- Produces: `CampaignDraft.displayConfig` now includes `titleEn?: string`, `descriptionEn?: string`, `ctaEn?: string`.

- [ ] **Step 1: Write the failing test**

Append to `tests/app/admin/campaign-form.test.tsx`, inside `describe("CampaignForm")`:

```tsx
  it("submits titleEn, descriptionEn and ctaEn entered by the admin", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề (VI)"), "Ngày hội Công nghệ");
    await userEvent.type(screen.getByLabelText("Tiêu đề (EN)"), "Tech Day");
    await userEvent.type(screen.getByLabelText("Mô tả (EN)"), "An event for FPT staff");
    await userEvent.type(screen.getByLabelText("Nhãn nút CTA (EN)"), "Start now");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      displayConfig: expect.objectContaining({
        titleEn: "Tech Day",
        descriptionEn: "An event for FPT staff",
        ctaEn: "Start now",
      }),
    }));
  });

  it("pre-fills titleEn, descriptionEn and ctaEn from initial when editing", async () => {
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
          displayConfig: {
            title: "FPT tròn 38 tuổi",
            titleEn: "FPT turns 38",
            description: "",
            descriptionEn: "Sample",
            ctaLabel: "Tạo avatar ngay",
            ctaEn: "Create now",
          },
        }}
      />,
    );

    expect((screen.getByLabelText("Tiêu đề (EN)") as HTMLInputElement).value).toBe("FPT turns 38");
    expect((screen.getByLabelText("Mô tả (EN)") as HTMLTextAreaElement).value).toBe("Sample");
    expect((screen.getByLabelText("Nhãn nút CTA (EN)") as HTMLInputElement).value).toBe("Create now");
  });
```

Note: the existing test `"submits slug, dates, language and displayConfig title..."` uses `screen.getByLabelText("Tiêu đề")` — that label text changes to `"Tiêu đề (VI)"` in this task, so update that existing assertion (and the pre-fill test using `"Tiêu đề"`) to `"Tiêu đề (VI)"` too, in the same edit.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx`
Expected: FAIL — labels `"Tiêu đề (EN)"`, `"Mô tả (EN)"`, `"Nhãn nút CTA (EN)"` not found; existing `"Tiêu đề"` lookups now ambiguous/missing.

- [ ] **Step 3: Write the implementation**

Modify `src/app/admin/campaigns/campaign-form.tsx`:

```tsx
interface CampaignDraft {
  slug: string;
  status: "draft" | "active" | "archived";
  startDate: string;
  endDate: string;
  language: "vi" | "en";
  displayConfig: {
    title: string;
    titleEn?: string;
    description: string;
    descriptionEn?: string;
    ctaLabel: string;
    ctaEn?: string;
    badge?: string;
  };
}

export function CampaignForm({ onSubmit, initial }: { onSubmit: (draft: CampaignDraft) => void; initial?: CampaignDraft }) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [status, setStatus] = useState<"draft" | "active" | "archived">(initial?.status ?? "draft");
  const [title, setTitle] = useState(initial?.displayConfig.title ?? "");
  const [titleEn, setTitleEn] = useState(initial?.displayConfig.titleEn ?? "");
  const [badge, setBadge] = useState(initial?.displayConfig.badge ?? "");
  const [description, setDescription] = useState(initial?.displayConfig.description ?? "");
  const [descriptionEn, setDescriptionEn] = useState(initial?.displayConfig.descriptionEn ?? "");
  const [ctaLabel, setCtaLabel] = useState(initial?.displayConfig.ctaLabel ?? "Tạo avatar ngay");
  const [ctaEn, setCtaEn] = useState(initial?.displayConfig.ctaEn ?? "");
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
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      setError("Slug chỉ được chứa chữ thường, số và dấu gạch ngang (VD: techweek-2026).");
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
      displayConfig: {
        title,
        titleEn: titleEn || undefined,
        description,
        descriptionEn: descriptionEn || undefined,
        ctaLabel,
        ctaEn: ctaEn || undefined,
        badge: badge || undefined,
      },
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
              <SelectValue>{(v: string) => ({ vi: "Tiếng Việt", en: "English" }[v] ?? v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">Tiếng Việt</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-status">Trạng thái</Label>
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
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-badge">Badge</Label>
          <Input id="campaign-badge" placeholder="VD: 38" value={badge} onChange={e => setBadge(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="campaign-title">Tiêu đề (VI)</Label>
          <Input id="campaign-title" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-title-en">Tiêu đề (EN)</Label>
          <Input id="campaign-title-en" value={titleEn} onChange={e => setTitleEn(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-cta">Nhãn nút CTA (VI)</Label>
          <Input id="campaign-cta" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-cta-en">Nhãn nút CTA (EN)</Label>
          <Input id="campaign-cta-en" value={ctaEn} onChange={e => setCtaEn(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-description">Mô tả (VI)</Label>
          <textarea
            id="campaign-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-description-en">Mô tả (EN)</Label>
          <textarea
            id="campaign-description-en"
            value={descriptionEn}
            onChange={e => setDescriptionEn(e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        </div>
      </div>
      <div className="rounded-lg border border-[#CFE2F4] bg-[#EAF2FB] p-3 text-xs leading-relaxed text-[#00396B]">
        Mỗi Campaign hỗ trợ song ngữ đầy đủ — điền cả 2 cột VI/EN, người dùng chuyển ngôn ngữ ở góc trên sẽ thấy đúng nội dung tương ứng.
      </div>
      <Button type="submit" className="w-fit">{initial ? "Cập nhật" : "Lưu"}</Button>
    </form>
  );
}
```

Also update the existing test that reads `screen.getByLabelText("Tiêu đề")` → `screen.getByLabelText("Tiêu đề (VI)")` in both the create-and-submit test and the badge/description/CTA pre-fill test (search the whole file for `"Tiêu đề"` as an exact label match and replace with `"Tiêu đề (VI)"`).

`CampaignForm` is also driven from `tests/app/admin/campaigns-page.test.tsx` — its `"AdminCampaignsPage create errors"` test does `await userEvent.type(screen.getByLabelText("Tiêu đề"), "T");`. Update that one call site too, in this same task, to `screen.getByLabelText("Tiêu đề (VI)")`, otherwise that test breaks even though this task never touches `campaigns-page.test.tsx` for any other reason.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/admin/campaign-form.test.tsx`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/campaigns/campaign-form.tsx tests/app/admin/campaign-form.test.tsx tests/app/admin/campaigns-page.test.tsx
git commit -m "feat(admin): add titleEn/descriptionEn/ctaEn bilingual fields to Campaign form"
```

---

## Task 5: `COMPONENT_PRESETS` constant

**Files:**
- Create: `src/lib/component-presets.ts`
- Test: `tests/lib/component-presets.test.ts`

**Interfaces:**
- Produces: `interface ComponentPreset { key: string; type: "select" | "text"; label: string; labelEn: string; options?: string[]; placeholder?: string }`, `COMPONENT_PRESETS: ComponentPreset[]`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/component-presets.test.ts
import { describe, it, expect } from "vitest";
import { COMPONENT_PRESETS } from "../../src/lib/component-presets";

describe("COMPONENT_PRESETS", () => {
  it("has exactly the 4 presets from the demo, in order", () => {
    expect(COMPONENT_PRESETS.map(p => p.key)).toEqual(["joinYear", "unit", "slogan", "signature"]);
  });

  it("joinYear is a select with options from 1988 up to the current year, descending", () => {
    const joinYear = COMPONENT_PRESETS.find(p => p.key === "joinYear")!;
    expect(joinYear.type).toBe("select");
    const currentYear = new Date().getFullYear();
    expect(joinYear.options![0]).toBe(String(currentYear));
    expect(joinYear.options![joinYear.options!.length - 1]).toBe("1988");
    expect(joinYear.options!.length).toBe(currentYear - 1988 + 1);
  });

  it("unit is a select with the fixed FPT business unit list", () => {
    const unit = COMPONENT_PRESETS.find(p => p.key === "unit")!;
    expect(unit.options).toEqual(["FPT Software", "FPT Telecom", "FPT IS", "FPT Education", "FPT Retail", "Khác"]);
  });

  it("slogan and signature are free-text presets with placeholders, no options", () => {
    const slogan = COMPONENT_PRESETS.find(p => p.key === "slogan")!;
    const signature = COMPONENT_PRESETS.find(p => p.key === "signature")!;
    expect(slogan.type).toBe("text");
    expect(slogan.options).toBeUndefined();
    expect(slogan.placeholder).toBe("VD: Dream Big, Move Fast");
    expect(signature.type).toBe("text");
    expect(signature.placeholder).toBe("VD: Nguyễn Văn A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/component-presets.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/component-presets'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/component-presets.ts
export interface ComponentPreset {
  key: string;
  type: "select" | "text";
  label: string;
  labelEn: string;
  options?: string[];
  placeholder?: string;
}

function joinYearOptions(): string[] {
  const currentYear = new Date().getFullYear();
  const years: string[] = [];
  for (let year = currentYear; year >= 1988; year--) years.push(String(year));
  return years;
}

export const COMPONENT_PRESETS: ComponentPreset[] = [
  {
    key: "joinYear",
    type: "select",
    label: "Năm gia nhập FPT",
    labelEn: "Year joined FPT",
    options: joinYearOptions(),
  },
  {
    key: "unit",
    type: "select",
    label: "Đơn vị công tác",
    labelEn: "Business unit",
    options: ["FPT Software", "FPT Telecom", "FPT IS", "FPT Education", "FPT Retail", "Khác"],
  },
  {
    key: "slogan",
    type: "text",
    label: "Câu châm ngôn",
    labelEn: "Personal slogan",
    placeholder: "VD: Dream Big, Move Fast",
  },
  {
    key: "signature",
    type: "text",
    label: "Chữ ký / Tên hiển thị",
    labelEn: "Display name / signature",
    placeholder: "VD: Nguyễn Văn A",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/component-presets.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/component-presets.ts tests/lib/component-presets.test.ts
git commit -m "feat(admin): add COMPONENT_PRESETS quick-add field definitions"
```

---

## Task 6: Move `TemplateForm`, add the quick-add checkbox lane

**Files:**
- Create: `src/app/admin/campaigns/template-form.tsx` (moved from `src/app/admin/campaigns/[slug]/templates/template-form.tsx`, plus the checkbox feature)
- Delete: `src/app/admin/campaigns/[slug]/templates/template-form.tsx`
- Create: `tests/app/admin/template-form.test.tsx` is **modified in place** — only its import path changes, plus new tests appended (file stays at the same test path; it now targets the moved component)

**Interfaces:**
- Consumes: `COMPONENT_PRESETS`, `ComponentPreset` from `src/lib/component-presets.ts` (Task 5); `TextOverlay` from `@/lib/compositing/overlay-layout` (unchanged, existing).
- Produces: `TemplateForm({ onSubmit, initial }: { onSubmit: (draft: TemplateDraft) => void; initial?: TemplateInitial })` at its new path `src/app/admin/campaigns/template-form.tsx` — same exported shape as before, consumed by Task 7's merged campaigns page.

- [ ] **Step 1: Write the failing tests**

Update `tests/app/admin/template-form.test.tsx`'s import line:

```tsx
import { TemplateForm } from "../../../src/app/admin/campaigns/template-form";
```

Append these tests inside the existing `describe("TemplateForm")` block:

```tsx
  it("adds a text overlay with default position when a text preset checkbox is ticked", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung preset");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    await userEvent.click(screen.getByLabelText("Câu châm ngôn"));
    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([
          expect.objectContaining({ key: "slogan", type: "text", label: "Câu châm ngôn" }),
        ]),
      }),
    }));
  });

  it("adds a select overlay with year options when the join-year preset is ticked", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung preset");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    await userEvent.click(screen.getByLabelText("Năm gia nhập FPT"));
    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    const currentYear = String(new Date().getFullYear());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([
          expect.objectContaining({ key: "joinYear", type: "select", options: expect.arrayContaining([currentYear, "1988"]) }),
        ]),
      }),
    }));
  });

  it("removes an untouched preset overlay immediately when its checkbox is unticked", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung preset");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    const checkbox = screen.getByLabelText("Chữ ký / Tên hiển thị");
    await userEvent.click(checkbox);
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.not.arrayContaining([expect.objectContaining({ key: "signature" })]),
      }),
    }));
  });

  it("asks for confirmation before removing a preset overlay the admin has edited, and keeps it if cancelled", async () => {
    const onSubmit = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung preset");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    const checkbox = screen.getByLabelText("Câu châm ngôn");
    await userEvent.click(checkbox);
    // Edit the auto-added overlay's font size so it no longer matches the preset default.
    const fontSizeInputs = screen.getAllByLabelText("Cỡ chữ");
    await userEvent.clear(fontSizeInputs[0]);
    await userEvent.type(fontSizeInputs[0], "40");

    await userEvent.click(checkbox);
    expect(window.confirm).toHaveBeenCalled();
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([expect.objectContaining({ key: "slogan", fontSize: 40 })]),
      }),
    }));
  });

  it("pre-checks a preset checkbox when initial overlays already contain a matching key", () => {
    render(
      <TemplateForm
        onSubmit={vi.fn()}
        initial={{
          name: "Khung có sẵn",
          overlayConfig: {
            photoArea: { x: 20, y: 20, w: 60, h: 60 },
            textOverlays: [{ key: "unit", label: "Đơn vị công tác", labelEn: "Business unit", type: "select", options: ["FPT Software"], x: 50, y: 50, fontSize: 20, color: "#ffffff" }],
          },
        }}
      />,
    );

    expect((screen.getByLabelText("Đơn vị công tác") as HTMLInputElement).checked).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/admin/template-form.test.tsx`
Expected: FAIL — `Cannot find module '../../../src/app/admin/campaigns/template-form'`

- [ ] **Step 3: Write the implementation**

Create `src/app/admin/campaigns/template-form.tsx` with the full existing content of `src/app/admin/campaigns/[slug]/templates/template-form.tsx` (read it in full before writing so nothing is lost), plus these additions:

```tsx
// add to the existing imports at the top
import { COMPONENT_PRESETS, type ComponentPreset } from "@/lib/component-presets";

// add near the other module-level helpers (after emptyOverlay)
function presetOverlay(preset: ComponentPreset): TextOverlay {
  return {
    key: preset.key,
    label: preset.label,
    labelEn: preset.labelEn,
    type: preset.type,
    options: preset.options,
    placeholder: preset.placeholder,
    x: 50,
    y: 50,
    fontSize: 20,
    color: "#ffffff",
  };
}

function overlaysMatch(a: TextOverlay, b: TextOverlay): boolean {
  return (
    a.key === b.key &&
    a.label === b.label &&
    a.labelEn === b.labelEn &&
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.placeholder === b.placeholder &&
    JSON.stringify(a.options ?? []) === JSON.stringify(b.options ?? [])
  );
}
```

Inside the `TemplateForm` component function, add after the existing `removeOverlay` function:

```tsx
  function togglePreset(preset: ComponentPreset) {
    const index = overlays.findIndex(o => o.key === preset.key);
    if (index === -1) {
      setOverlays(list => [...list, presetOverlay(preset)]);
      return;
    }
    const current = overlays[index];
    const isUnmodified = overlaysMatch(current, presetOverlay(preset));
    if (!isUnmodified && !window.confirm(`Trường "${preset.label}" đã được chỉnh sửa. Xoá trường này khỏi khung?`)) {
      return;
    }
    setOverlays(list => list.filter((_, i) => i !== index));
  }
```

Add this block to the JSX, immediately before the existing `<div className="space-y-3">` that renders "Trường overlay chữ":

```tsx
      <fieldset className="space-y-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-medium">Thêm nhanh trường phổ biến</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COMPONENT_PRESETS.map(preset => (
            <label key={preset.key} htmlFor={`preset-${preset.key}`} className="flex items-center gap-2 text-sm">
              <input
                id={`preset-${preset.key}`}
                type="checkbox"
                checked={overlays.some(o => o.key === preset.key)}
                onChange={() => togglePreset(preset)}
              />
              {preset.label}
            </label>
          ))}
        </div>
      </fieldset>
```

Then delete `src/app/admin/campaigns/[slug]/templates/template-form.tsx` (its content has been fully carried over into the new file).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/admin/template-form.test.tsx`
Expected: PASS (all original tests + 5 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/campaigns/template-form.tsx tests/app/admin/template-form.test.tsx
git rm src/app/admin/campaigns/\[slug\]/templates/template-form.tsx
git commit -m "feat(admin): move TemplateForm, add quick-add preset checkboxes"
```

---

## Task 7: Merge "Quản lý khung" into the Campaign form, delete the old route

**Files:**
- Modify: `src/app/admin/campaigns/page.tsx`
- Delete: `src/app/admin/campaigns/[slug]/templates/page.tsx`
- Delete: `tests/app/admin/templates-page.test.tsx` (its coverage is replaced by the new tests below)
- Modify: `tests/app/admin/campaigns-page.test.tsx`

**Interfaces:**
- Consumes: `TemplateForm` from `src/app/admin/campaigns/template-form.tsx` (Task 6).
- Produces: nothing new consumed elsewhere — this is the top-level page.

- [ ] **Step 1: Write the failing tests**

Append to `tests/app/admin/campaigns-page.test.tsx`, as new top-level `describe` blocks:

```tsx
describe("AdminCampaignsPage merged frames section", () => {
  function mockCampaignAndTemplatesFetch() {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/admin/campaigns" && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ slug: "fpt38", status: "active", language: "vi", startDate: "2026-08-13", endDate: "2026-09-13", displayConfig: { title: "FPT 38" }, _count: { templates: 1 } }],
        });
      }
      if (url === "/api/admin/campaigns/fpt38") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            slug: "fpt38",
            templates: [{ id: "t1", name: "Khung cam chuẩn", overlayConfig: { photoArea: { x: 18, y: 14, w: 64, h: 64 } } }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as unknown as typeof fetch;
  }

  it("shows the frames grid for an existing campaign being edited, not for a brand-new one", async () => {
    mockCampaignAndTemplatesFetch();
    render(<AdminCampaignsPage />);
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Sửa" }));
    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());

    await userEvent.click(screen.getAllByRole("button", { name: "Đóng" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "+ Campaign mới" }));
    expect(screen.getByText("Lưu Campaign này trước để bắt đầu thêm khung ảnh.")).toBeTruthy();
    expect(screen.queryByText("Khung cam chuẩn")).toBeNull();
  });

  it("deletes a frame via the merged section using the existing template DELETE endpoint", async () => {
    mockCampaignAndTemplatesFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminCampaignsPage />);
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Sửa" }));
    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Xóa khung" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/campaigns/fpt38/templates/t1",
      expect.objectContaining({ method: "DELETE" }),
    ));
  });
});
```

Note: the frame-card "Xóa" button must be distinguishable from the campaign-row "Xóa" button already covered by the file's existing delete-confirmation tests — label it `"Xóa khung"` in the implementation (see Step 3) so `getByRole("button", { name: "Xóa" })` in existing tests keeps matching only the campaign row's button.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/admin/campaigns-page.test.tsx`
Expected: FAIL — no frames grid rendered, "Đóng" button not found (current code's close button is unlabeled/differently labeled — check current text, it's already `"Đóng"` per the existing `campaigns/page.tsx` read earlier, so this part may already pass; the frame-grid assertions fail).

- [ ] **Step 3: Write the implementation**

Rewrite `src/app/admin/campaigns/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CampaignForm } from "./campaign-form";
import { TemplateForm } from "./template-form";
import { useAdminLang } from "@/lib/admin-i18n";
import { pickLocalized } from "@/lib/localized-content";

export default function AdminCampaignsPage() {
  const { lang, t } = useAdminLang();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<any[]>([]);
  const [templateEditing, setTemplateEditing] = useState<any | null>(null);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

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

  function loadTemplates(slug: string) {
    fetch(`/api/admin/campaigns/${slug}`)
      .then(res => (res.ok ? res.json() : { templates: [] }))
      .then(data => setTemplates(Array.isArray(data.templates) ? data.templates : []))
      .catch(() => setTemplates([]));
  }

  const editingSlug: string | null = editing && editing.slug ? editing.slug : null;

  useEffect(() => {
    if (editingSlug) {
      loadTemplates(editingSlug);
    } else {
      setTemplates([]);
    }
    setTemplateEditing(null);
    setTemplateError(null);
  }, [editingSlug]);

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
        const data = await res.json().catch(() => null);
        setSubmitError(data?.error ?? "Không tạo được Campaign. Vui lòng thử lại.");
        return;
      }
      const created = await res.json();
      loadCampaigns();
      setEditing(created);
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
    if (!window.confirm(`Xóa campaign "${slug}"? Không thể hoàn tác.`)) return;
    await fetch(`/api/admin/campaigns/${slug}`, { method: "DELETE" });
    loadCampaigns();
  }

  const STATUS_CYCLE = ["draft", "active", "archived"];

  async function handleCycleStatus(slug: string, currentStatus: string) {
    const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length];
    const res = await fetch(`/api/admin/campaigns/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      setSubmitError("Không đổi được trạng thái. Vui lòng thử lại.");
      return;
    }
    loadCampaigns();
  }

  async function handleTemplateCreate(draft: { name: string; frameImage: File | null; overlayConfig: unknown }) {
    setTemplateSubmitting(true);
    setTemplateError(null);
    try {
      const form = new FormData();
      form.set("name", draft.name);
      form.set("frameImage", draft.frameImage!);
      form.set("overlayConfig", JSON.stringify(draft.overlayConfig));
      const res = await fetch(`/api/admin/campaigns/${editingSlug}/templates`, { method: "POST", body: form });
      if (!res.ok) {
        setTemplateError("Không tạo được khung. Vui lòng thử lại.");
        return;
      }
      setTemplateEditing(null);
      loadTemplates(editingSlug!);
    } finally {
      setTemplateSubmitting(false);
    }
  }

  async function handleTemplateUpdate(draft: { name: string; frameImage: File | null; overlayConfig: unknown }) {
    setTemplateSubmitting(true);
    setTemplateError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${editingSlug}/templates/${templateEditing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, overlayConfig: draft.overlayConfig }),
      });
      if (!res.ok) {
        setTemplateError("Không cập nhật được khung. Vui lòng thử lại.");
        return;
      }
      setTemplateEditing(null);
      loadTemplates(editingSlug!);
    } finally {
      setTemplateSubmitting(false);
    }
  }

  async function handleTemplateDelete(id: string) {
    if (!window.confirm("Xóa khung này? Không thể hoàn tác.")) return;
    await fetch(`/api/admin/campaigns/${editingSlug}/templates/${id}`, { method: "DELETE" });
    loadTemplates(editingSlug!);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("adminCampaigns")}</h1>
        {editing === null && (
          <Button type="button" onClick={() => setEditing(undefined as any)}>
            {t("adminNewCampaign")}
          </Button>
        )}
      </div>

      <div className="overflow-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-muted text-left">
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colSlug")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colTitle")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colLang")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colTime")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colStatus")}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("colTemplates")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.slug} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">/c/{c.slug}</td>
                <td className="px-4 py-3 font-semibold">{pickLocalized(c.displayConfig, "title", lang) || c.slug}</td>
                <td className="px-4 py-3 uppercase">{c.language}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {String(c.startDate).slice(0, 10)} – {String(c.endDate).slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleCycleStatus(c.slug, c.status)}
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-bold transition-opacity hover:opacity-80",
                      c.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : c.status === "archived"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {c.status === "active" ? t("statusOptActive") : c.status === "archived" ? t("statusOptArchived") : t("statusOptDraft")}
                  </button>
                </td>
                <td className="px-4 py-3 tabular-nums">{c._count?.templates ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/c/${c.slug}`} className="text-sm text-primary underline-offset-4 hover:underline">
                      {c.slug}
                    </Link>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(c)}>
                      {t("adminEdit")}
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(c.slug)}>
                      {t("adminDelete")}
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
            <div className="text-sm font-bold">{editing ? t("campaignFormTitle") : t("adminNewCampaign")}</div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              {t("adminCancel")}
            </Button>
          </div>
          <fieldset disabled={submitting} aria-busy={submitting}>
            <CampaignForm key={editing?.slug ?? "new"} initial={editing ?? undefined} onSubmit={editing ? handleUpdate : handleCreate} />
          </fieldset>

          <div className="mt-6 border-t border-border pt-5">
            <div className="mb-3">
              <div className="text-[15px] font-bold">{t("campaignFramesTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("campaignFramesHint")}</div>
            </div>

            {editingSlug ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {templates.map(tpl => (
                    <div key={tpl.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                      <div className="relative aspect-square bg-[repeating-conic-gradient(#eef1f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                        {tpl.frameImageUrl ? (
                          <img src={tpl.frameImageUrl} alt={tpl.name} className="h-full w-full object-contain" />
                        ) : (
                          <div className="absolute inset-[8%] rounded-lg border-[6px] border-primary/60" />
                        )}
                      </div>
                      <div className="p-3">
                        <div className="mb-1 truncate text-sm font-bold">{tpl.name}</div>
                        <div className="mb-3 font-mono text-[11px] text-muted-foreground">
                          x:{tpl.overlayConfig?.photoArea?.x}% y:{tpl.overlayConfig?.photoArea?.y}% {tpl.overlayConfig?.photoArea?.w}×{tpl.overlayConfig?.photoArea?.h}%
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setTemplateEditing(tpl)}>
                            {t("adminEdit")}
                          </Button>
                          <Button type="button" variant="destructive" size="sm" className="flex-1" onClick={() => handleTemplateDelete(tpl.id)}>
                            Xóa khung
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {templateEditing === null && (
                  <Button type="button" size="sm" onClick={() => setTemplateEditing(undefined as any)}>
                    {t("adminNewTemplate")}
                  </Button>
                )}

                {templateError && <p role="alert" className="mt-2 text-sm text-destructive">{templateError}</p>}

                {templateEditing !== null && (
                  <div className="mt-4 rounded-2xl border border-border bg-background p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-sm font-bold">{templateEditing ? t("templateFormTitle") : t("adminNewTemplate")}</div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setTemplateEditing(null)}>
                        {t("adminCancel")}
                      </Button>
                    </div>
                    <fieldset disabled={templateSubmitting} aria-busy={templateSubmitting}>
                      <TemplateForm
                        key={templateEditing?.id ?? "new"}
                        initial={templateEditing ? { name: templateEditing.name, overlayConfig: templateEditing.overlayConfig } : undefined}
                        onSubmit={templateEditing ? handleTemplateUpdate : handleTemplateCreate}
                      />
                    </fieldset>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs italic text-muted-foreground">{t("saveThisCampaignFirst")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

Note the campaign row's "Quản lý khung" link changed to link straight to the public `/c/[slug]` page (since the admin template-management route no longer exists) — labeled with the slug. If this reads oddly, an acceptable alternative already covered by the new merged section is to remove that link entirely, since "Sửa" now opens frame management inline. Remove the `<Link>` element instead of repurposing it, to avoid a link that goes nowhere useful:

```tsx
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(c)}>
                      {t("adminEdit")}
                    </Button>
```

(Delete the `<Link href={`/c/${c.slug}`}>` block entirely — "Sửa" is now the single entry point for both campaign fields and frame management.)

Then delete `src/app/admin/campaigns/[slug]/templates/page.tsx` and the now-empty `src/app/admin/campaigns/[slug]/templates/` and `src/app/admin/campaigns/[slug]/` directories, and delete `tests/app/admin/templates-page.test.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/admin/campaigns-page.test.tsx`
Expected: PASS (all existing tests + 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/campaigns/page.tsx tests/app/admin/campaigns-page.test.tsx
git rm -r "src/app/admin/campaigns/[slug]" tests/app/admin/templates-page.test.tsx
git commit -m "feat(admin): merge frame management into the Campaign edit form, remove old route"
```

---

## Task 8: Analytics API — add `byDay` (real data)

**Files:**
- Modify: `src/app/api/admin/analytics/route.ts`
- Test: `tests/app/api/admin-analytics.test.ts` (new — check `tests/app/api/` for the existing naming convention first; if API route tests live elsewhere in this repo, e.g. `tests/api/`, follow that existing convention instead)

**Interfaces:**
- Consumes: `prisma.generatedAvatar` (existing Prisma model, unchanged).
- Produces: `GET /api/admin/analytics` response gains a top-level array field is **not** how the current response is shaped (current response is a bare array of campaign rows) — see Step 3 for the exact reshape.

- [ ] **Step 1: Write the failing test**

First check for an existing analytics API test file or convention:

```bash
ls tests/app/api/ 2>/dev/null; ls tests/api/ 2>/dev/null
```

If neither directory exists, create `tests/app/api/admin-analytics.test.ts`:

```ts
/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ ok: true }) }));

const findManyMock = vi.fn();
const groupByMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findMany: (...args: unknown[]) => findManyMock(...args) },
    generatedAvatar: { groupBy: (...args: unknown[]) => groupByMock(...args) },
  },
}));

import { GET } from "../../../src/app/api/admin/analytics/route";

beforeEach(() => {
  findManyMock.mockReset();
  groupByMock.mockReset();
});

describe("GET /api/admin/analytics", () => {
  it("keeps returning the existing by-campaign array shape (backward compatible)", async () => {
    findManyMock.mockResolvedValue([
      { slug: "fpt38", status: "active", displayConfig: { title: "FPT 38" }, _count: { avatars: 5 } },
    ]);
    groupByMock.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ slug: "fpt38", title: "FPT 38", count: 5, status: "active" });
  });
});
```

Given the current `GET` handler returns a bare array (per the code read during spec research), and the spec calls for adding `byDay` without breaking that shape, the response must change shape to `{ campaigns: [...], byDay: [...] }`. This is a **breaking** change to the response shape that the existing frontend (`analytics/page.tsx`) already depends on as a bare array — Task 9 updates that frontend in the same breath. Replace the test above (delete it) with one that asserts the **new** shape directly, since keeping backward compatibility here is not actually required (this API has exactly one consumer, updated together in Task 9):

```ts
describe("GET /api/admin/analytics", () => {
  it("returns campaigns and a 7-day byDay series", async () => {
    findManyMock.mockResolvedValue([
      { slug: "fpt38", status: "active", displayConfig: { title: "FPT 38" }, _count: { avatars: 5 } },
    ]);
    groupByMock.mockResolvedValue([
      { createdAt: new Date("2026-08-20T00:00:00.000Z"), _count: { _all: 3 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.campaigns[0]).toMatchObject({ slug: "fpt38", title: "FPT 38", count: 5, status: "active" });
    expect(Array.isArray(body.byDay)).toBe(true);
    expect(body.byDay).toHaveLength(7);
    expect(body.byDay.every((d: any) => typeof d.day === "string" && typeof d.count === "number")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-analytics.test.ts`
Expected: FAIL — `body.campaigns` is `undefined` (current handler returns a bare array).

- [ ] **Step 3: Write the implementation**

```ts
// src/app/api/admin/analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaigns = await prisma.campaign.findMany({
    select: { slug: true, status: true, displayConfig: true, _count: { select: { avatars: true } } },
  });

  const campaignRows = campaigns
    .map(c => ({
      slug: c.slug,
      title: (c.displayConfig as { title?: string })?.title || c.slug,
      count: c._count.avatars,
      status: c.status,
    }))
    .sort((a, b) => b.count - a.count);

  const since = new Date(Date.now() - 6 * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);

  const rawByDay = await prisma.generatedAvatar.groupBy({
    by: ["createdAt"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const row of rawByDay) {
    const key = dayKey(new Date(row.createdAt));
    counts.set(key, (counts.get(key) ?? 0) + row._count._all);
  }

  const byDay: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    const key = dayKey(d);
    byDay.push({ day: key, count: counts.get(key) ?? 0 });
  }

  return NextResponse.json({ campaigns: campaignRows, byDay });
}
```

Note: `groupBy` on the raw `createdAt` timestamp column groups by exact-millisecond values, not by calendar day — each row is effectively its own group. This still produces correct totals once reduced through the `counts` map (each raw group's `_count._all` gets added into its day bucket), just less efficiently than a SQL `date_trunc` would. Given the low volume of `GeneratedAvatar` rows expected (event-avatar downloads, not high-frequency data), this is an acceptable tradeoff over hand-writing a raw SQL query — do not raw-SQL this without confirming actual row-count concerns first.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-analytics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/analytics/route.ts tests/app/api/admin-analytics.test.ts
git commit -m "feat(admin): add real byDay download counts to analytics API"
```

---

## Task 9: Analytics page — restyle, wire `byDay`, add placeholder `byUnit`

**Files:**
- Create: `src/lib/analytics-placeholder.ts`
- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `tests/app/admin/analytics-page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/analytics` new response shape `{ campaigns: [...], byDay: [...] }` (Task 8); `useAdminLang` (Task 1).
- Produces: nothing consumed elsewhere (leaf page).

- [ ] **Step 1: Write the failing tests**

Rewrite `tests/app/admin/analytics-page.test.tsx` in full (the response shape change means every existing mock needs updating):

```tsx
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

function mockAnalyticsFetch(campaigns: any[], byDay: { day: string; count: number }[] = []) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ campaigns, byDay }),
  });
}

describe("AdminAnalyticsPage", () => {
  it("fetches and renders one bar row per campaign with its download count", async () => {
    mockAnalyticsFetch([
      { slug: "techweek-2026", title: "Tech Week", count: 12 },
      { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5 },
    ]);

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Tech Week")).toBeTruthy());
    expect(screen.getByText("FPT tròn 38 tuổi")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith("/api/admin/analytics");
  });

  it("shows an empty-state message when there are no campaigns yet", async () => {
    mockAnalyticsFetch([]);

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy());
  });

  it("shows an error message when the fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Không tải được dữ liệu. Vui lòng thử lại.")).toBeTruthy());
  });

  it("renders KPI cards for total downloads, active campaigns, and the top campaign", async () => {
    mockAnalyticsFetch([
      { slug: "techweek-2026", title: "Tech Week", count: 12, status: "draft" },
      { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5, status: "active" },
    ]);

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("17")).toBeTruthy());
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Tech Week")).toBeTruthy();
  });

  it("renders a 7-day bar for each day returned by the API", async () => {
    const byDay = [
      { day: "2026-08-16", count: 1 },
      { day: "2026-08-17", count: 2 },
      { day: "2026-08-18", count: 0 },
      { day: "2026-08-19", count: 4 },
      { day: "2026-08-20", count: 3 },
      { day: "2026-08-21", count: 5 },
      { day: "2026-08-22", count: 2 },
    ];
    mockAnalyticsFetch([{ slug: "fpt38", title: "FPT 38", count: 17, status: "active" }], byDay);

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Lượt tải theo ngày (7 ngày gần nhất)")).toBeTruthy());
    expect(screen.getAllByTestId("day-chart-col")).toHaveLength(7);
  });

  it("renders the by-unit placeholder chart with its disclaimer note", async () => {
    mockAnalyticsFetch([{ slug: "fpt38", title: "FPT 38", count: 17, status: "active" }]);

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Lượt tải theo đơn vị")).toBeTruthy());
    expect(screen.getByText("(số liệu minh hoạ — chưa kết nối dữ liệu thật)")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/admin/analytics-page.test.tsx`
Expected: FAIL — current page reads the response as a bare array (`Array.isArray(data)`), so `campaigns`/`byDay` destructuring assertions and the new chart-title/testid assertions all fail.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/analytics-placeholder.ts
export const BY_UNIT_PLACEHOLDER: { name: string; value: number }[] = [
  { name: "FPT Software", value: 420 },
  { name: "FPT Telecom", value: 310 },
  { name: "FPT IS", value: 180 },
  { name: "FPT Education", value: 150 },
  { name: "FPT Retail", value: 95 },
];
```

```tsx
// src/app/admin/analytics/page.tsx
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

export default function AdminAnalyticsPage() {
  const { t } = useAdminLang();
  const [rows, setRows] = useState<AnalyticsRow[] | null>(null);
  const [byDay, setByDay] = useState<DayCount[]>([]);
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
      })
      .catch(() => setError(true));
  }, []);

  const max = Math.max(1, ...(rows ?? []).map(r => r.count));
  const totalDownloads = (rows ?? []).reduce((sum, r) => sum + r.count, 0);
  const activeCampaigns = (rows ?? []).filter(r => r.status === "active").length;
  const topCampaign = rows && rows.length > 0 ? rows[0].title : "—";
  const maxDay = Math.max(1, ...byDay.map(d => d.count));
  const maxUnit = Math.max(1, ...BY_UNIT_PLACEHOLDER.map(u => u.value));

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
            {t("byUnit")} <span className="ml-1 text-xs font-normal text-muted-foreground">{t("liveDataNote")}</span>
          </div>
          <div className="flex flex-col gap-3">
            {BY_UNIT_PLACEHOLDER.map(u => {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/admin/analytics-page.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics-placeholder.ts src/app/admin/analytics/page.tsx tests/app/admin/analytics-page.test.tsx
git commit -m "feat(admin): restyle analytics page, add real byDay and placeholder byUnit charts"
```

---

## Task 10: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If errors appear in files this plan touched, fix them; if they're pre-existing and unrelated, note them separately rather than fixing out-of-scope code.

- [ ] **Step 2: Production build**

Run: `npx next build`
Expected: build succeeds. Pay particular attention to the deleted `src/app/admin/campaigns/[slug]/templates/` route no longer being referenced anywhere (search: `grep -r "campaigns/\[slug\]/templates" src/` should return nothing, and `grep -r "\[slug\]/templates" src/` for any stray relative imports).

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including every file this plan modified or created.

- [ ] **Step 4: Manual smoke check in the browser** (if a local dev environment with Postgres/MinIO is available)

Start the dev server (`.claude/launch.json` → `nextjs-dev`), sign in via dev-login, and walk through:
1. `/admin/campaigns` — table renders with new pill styling, avatar badge and lang toggle appear in the header.
2. Click "+ Campaign mới" → fill in slug/title/dates → Save → the form stays open on the saved campaign and a "Khung ảnh của Campaign này" section appears with "+ Khung mới".
3. Add a frame, tick "Câu châm ngôn" → confirm an overlay field appears pre-filled → save.
4. Toggle EN in the header → campaign table title switches to the campaign's `titleEn` (or falls back to VI if empty) → nav labels and buttons switch to English.
5. `/admin/analytics` — 3 KPI cards, "theo Campaign" chart, "theo Ngày" chart (7 real bars), "theo Đơn vị" chart with the placeholder disclaimer, all in the restyled card/token style.

- [ ] **Step 5: Commit** (only if smoke-check fixes were needed)

```bash
git add -A
git commit -m "fix(admin): smoke-test fixes for demo-parity work"
```
