# Public Site Demo Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the public site (`/`, `/c/[slug]`) to match the demo's UX (header, bilingual content, 2-column campaign flow, drag/zoom photo staging, real download) and — critically — wire the "Tạo avatar" flow to the already-hardened `/api/campaigns/[slug]/generate` endpoint so avatar downloads become real instead of a no-op.

**Architecture:** Add a public-only i18n layer (mirroring `admin-i18n.tsx`) and a public header, wrapped via a Next.js route group so `/` and `/c/[slug]` share chrome without changing their URLs. Extend the existing `renderPreview()` canvas utility with pan/zoom support instead of replacing it with demo's less-accurate CSS approach. Rewrite `campaign-compositor.tsx` into `avatar-creator.tsx` with the full 3-step flow, then wire its download button to the real `/generate` API and add a public, read-filtered notification bell backed by a new unauthenticated API route.

**Tech Stack:** Next.js App Router (Server + Client Components), React, TypeScript, Tailwind, Vitest + Testing Library, Prisma/Postgres, MinIO (via `getStorage()`).

**Spec:** [docs/superpowers/specs/2026-08-23-public-site-demo-parity-design.md](../specs/2026-08-23-public-site-demo-parity-design.md)

## Global Constraints

- No Prisma schema changes.
- No changes to `/generate`'s existing hardening (`validateOverlayValues`, 10MB photo cap, `isCampaignPubliclyVisible` scoping) — only consume it from the frontend.
- No visitor login/auth system — the home page stays the direct entry point.
- The public notification bell's "mark all read" writes ONLY to `localStorage` — it must never call any endpoint that mutates the `Notification.read` column (that column stays admin-only).
- `GET /api/notifications` (new, public) has no DELETE/PATCH — read-only, unauthenticated.
- Route group `(public)` must not change any existing URL — `/` stays `/`, `/c/[slug]` stays `/c/[slug]`.
- Run `npx tsc --noEmit`, `npx next build`, and `npx vitest run` before considering any task's changes final.

---

## Task 1: Public i18n foundation (dictionary + provider + hook)

**Files:**
- Create: `src/lib/public-i18n.tsx`
- Test: `tests/lib/public-i18n.test.tsx`

**Interfaces:**
- Produces: `PublicLangProvider({ children })`, `usePublicLang(): { lang: "vi" | "en"; setLang: (lang: "vi" | "en") => void; t: (key: PublicDictKey) => string }`, `type PublicLang`, `type PublicDictKey`, `PUBLIC_LANG_STORAGE_KEY` (`"afp_public_lang"`).
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/lib/public-i18n.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicLangProvider, usePublicLang, PUBLIC_LANG_STORAGE_KEY } from "../../src/lib/public-i18n";
import { ADMIN_LANG_STORAGE_KEY } from "../../src/lib/admin-i18n";

function Probe() {
  const { lang, setLang, t } = usePublicLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="label">{t("downloadButton")}</span>
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

describe("PublicLangProvider / usePublicLang", () => {
  it("defaults to vi and renders the vi label", () => {
    render(<PublicLangProvider><Probe /></PublicLangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("vi");
    expect(screen.getByTestId("label").textContent).toBe("Tải ảnh về máy");
  });

  it("switches language, updates the translated label, and persists to its own localStorage key", async () => {
    render(<PublicLangProvider><Probe /></PublicLangProvider>);
    await userEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("label").textContent).toBe("Download image");
    expect(localStorage.getItem(PUBLIC_LANG_STORAGE_KEY)).toBe("en");
  });

  it("uses a storage key distinct from the admin lang key", () => {
    expect(PUBLIC_LANG_STORAGE_KEY).not.toBe(ADMIN_LANG_STORAGE_KEY);
  });

  it("restores a previously saved language on mount", () => {
    localStorage.setItem(PUBLIC_LANG_STORAGE_KEY, "en");
    render(<PublicLangProvider><Probe /></PublicLangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("falls back to the key itself when a translation is missing", () => {
    function MissingKeyProbe() {
      const { t } = usePublicLang();
      // @ts-expect-error - deliberately testing an unknown key at runtime
      return <span data-testid="missing">{t("thisKeyDoesNotExist")}</span>;
    }
    render(<PublicLangProvider><MissingKeyProbe /></PublicLangProvider>);
    expect(screen.getByTestId("missing").textContent).toBe("thisKeyDoesNotExist");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/public-i18n.test.tsx`
Expected: FAIL — `Cannot find module '../../src/lib/public-i18n'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/lib/public-i18n.tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const PUBLIC_LANG_STORAGE_KEY = "afp_public_lang";

const PUBLIC_DICT = {
  vi: {
    heroTitle: "Chọn chiến dịch đang diễn ra",
    heroSubtitle: "Các chiến dịch avatar đang mở — chọn một chiến dịch để bắt đầu.",
    noCampaignsTitle: "Chưa có chiến dịch nào đang mở",
    notReadyHint: "Chưa có khung ảnh, vui lòng quay lại sau.",
    statusActive: "Đang diễn ra",
    campaignNotReady: "Chiến dịch này đang được chuẩn bị khung ảnh, chưa thể tạo avatar. Vui lòng quay lại sau.",
    backHome: "← Trang chủ",
    stepUpload: "1. Tải ảnh của bạn",
    stepUploadHint: "Chọn một ảnh chân dung rõ mặt, định dạng JPG hoặc PNG, tối đa 10MB.",
    dropTitle: "Kéo & thả ảnh vào đây",
    dropSub: "hoặc bấm để chọn tệp từ máy tính",
    changePhoto: "Đổi ảnh khác",
    stepTemplate: "2. Chọn khung",
    stepOverlay: "3. Điền thông tin",
    previewTitle: "Xem trước",
    previewNote: "Bản xem trước dựng trực tiếp trên trình duyệt của bạn. Ảnh chính thức được máy chủ ghép lại từ ảnh gốc trước khi tải xuống.",
    downloadButton: "Tải ảnh về máy",
    shareTitle: "Chia sẻ lên",
    zoomHint: "Kéo ảnh để di chuyển, dùng thanh trượt để phóng to/thu nhỏ",
    warnTitle: "Chưa thể tải ảnh xuống",
    warnMissingPhoto: "Bạn chưa hoàn thành Bước 1 — Tải ảnh lên.",
    warnIncompleteFields: "Bạn chưa điền đầy đủ thông tin ở Bước 3.",
    closedNotice: "Chiến dịch này đã kết thúc. Hẹn gặp lại ở chiến dịch tiếp theo!",
    errorGeneric: "Đã xảy ra lỗi khi thực hiện thao tác. Vui lòng thử lại.",
    notifTitle: "Thông báo",
    notifEmpty: "Chưa có thông báo nào.",
    notifMarkAllRead: "Đánh dấu đã đọc",
    notifJustNow: "Vừa xong",
    notifMinAgo: "phút trước",
    notifHourAgo: "giờ trước",
  },
  en: {
    heroTitle: "Choose a running campaign",
    heroSubtitle: "These avatar campaigns are open now — pick one to get started.",
    noCampaignsTitle: "No campaigns are open right now",
    notReadyHint: "No frames yet, please check back later.",
    statusActive: "Live now",
    campaignNotReady: "This campaign is still being set up with frames and isn't ready yet. Please check back soon.",
    backHome: "← Home",
    stepUpload: "1. Upload your photo",
    stepUploadHint: "Choose a clear portrait photo, JPG or PNG, up to 10MB.",
    dropTitle: "Drag & drop your photo",
    dropSub: "or click to browse your computer",
    changePhoto: "Change photo",
    stepTemplate: "2. Choose a frame",
    stepOverlay: "3. Fill in your info",
    previewTitle: "Preview",
    previewNote: "This preview is rendered locally in your browser. The final image is composited server-side from your original photo before download.",
    downloadButton: "Download image",
    shareTitle: "Share to",
    zoomHint: "Drag to reposition, use the slider to zoom in/out",
    warnTitle: "Can't download yet",
    warnMissingPhoto: "You haven't completed Step 1 — Upload a photo.",
    warnIncompleteFields: "You haven't filled in all Step 3 fields yet.",
    closedNotice: "This campaign has ended. See you at the next one!",
    errorGeneric: "Something went wrong. Please try again.",
    notifTitle: "Notifications",
    notifEmpty: "No notifications yet.",
    notifMarkAllRead: "Mark all read",
    notifJustNow: "Just now",
    notifMinAgo: "min ago",
    notifHourAgo: "hr ago",
  },
} as const;

export type PublicLang = "vi" | "en";
export type PublicDictKey = keyof typeof PUBLIC_DICT["vi"];

interface PublicLangContextValue {
  lang: PublicLang;
  setLang: (lang: PublicLang) => void;
  t: (key: PublicDictKey | string) => string;
}

const PublicLangContext = createContext<PublicLangContextValue | null>(null);

function loadSavedLang(): PublicLang {
  try {
    const saved = localStorage.getItem(PUBLIC_LANG_STORAGE_KEY);
    return saved === "vi" || saved === "en" ? saved : "vi";
  } catch {
    return "vi";
  }
}

export function PublicLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<PublicLang>("vi");

  useEffect(() => {
    setLangState(loadSavedLang());
  }, []);

  const setLang = useCallback((next: PublicLang) => {
    setLangState(next);
    try {
      localStorage.setItem(PUBLIC_LANG_STORAGE_KEY, next);
    } catch {
      // storage unavailable — language choice just won't persist across reloads
    }
  }, []);

  const t = useCallback(
    (key: PublicDictKey | string) => (PUBLIC_DICT[lang] as Record<string, string>)[key] ?? key,
    [lang],
  );

  return <PublicLangContext.Provider value={{ lang, setLang, t }}>{children}</PublicLangContext.Provider>;
}

export function usePublicLang(): PublicLangContextValue {
  const ctx = useContext(PublicLangContext);
  if (!ctx) throw new Error("usePublicLang must be used within PublicLangProvider");
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/public-i18n.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/public-i18n.tsx tests/lib/public-i18n.test.tsx
git commit -m "feat(public): add public-only VI/EN i18n provider"
```

---

## Task 2: Extend `renderPreview` with pan/zoom transform

**Files:**
- Modify: `src/lib/compositing/browser-compositor.ts`
- Modify: `tests/lib/compositing/browser-compositor.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `renderPreview(canvas, frameImg, photoImg, photoArea, overlays, overlayValues, transform?: { scale: number; ox: number; oy: number })` — `transform` is optional, defaults to `{ scale: 1, ox: 0, oy: 0 }`. Later tasks (AvatarCreator) pass the visitor's live drag/zoom state here.

- [ ] **Step 1: Write the failing test**

Replace the full content of `tests/lib/compositing/browser-compositor.test.ts`:

```ts
// tests/lib/compositing/browser-compositor.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderPreview } from "../../../src/lib/compositing/browser-compositor";

function fakeCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillStyle: "",
    font: "",
  };
  return { canvas: { width: 200, height: 200, getContext: () => ctx }, ctx };
}

describe("renderPreview", () => {
  it("draws the photo cover-fit into photoArea (identity transform, photo already matches box size), then the frame, then each overlay with a value", async () => {
    const { canvas, ctx } = fakeCanvas();
    const frameImg = {} as HTMLImageElement;
    const photoImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

    await renderPreview(
      canvas as any, frameImg, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 90, fontSize: 16, color: "#fff" }],
      { slogan: "Dream Big" },
    );

    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, photoImg, 0, 0, 100, 100);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, frameImg, 0, 0, 200, 200);
    expect(ctx.fillText).toHaveBeenCalledWith("Dream Big", 100, 180);
  });

  it("draws no text when overlayValues has no matching value", async () => {
    const { canvas, ctx } = fakeCanvas();

    await renderPreview(
      canvas as any, {} as HTMLImageElement, { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement,
      { x: 0, y: 0, w: 50, h: 50 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 90, fontSize: 16, color: "#fff" }],
      {},
    );

    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("zooms the photo around the photoArea center when scale > 1, with identity pan", async () => {
    const { canvas, ctx } = fakeCanvas();
    const photoImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

    await renderPreview(
      canvas as any, {} as HTMLImageElement, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [], {},
      { scale: 2, ox: 0, oy: 0 },
    );

    // photoArea box is 100x100 (50% of 200); at scale 2 the drawn image is 200x200,
    // centered on the box: dx = 0 + (100-200)/2 = -50, dy = -50.
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, photoImg, -50, -50, 200, 200);
  });

  it("pans the photo by ox/oy as a fraction of the photoArea box size", async () => {
    const { canvas, ctx } = fakeCanvas();
    const photoImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

    await renderPreview(
      canvas as any, {} as HTMLImageElement, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [], {},
      { scale: 1, ox: 0.1, oy: -0.2 },
    );

    // box is 100x100; ox 0.1 -> +10px, oy -0.2 -> -20px, on top of the identity dx/dy of 0,0.
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, photoImg, 10, -20, 100, 100);
  });

  it("clips the photo to the photoArea rectangle before drawing it", async () => {
    const { canvas, ctx } = fakeCanvas();
    const photoImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

    await renderPreview(
      canvas as any, {} as HTMLImageElement, photoImg,
      { x: 10, y: 20, w: 50, h: 50 },
      [], {},
    );

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.rect).toHaveBeenCalledWith(20, 40, 100, 100);
    expect(ctx.clip).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/compositing/browser-compositor.test.ts`
Expected: FAIL — old `renderPreview` stretches the photo to fill the box exactly (no cover-fit math), so the new assertions on `dx`/`dy`/clip calls fail; `ctx.save`/`rect`/`clip`/`restore` are never called by the current implementation.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/compositing/browser-compositor.ts
import { resolveOverlayDraws, type TextOverlay } from "./overlay-layout";

export interface PhotoTransform {
  scale: number;
  ox: number;
  oy: number;
}

const IDENTITY_TRANSFORM: PhotoTransform = { scale: 1, ox: 0, oy: 0 };

export async function renderPreview(
  canvas: HTMLCanvasElement,
  frameImg: HTMLImageElement,
  photoImg: HTMLImageElement,
  photoArea: { x: number; y: number; w: number; h: number },
  overlays: TextOverlay[],
  overlayValues: Record<string, string>,
  transform: PhotoTransform = IDENTITY_TRANSFORM,
): Promise<void> {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const px = (photoArea.x / 100) * canvas.width;
  const py = (photoArea.y / 100) * canvas.height;
  const pw = (photoArea.w / 100) * canvas.width;
  const ph = (photoArea.h / 100) * canvas.height;

  const coverScale = Math.max(pw / photoImg.naturalWidth, ph / photoImg.naturalHeight) * transform.scale;
  const drawW = photoImg.naturalWidth * coverScale;
  const drawH = photoImg.naturalHeight * coverScale;
  const dx = px + (pw - drawW) / 2 + transform.ox * pw;
  const dy = py + (ph - drawH) / 2 + transform.oy * ph;

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ctx.drawImage(photoImg, dx, dy, drawW, drawH);
  ctx.restore();

  ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

  const draws = resolveOverlayDraws(overlays, overlayValues, canvas.width, canvas.height);
  for (const draw of draws) {
    ctx.fillStyle = draw.color;
    ctx.font = `${draw.fontSize}px sans-serif`;
    ctx.fillText(draw.text, draw.x, draw.y);
  }
}
```

Note the frame draw call gained explicit `canvas.width, canvas.height` arguments (previously `drawImage(frameImg, 0, 0)`, which draws the frame at its own natural size — harmless when the frame PNG is already exactly 1080×1080, but explicit sizing here makes the canvas fill correct regardless of the source PNG's natural dimensions, and matches what the second test assertion now expects).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/compositing/browser-compositor.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/compositing/browser-compositor.ts tests/lib/compositing/browser-compositor.test.ts
git commit -m "feat(public): add pan/zoom transform support to renderPreview"
```

---

## Task 3: Route group + public header (logo + lang toggle)

**Files:**
- Move: `src/app/page.tsx` → `src/app/(public)/page.tsx` (content unchanged in this task)
- Move: `src/app/c/[slug]/page.tsx` → `src/app/(public)/c/[slug]/page.tsx` (content unchanged in this task)
- Move: `src/app/c/[slug]/campaign-compositor.tsx` → `src/app/(public)/c/[slug]/campaign-compositor.tsx` (content unchanged in this task; renamed to `avatar-creator.tsx` in Task 8, not this one)
- Create: `src/app/(public)/layout.tsx`
- Create: `src/components/public-header.tsx`
- Modify: `tests/app/home-page.test.tsx` (import path only)
- Modify: `tests/app/c-slug-page.test.tsx` (import path only)
- Test: `tests/components/public-header.test.tsx` (new)

**Interfaces:**
- Consumes: `PublicLangProvider`, `usePublicLang` from `src/lib/public-i18n.tsx` (Task 1).
- Produces: `PublicHeader()` component — no notification bell yet (added in Task 7, which modifies this file).

- [ ] **Step 1: Move the files**

```bash
mkdir -p "src/app/(public)/c/[slug]"
git mv src/app/page.tsx "src/app/(public)/page.tsx"
git mv src/app/c/[slug]/page.tsx "src/app/(public)/c/[slug]/page.tsx"
git mv src/app/c/[slug]/campaign-compositor.tsx "src/app/(public)/c/[slug]/campaign-compositor.tsx"
```

If `mkdir -p` with the literal `[slug]` path doesn't work in your shell (bracket globbing), create the directory with your file tool instead, then use `git mv` for each file individually. Verify `src/app/c/` is now empty and remove it if so — Next.js route groups do not change the URL, so `/` and `/c/[slug]` continue to resolve exactly as before.

- [ ] **Step 2: Write the failing tests**

Update `tests/app/home-page.test.tsx`'s import line:

```tsx
import HomePage from "../../src/app/(public)/page";
```

Update `tests/app/c-slug-page.test.tsx`'s import line:

```tsx
import CampaignPage from "../../src/app/(public)/c/[slug]/page";
```

Create `tests/components/public-header.test.tsx`:

```tsx
// tests/components/public-header.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PublicHeader } from "../../src/components/public-header";
import { PublicLangProvider } from "../../src/lib/public-i18n";

afterEach(() => cleanup());

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

  it("does not render a logout button or any admin identity", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/app/home-page.test.tsx tests/app/c-slug-page.test.tsx tests/components/public-header.test.tsx`
Expected: FAIL — `home-page.test.tsx`/`c-slug-page.test.tsx` fail because the files haven't moved yet if Step 1 wasn't done first (do Step 1 before running this); `public-header.test.tsx` fails with `Cannot find module '../../src/components/public-header'`.

- [ ] **Step 4: Write the implementation**

```tsx
// src/components/public-header.tsx
"use client";

import Image from "next/image";
import { usePublicLang, type PublicLang } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";

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
          {code}
        </button>
      ))}
    </div>
  );
}

export function PublicHeader() {
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
      </div>
    </header>
  );
}
```

```tsx
// src/app/(public)/layout.tsx
import { PublicLangProvider } from "@/lib/public-i18n";
import { PublicHeader } from "@/components/public-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicLangProvider>
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1">{children}</main>
      </div>
    </PublicLangProvider>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/app/home-page.test.tsx tests/app/c-slug-page.test.tsx tests/components/public-header.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)" src/components/public-header.tsx tests/app/home-page.test.tsx tests/app/c-slug-page.test.tsx tests/components/public-header.test.tsx
git status --short  # confirm src/app/page.tsx, src/app/c/ no longer appear as tracked paths outside (public)/
git commit -m "feat(public): move public pages into a (public) route group, add PublicHeader"
```

---

## Task 4: Bilingual home page cards

**Files:**
- Modify: `src/app/campaigns-client.ts`
- Modify: `src/app/(public)/page.tsx`
- Create: `src/app/(public)/campaign-cards.tsx`
- Modify: `tests/app/home-page.test.tsx`

**Interfaces:**
- Consumes: `usePublicLang` (Task 1), `pickLocalized` from `src/lib/localized-content.ts` (existing, already used by the admin campaigns page).
- Produces: `CampaignCards({ campaigns }: { campaigns: Campaign[] })` — client component consumed only by `(public)/page.tsx`.

- [ ] **Step 1: Write the failing tests**

Replace the full content of `tests/app/home-page.test.tsx`:

```tsx
// tests/app/home-page.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import HomePage from "../../src/app/(public)/page";

beforeEach(() => {
  localStorage.clear();
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

    render(await HomePage());

    await waitFor(() => expect(screen.getByText("FPT turns 38")).toBeTruthy());
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Create now")).toBeTruthy();
  });
});
```

Note: this test file's earlier version rendered `HomePage()` standalone without a `PublicLangProvider` wrapper — but `CampaignCards` (this task) calls `usePublicLang()`, which throws without a provider. `HomePage` is a server component and cannot itself render a provider around client-interactive state in a way `render()` from Testing Library would pick up — so `CampaignCards` must import and use `PublicLangProvider` internally, wrapping its own returned JSX, rather than relying on `(public)/layout.tsx` (which server-rendered tests never mount). Design `CampaignCards` accordingly (see Step 3).

The EN test above cannot click a lang-toggle button — `CampaignCards` has no toggle UI of its own (that lives only in `PublicHeader`, a sibling component this render tree never mounts). Instead it pre-seeds `localStorage` with the saved-language key `PublicLangProvider` reads on mount (same mechanism already covered by Task 1's "restores a previously saved language on mount" test), and waits for the effect that loads it to flush. Add `import { waitFor } from "@testing-library/react";` to this file's existing Testing Library import line, and drop the `userEvent` import if this task's edits leave it otherwise unused (check the file's other tests before removing it — Tasks in this plan only ever added tests to this file, never removed `userEvent` usage elsewhere, so confirm by search before deleting the import).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/home-page.test.tsx`
Expected: FAIL — `Cannot find module '../../src/app/(public)/campaign-cards'` once `(public)/page.tsx` is updated to import it (or, before that edit, the EN-toggle test fails because no lang toggle button exists on the page yet).

- [ ] **Step 3: Write the implementation**

Modify `src/app/campaigns-client.ts`:

```ts
// src/app/campaigns-client.ts
import { getBaseUrl } from "@/lib/base-url";

export interface Campaign {
  slug: string;
  status: string;
  startDate: string;
  endDate: string;
  displayConfig: {
    title: string;
    titleEn?: string;
    description: string;
    descriptionEn?: string;
    ctaLabel: string;
    ctaEn?: string;
    badge?: string;
  };
  language: "vi" | "en";
  _count: { templates: number };
}

export async function fetchActiveCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns`, { cache: "no-store" });
  return res.json();
}
```

Create `src/app/(public)/campaign-cards.tsx`:

```tsx
// src/app/(public)/campaign-cards.tsx
"use client";

import Link from "next/link";
import { PublicLangProvider, usePublicLang } from "@/lib/public-i18n";
import { pickLocalized } from "@/lib/localized-content";
import type { Campaign } from "@/app/campaigns-client";

function CampaignGrid({ campaigns }: { campaigns: Campaign[] }) {
  const { lang, t } = usePublicLang();

  if (campaigns.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center p-6 text-center text-muted-foreground">
        {t("noCampaignsTitle")}
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map(c => {
        const notReady = c._count.templates === 0;
        const title = pickLocalized(c.displayConfig, "title", lang);
        const description = pickLocalized(c.displayConfig, "description", lang);
        const ctaLabel = pickLocalized(c.displayConfig, "ctaLabel", lang);
        const cardClassName = "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md";
        const cardBody = (
          <>
            <div className="relative aspect-video bg-gradient-to-br from-primary/25 via-primary/10 to-secondary/15">
              <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-[11.5px] font-bold text-emerald-700 shadow-sm">
                {t("statusActive")}
              </span>
              {c.displayConfig.badge && (
                <span className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-[11.5px] font-bold text-primary-foreground shadow-sm">
                  {c.displayConfig.badge}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-5">
              <div className="text-lg font-bold">{title}</div>
              <div className="flex-1 text-[13.5px] leading-relaxed text-muted-foreground">
                {description}
              </div>
              <div className="tabular-nums text-xs text-muted-foreground">
                {c.startDate.slice(0, 10)} – {c.endDate.slice(0, 10)}
              </div>
              {notReady && (
                <div className="text-xs italic text-muted-foreground">{t("notReadyHint")}</div>
              )}
              <span
                className={
                  notReady
                    ? "mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background opacity-50"
                    : "mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity group-hover:opacity-90"
                }
              >
                {ctaLabel}
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

export function CampaignCards({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <PublicLangProvider>
      <CampaignGrid campaigns={campaigns} />
    </PublicLangProvider>
  );
}
```

Wrapping `PublicLangProvider` a second time here (it's already provided by `(public)/layout.tsx` in the real app tree) is intentional and harmless — `usePublicLang()` reads whichever provider is nearest, so in production this inner provider is redundant but inert (same default state, same localStorage key, no conflict), and it's what makes this component's own unit tests self-contained without needing to also mount the layout. **This is a deliberate exception** to "don't wrap twice" — required because `HomePage` is an async server component that Testing Library's `render(await HomePage())` cannot wrap with a client provider from the test file itself.

Modify `src/app/(public)/page.tsx`:

```tsx
// src/app/(public)/page.tsx
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/home-page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns-client.ts "src/app/(public)/page.tsx" "src/app/(public)/campaign-cards.tsx" tests/app/home-page.test.tsx
git commit -m "feat(public): show bilingual campaign cards on the home page"
```

---

## Task 5: Fix `frameImageUrl` on the public campaign API route

**Files:**
- Modify: `src/app/api/campaigns/[slug]/route.ts`
- Test: `tests/app/api/public-campaign-slug.test.ts` (new — check for an existing test file for this route first; if `tests/app/api/campaigns-slug.test.ts` or similar already exists, extend that instead of creating a new one)

**Interfaces:**
- Consumes: `getStorage()` from `@/lib/storage` (existing, already used by admin routes and the `POST /generate` route).
- Produces: `GET /api/campaigns/[slug]` response now includes `frameImageUrl` per template — consumed by Task 8's `AvatarCreator`.

- [ ] **Step 1: Write the failing test**

First check: `ls tests/app/api/ | grep -i campaign` to see if a test for this route already exists. If one exists, add the new test case to it instead of creating a new file. Otherwise create `tests/app/api/public-campaign-slug.test.ts`:

```ts
/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { campaign: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ getPublicUrl: (key: string) => `http://storage/${key}` }),
}));

import { GET } from "../../../src/app/api/campaigns/[slug]/route";

beforeEach(() => {
  findUniqueMock.mockReset();
});

describe("GET /api/campaigns/[slug]", () => {
  it("includes frameImageUrl for each template", async () => {
    findUniqueMock.mockResolvedValue({
      slug: "fpt38",
      status: "active",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      templates: [{ id: "t1", frameImageKey: "frames/fpt38-orange.png" }],
    });

    const res = await GET(new Request("http://x"), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(body.templates[0].frameImageUrl).toBe("http://storage/frames/fpt38-orange.png");
  });

  it("returns 404 when the campaign is not publicly visible", async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await GET(new Request("http://x"), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/public-campaign-slug.test.ts`
Expected: FAIL — `body.templates[0].frameImageUrl` is `undefined` (current route returns the raw Prisma result with only `frameImageKey`).

- [ ] **Step 3: Write the implementation**

```ts
// src/app/api/campaigns/[slug]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { isCampaignPubliclyVisible } from "@/lib/campaign-visibility";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: params.slug },
    include: { templates: true },
  });

  if (!campaign || !isCampaignPubliclyVisible(campaign)) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const storage = getStorage();
  const templates = campaign.templates.map(t => ({
    ...t,
    frameImageUrl: storage.getPublicUrl(t.frameImageKey),
  }));

  return NextResponse.json({ ...campaign, templates });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/public-campaign-slug.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[slug]/route.ts tests/app/api/public-campaign-slug.test.ts
git commit -m "fix(public): include frameImageUrl in the public campaign API response"
```

---

## Task 6: Public notifications API route

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Test: `tests/app/api/public-notifications.test.ts`

**Interfaces:**
- Consumes: `prisma.notification` (existing model, unchanged).
- Produces: `GET /api/notifications` — public, unauthenticated, returns only `type` in `["campaign-create", "campaign-update", "campaign-delete"]`, no DELETE/PATCH exported. Consumed by Task 7's `PublicNotificationBell`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/api/public-notifications.test.ts
/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { notification: { findMany: (...args: unknown[]) => findManyMock(...args) } },
}));

import * as route from "../../../src/app/api/notifications/route";

beforeEach(() => {
  findManyMock.mockReset();
});

describe("GET /api/notifications", () => {
  it("queries only campaign create/update/delete types, newest first, capped at 50", async () => {
    findManyMock.mockResolvedValue([{ id: "n1", type: "campaign-create", message: "x", read: false, createdAt: new Date() }]);

    const res = await route.GET();
    const body = await res.json();

    expect(findManyMock).toHaveBeenCalledWith({
      where: { type: { in: ["campaign-create", "campaign-update", "campaign-delete"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    expect(body).toHaveLength(1);
  });

  it("requires no authentication (no requireAdmin call in the module)", () => {
    expect(route).not.toHaveProperty("DELETE");
    expect(route).not.toHaveProperty("PATCH");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/public-notifications.test.ts`
Expected: FAIL — `Cannot find module '../../../src/app/api/notifications/route'`

- [ ] **Step 3: Write the implementation**

```ts
// src/app/api/notifications/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PUBLIC_NOTIFICATION_TYPES = ["campaign-create", "campaign-update", "campaign-delete"] as const;

export async function GET() {
  const notifications = await prisma.notification.findMany({
    where: { type: { in: [...PUBLIC_NOTIFICATION_TYPES] } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(notifications);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/public-notifications.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/route.ts tests/app/api/public-notifications.test.ts
git commit -m "feat(public): add read-only public notifications API, filtered to campaign lifecycle events"
```

---

## Task 7: Public notification bell (localStorage read-state)

**Files:**
- Create: `src/components/public-notification-bell.tsx`
- Modify: `src/components/public-header.tsx`
- Test: `tests/components/public-notification-bell.test.tsx`
- Modify: `tests/components/public-header.test.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications` (Task 6); `usePublicLang` (Task 1).
- Produces: `PublicNotificationBell()` — mounted inside `PublicHeader`, no props.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/components/public-notification-bell.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicNotificationBell } from "../../src/components/public-notification-bell";
import { PublicLangProvider } from "../../src/lib/public-i18n";

function renderBell() {
  return render(
    <PublicLangProvider>
      <PublicNotificationBell />
    </PublicLangProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PublicNotificationBell", () => {
  it("fetches from /api/notifications (not the admin endpoint)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    renderBell();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/notifications"));
  });

  it("shows an unread badge for notifications not yet in the local seen list", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "n1", message: "Đã tạo campaign mới \"FPT 38\".", type: "campaign-create", read: false, createdAt: new Date().toISOString() }],
    });
    renderBell();
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
  });

  it("marking all read stores seen ids in localStorage and clears the badge, without calling any other endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "n1", message: "Đã tạo campaign mới \"FPT 38\".", type: "campaign-create", read: false, createdAt: new Date().toISOString() }],
    });
    renderBell();
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Thông báo" }));
    await userEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc" }));

    expect(JSON.parse(localStorage.getItem("afp_public_seen_notifications") ?? "[]")).toContain("n1");
    expect(screen.queryByText("1")).toBeNull();
    // Only ever the one GET call — never a mark-all-read or DELETE call.
    expect((global.fetch as any).mock.calls.every((c: any[]) => c[0] === "/api/notifications" && (!c[1] || c[1].method === undefined))).toBe(true);
  });

  it("does not render a delete-all button", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: "Thông báo" }));
    expect(screen.queryByRole("button", { name: /xoá tất cả/i })).toBeNull();
  });
});
```

Append to `tests/components/public-header.test.tsx`:

```tsx
  it("renders the public notification bell", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Thông báo" })).toBeTruthy();
  });
```

This new assertion needs `global.fetch` mocked before `renderHeader()` runs (the bell fetches on mount) — add at the top of the file, inside a `beforeEach`:

```tsx
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});
```

(add the matching `import { vi, beforeEach } from "vitest";` names if not already imported in that file — check its current import line and extend it rather than duplicating).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/public-notification-bell.test.tsx tests/components/public-header.test.tsx`
Expected: FAIL — `Cannot find module '../../src/components/public-notification-bell'`; header test fails on missing "Thông báo" button.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/public-notification-bell.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePublicLang } from "@/lib/public-i18n";

interface PublicNotificationItem {
  id: string;
  message: string;
  type: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30000;
const SEEN_STORAGE_KEY = "afp_public_seen_notifications";
const MAX_SEEN_IDS = 200;

function iconForType(type: string) {
  if (type === "campaign-create") return { Icon: Plus, className: "bg-blue-600/10 text-blue-600" };
  if (type === "campaign-delete") return { Icon: Trash2, className: "bg-red-600/10 text-red-600" };
  return { Icon: Pencil, className: "bg-orange-600/10 text-orange-600" };
}

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    const trimmed = Array.from(ids).slice(-MAX_SEEN_IDS);
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage unavailable — read state just won't persist across reloads
  }
}

function formatRelativeTime(iso: string, t: (key: string) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("notifJustNow");
  if (min < 60) return `${min} ${t("notifMinAgo")}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${t("notifHourAgo")}`;
  return new Date(iso).toLocaleString();
}

export function PublicNotificationBell() {
  const { t } = usePublicLang();
  const [items, setItems] = useState<PublicNotificationItem[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => (typeof window !== "undefined" ? loadSeenIds() : new Set()));
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch("/api/notifications")
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

  const unreadCount = items.filter(i => !seenIds.has(i.id)).length;
  const hasItems = items.length > 0;

  function markAllRead() {
    const next = new Set(seenIds);
    items.forEach(i => next.add(i.id));
    saveSeenIds(next);
    setSeenIds(next);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t("notifTitle")}
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
            <span className="text-xs font-bold text-muted-foreground">{t("notifTitle")}</span>
            {hasItems && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-primary hover:underline">
                {t("notifMarkAllRead")}
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-auto">
            {!hasItems && (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t("notifEmpty")}</div>
            )}
            {items.map(item => {
              const { Icon, className } = iconForType(item.type);
              return (
                <div
                  key={item.id}
                  className={cn("flex items-start gap-2 rounded-lg px-2 py-2 text-sm", !seenIds.has(item.id) && "bg-muted/50")}
                >
                  <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", className)}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="flex-1">
                    <div>{item.message}</div>
                    <div className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt, t)}</div>
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

Modify `src/components/public-header.tsx` — add the import and mount the bell next to the lang toggle:

```tsx
// add to imports
import { PublicNotificationBell } from "@/components/public-notification-bell";

// change the actions div to:
      <div className="flex items-center gap-3">
        <LangToggle />
        <PublicNotificationBell />
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/public-notification-bell.test.tsx tests/components/public-header.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/public-notification-bell.tsx src/components/public-header.tsx tests/components/public-notification-bell.test.tsx tests/components/public-header.test.tsx
git commit -m "feat(public): add public notification bell with localStorage-only read state"
```

---

## Task 8: `AvatarCreator` — upload, template picker, drag/zoom, live preview, Step 3 fields

**Files:**
- Create: `src/app/(public)/c/[slug]/avatar-creator.tsx` (replaces `campaign-compositor.tsx`)
- Delete: `src/app/(public)/c/[slug]/campaign-compositor.tsx`
- Modify: `src/app/(public)/c/[slug]/page.tsx`
- Test: `tests/app/avatar-creator.test.tsx` (new — replaces the "renders the compositor" coverage that lived in `c-slug-page.test.tsx`)
- Modify: `tests/app/c-slug-page.test.tsx`

**Interfaces:**
- Consumes: `renderPreview` with `PhotoTransform` (Task 2); `frameImageUrl` on templates (Task 5); `TextOverlay` from `@/lib/compositing/overlay-layout` (existing); `usePublicLang` (Task 1).
- Produces: `AvatarCreator({ slug, templates }: { slug: string; templates: Template[] })`, `interface Template { id: string; name: string; frameImageUrl: string; overlayConfig: { photoArea: {...}; textOverlays: TextOverlay[] } }` — Task 9 (real download) and Task 10 (share) both modify this same file to add functionality on top of what this task builds.

This task delivers Steps 1–3 of the flow, the live canvas preview with working drag/zoom, and client-side validation state — but the download button stays a disabled placeholder wired to nothing yet (Task 9 connects it to the real API). This keeps the task reviewable on its own: every visual/interactive piece is testable without needing the network call.

- [ ] **Step 1: Write the failing tests**

Replace the full content of `tests/app/c-slug-page.test.tsx`:

```tsx
// tests/app/c-slug-page.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CampaignPage from "../../src/app/(public)/c/[slug]/page";

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

    expect(screen.getByText("Khung cam")).toBeTruthy();
  });
});
```

Create `tests/app/avatar-creator.test.tsx`:

```tsx
// tests/app/avatar-creator.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicLangProvider } from "../../src/lib/public-i18n";
import { AvatarCreator, type Template } from "../../src/app/(public)/c/[slug]/avatar-creator";

afterEach(() => {
  cleanup();
});

const templates: Template[] = [
  {
    id: "t1",
    name: "Khung cam",
    frameImageUrl: "http://storage/frames/orange.png",
    overlayConfig: {
      photoArea: { x: 10, y: 10, w: 60, h: 60 },
      textOverlays: [
        { key: "slogan", label: "Câu châm ngôn", labelEn: "Slogan", type: "text", placeholder: "VD: Dream Big", x: 50, y: 90, fontSize: 20, color: "#fff" },
        { key: "unit", label: "Đơn vị", labelEn: "Unit", type: "select", options: ["FPT Software", "FPT Telecom"], x: 50, y: 70, fontSize: 20, color: "#fff" },
      ],
    },
  },
];

function renderCreator(tpls: Template[] = templates) {
  return render(
    <PublicLangProvider>
      <AvatarCreator slug="fpt38" templates={tpls} />
    </PublicLangProvider>,
  );
}

describe("AvatarCreator", () => {
  it("shows the frame name and step labels", () => {
    renderCreator();
    expect(screen.getByText("Khung cam")).toBeTruthy();
    expect(screen.getByText("1. Tải ảnh của bạn")).toBeTruthy();
    expect(screen.getByText("2. Chọn khung")).toBeTruthy();
    expect(screen.getByText("3. Điền thông tin")).toBeTruthy();
  });

  it("renders a text input for a text overlay and a select for a select overlay, using the template's first frame by default", () => {
    renderCreator();
    expect(screen.getByLabelText("Câu châm ngôn")).toBeTruthy();
    const unitSelect = screen.getByLabelText("Đơn vị") as HTMLSelectElement;
    expect(Array.from(unitSelect.options).map(o => o.value)).toEqual(["FPT Software", "FPT Telecom"]);
  });

  it("disables the download button until a photo is uploaded and all overlay fields are filled", async () => {
    renderCreator();
    const downloadBtn = screen.getByRole("button", { name: "Tải ảnh về máy" });
    expect(downloadBtn).toBeDisabled();

    const file = new File(["photo-bytes"], "me.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    expect(downloadBtn).toBeDisabled(); // overlay fields still empty

    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");

    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
  });

  it("rejects a photo over 10MB with a visible warning and does not stage it", async () => {
    renderCreator();
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), oversized);

    expect(screen.getByRole("alert").textContent).toMatch(/10MB/);
    expect(screen.getByRole("button", { name: "Tải ảnh về máy" })).toBeDisabled();
  });

  it("switches the selected frame and resets its overlay field values when a second template is chosen", async () => {
    const second: Template = {
      id: "t2",
      name: "Khung xanh",
      frameImageUrl: "http://storage/frames/blue.png",
      overlayConfig: { photoArea: { x: 5, y: 5, w: 70, h: 70 }, textOverlays: [{ key: "name", label: "Tên", labelEn: "Name", type: "text", x: 50, y: 80, fontSize: 18, color: "#fff" }] },
    };
    renderCreator([...templates, second]);

    await userEvent.click(screen.getByText("Khung xanh"));

    expect(screen.getByLabelText("Tên")).toBeTruthy();
    expect(screen.queryByLabelText("Câu châm ngôn")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/c-slug-page.test.tsx tests/app/avatar-creator.test.tsx`
Expected: FAIL — `Cannot find module '.../avatar-creator'`; `c-slug-page.test.tsx` fails because `page.tsx` still imports `campaign-compositor`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/(public)/c/[slug]/avatar-creator.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { renderPreview } from "@/lib/compositing/browser-compositor";
import type { TextOverlay } from "@/lib/compositing/overlay-layout";
import { usePublicLang } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

export interface Template {
  id: string;
  name: string;
  frameImageUrl: string;
  overlayConfig: { photoArea: { x: number; y: number; w: number; h: number }; textOverlays: TextOverlay[] };
}

function clampPan(v: number): number {
  return Math.max(-0.45, Math.min(0.45, v));
}

export function AvatarCreator({ slug, templates }: { slug: string; templates: Template[] }) {
  const { t } = usePublicLang();
  const [selectedId, setSelectedId] = useState(templates[0].id);
  const [overlayValues, setOverlayValues] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoImg, setPhotoImg] = useState<HTMLImageElement | null>(null);
  const [frameImg, setFrameImg] = useState<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, ox: 0, oy: 0 });
  const [photoError, setPhotoError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOx: 0, startOy: 0 });

  const selected = templates.find(t => t.id === selectedId)!;

  function selectTemplate(id: string) {
    setSelectedId(id);
    setOverlayValues({});
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`Ảnh vượt quá 10MB, vui lòng chọn ảnh nhỏ hơn.`);
      setPhotoFile(null);
      e.target.value = "";
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
    setTransform({ scale: 1, ox: 0, oy: 0 });
  }

  useEffect(() => {
    if (!photoFile) {
      setPhotoImg(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    const img = new Image();
    img.onload = () => setPhotoImg(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setFrameImg(img);
    img.src = selected.frameImageUrl;
  }, [selected.frameImageUrl]);

  useEffect(() => {
    if (!canvasRef.current || !frameImg || !photoImg) return;
    renderPreview(canvasRef.current, frameImg, photoImg, selected.overlayConfig.photoArea, selected.overlayConfig.textOverlays, overlayValues, transform);
  }, [frameImg, photoImg, selected, overlayValues, transform]);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!photoImg) return;
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOx: transform.ox, startOy: transform.oy };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current.dragging || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const nx = clampPan(dragRef.current.startOx + (e.clientX - dragRef.current.startX) / rect.width);
    const ny = clampPan(dragRef.current.startOy + (e.clientY - dragRef.current.startY) / rect.height);
    setTransform(tr => ({ ...tr, ox: nx, oy: ny }));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current.dragging = false;
    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released — nothing to do
    }
  }

  const stepsComplete =
    !!photoFile &&
    selected.overlayConfig.textOverlays.every(o => !!(overlayValues[o.key] && overlayValues[o.key].trim()));

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 p-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-8">
        <div>
          <div className="mb-1 text-[15px] font-bold">{t("stepUpload")}</div>
          <div className="mb-3 text-[13px] text-muted-foreground">{t("stepUploadHint")}</div>
          {photoError && <p role="alert" className="mb-2 text-sm text-destructive">{photoError}</p>}
          <label htmlFor="photo-input" className="cursor-pointer">
            {photoFile ? (
              <div className="flex items-center gap-3">
                <img src={URL.createObjectURL(photoFile)} alt="" className="size-20 rounded-full border border-border object-cover" />
                <span className="text-sm font-semibold text-primary">{t("changePhoto")}</span>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border bg-muted/40 p-8 text-center">
                <div className="mb-1 text-sm font-bold">{t("dropTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("dropSub")}</div>
              </div>
            )}
          </label>
          <input id="photo-input" aria-label={t("stepUpload")} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoChange} />
        </div>

        <div>
          <div className="mb-3 text-[15px] font-bold">{t("stepTemplate")}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => selectTemplate(tpl.id)}
                className={cn(
                  "flex flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition-colors",
                  selectedId === tpl.id ? "border-primary" : "border-border hover:border-primary/50",
                )}
              >
                <div className="relative aspect-square bg-[repeating-conic-gradient(#eef1f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                  <img src={tpl.frameImageUrl} alt="" className="h-full w-full object-contain" />
                </div>
                <div className="truncate p-2 text-center text-xs font-semibold">{tpl.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 text-[15px] font-bold">{t("stepOverlay")}</div>
          <div className="flex flex-col gap-3">
            {selected.overlayConfig.textOverlays.map(overlay => (
              <div key={overlay.key} className="space-y-1">
                <label htmlFor={`overlay-${overlay.key}`} className="text-xs font-semibold text-muted-foreground">
                  {overlay.label}
                </label>
                {overlay.type === "select" ? (
                  <select
                    id={`overlay-${overlay.key}`}
                    value={overlayValues[overlay.key] ?? ""}
                    onChange={e => setOverlayValues(v => ({ ...v, [overlay.key]: e.target.value }))}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  >
                    <option value="" disabled>—</option>
                    {(overlay.options ?? []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`overlay-${overlay.key}`}
                    value={overlayValues[overlay.key] ?? ""}
                    placeholder={overlay.placeholder}
                    onChange={e => setOverlayValues(v => ({ ...v, [overlay.key]: e.target.value }))}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 text-[15px] font-bold">{t("previewTitle")}</div>
        <div ref={stageRef} className="relative mb-2 aspect-square overflow-hidden rounded-xl" style={{ boxShadow: "inset 0 0 0 1px rgba(16,30,46,.16)" }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={800}
            className="h-full w-full touch-none"
            style={{ cursor: photoImg ? "grab" : "default" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>
        {photoImg && (
          <div className="mb-3 flex items-center gap-2">
            <button type="button" onClick={() => setTransform(tr => ({ ...tr, scale: Math.max(MIN_ZOOM, +(tr.scale - ZOOM_STEP).toFixed(2)) }))} className="flex size-7 items-center justify-center rounded-lg border border-input text-sm font-bold">−</button>
            <input
              type="range"
              aria-label="Zoom"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={transform.scale}
              onChange={e => setTransform(tr => ({ ...tr, scale: Number(e.target.value) }))}
              className="flex-1"
            />
            <button type="button" onClick={() => setTransform(tr => ({ ...tr, scale: Math.min(MAX_ZOOM, +(tr.scale + ZOOM_STEP).toFixed(2)) }))} className="flex size-7 items-center justify-center rounded-lg border border-input text-sm font-bold">+</button>
          </div>
        )}
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t("previewNote")}</p>
        <button
          type="button"
          disabled={!stepsComplete}
          className="mb-2 w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {t("downloadButton")}
        </button>
      </div>
    </div>
  );
}
```

Modify `src/app/(public)/c/[slug]/page.tsx`:

```tsx
// src/app/(public)/c/[slug]/page.tsx
import { getBaseUrl } from "@/lib/base-url";
import { AvatarCreator, type Template } from "./avatar-creator";

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

  return <AvatarCreator slug={params.slug} templates={campaign.templates} />;
}
```

Delete `src/app/(public)/c/[slug]/campaign-compositor.tsx` (its content has been fully carried forward into `avatar-creator.tsx`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/c-slug-page.test.tsx tests/app/avatar-creator.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/c/[slug]" tests/app/c-slug-page.test.tsx tests/app/avatar-creator.test.tsx
git rm "src/app/(public)/c/[slug]/campaign-compositor.tsx" 2>/dev/null || true
git commit -m "feat(public): rewrite avatar creator with drag/zoom preview and dynamic Step 3 fields"
```

---

## Task 9: Wire the download button to `POST /generate`

**Files:**
- Modify: `src/app/(public)/c/[slug]/avatar-creator.tsx`
- Modify: `tests/app/avatar-creator.test.tsx`

**Interfaces:**
- Consumes: `POST /api/campaigns/[slug]/generate` (existing, unchanged — `FormData` with `templateId`, `photo`, `overlayValues`; response `{ resultUrl: string }` or `{ error: string }`).
- Produces: nothing new consumed elsewhere — Task 10 (share) reads the same `resultUrl` state this task introduces.

- [ ] **Step 1: Write the failing tests**

Append to `tests/app/avatar-creator.test.tsx`, inside `describe("AvatarCreator")`:

```tsx
  it("POSTs FormData to /generate and auto-downloads the result when the download button is clicked", async () => {
    const resultBlob = new Blob(["png-bytes"], { type: "image/png" });
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/campaigns/fpt38/generate") {
        return Promise.resolve({ ok: true, json: async () => ({ resultUrl: "http://storage/results/t1-123.png" }) });
      }
      if (url === "http://storage/results/t1-123.png") {
        return Promise.resolve({ ok: true, blob: async () => resultBlob });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as unknown as typeof fetch;

    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderCreator();
    const file = new File(["photo-bytes"], "me.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");

    const downloadBtn = await screen.findByRole("button", { name: "Tải ảnh về máy" });
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/campaigns/fpt38/generate", expect.objectContaining({ method: "POST" })));
    const generateCall = (global.fetch as any).mock.calls.find((c: any[]) => c[0] === "/api/campaigns/fpt38/generate");
    const sentForm = generateCall[1].body as FormData;
    expect(sentForm.get("templateId")).toBe("t1");
    expect(sentForm.get("photo")).toBe(file);
    expect(JSON.parse(sentForm.get("overlayValues") as string)).toEqual({ slogan: "Dream Big", unit: "FPT Software" });

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectURLSpy).toHaveBeenCalledWith(resultBlob);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:fake-url");
  });

  it("shows the server's error message and does not crash when /generate fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Template not found" }) });

    renderCreator();
    const file = new File(["photo-bytes"], "me.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");

    const downloadBtn = await screen.findByRole("button", { name: "Tải ảnh về máy" });
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Template not found"));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/avatar-creator.test.tsx`
Expected: FAIL — clicking the (currently inert) download button does nothing; `global.fetch` is never called for `/generate`.

- [ ] **Step 3: Write the implementation**

Modify `src/app/(public)/c/[slug]/avatar-creator.tsx`:

Add state near the other `useState` calls:

```tsx
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
```

Add the handler (place it after `handlePointerUp`):

```tsx
  async function handleDownload() {
    if (!photoFile) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const form = new FormData();
      form.set("templateId", selected.id);
      form.set("photo", photoFile);
      form.set("overlayValues", JSON.stringify(overlayValues));

      const res = await fetch(`/api/campaigns/${slug}/generate`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDownloadError(data?.error ?? t("errorGeneric"));
        return;
      }
      const { resultUrl: url } = await res.json();
      setResultUrl(url);

      const blobRes = await fetch(url);
      const blob = await blobRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${slug}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloading(false);
    }
  }
```

Replace the download button's JSX:

```tsx
        {downloadError && <p role="alert" className="mb-2 text-sm text-destructive">{downloadError}</p>}
        <button
          type="button"
          disabled={!stepsComplete || downloading}
          onClick={handleDownload}
          className="mb-2 w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {t("downloadButton")}
        </button>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/avatar-creator.test.tsx`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/c/[slug]/avatar-creator.tsx" tests/app/avatar-creator.test.tsx
git commit -m "feat(public): wire the download button to the real /generate API"
```

---

## Task 10: Share buttons

**Files:**
- Modify: `src/app/(public)/c/[slug]/avatar-creator.tsx`
- Modify: `tests/app/avatar-creator.test.tsx`

**Interfaces:**
- Consumes: `resultUrl` state introduced in Task 9.
- Produces: nothing new consumed elsewhere (leaf UI).

- [ ] **Step 1: Write the failing tests**

Append to `tests/app/avatar-creator.test.tsx`:

```tsx
  it("does not show share buttons before a successful download", () => {
    renderCreator();
    expect(screen.queryByText("Chia sẻ lên")).toBeNull();
  });

  it("uses navigator.share when available, as a single share action", async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });

    global.fetch = vi.fn((url: string) => {
      if (url === "/api/campaigns/fpt38/generate") {
        return Promise.resolve({ ok: true, json: async () => ({ resultUrl: "http://storage/results/t1-123.png" }) });
      }
      return Promise.resolve({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) });
    }) as unknown as typeof fetch;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderCreator();
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), new File(["x"], "me.jpg", { type: "image/jpeg" }));
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");
    const downloadBtn = await screen.findByRole("button", { name: "Tải ảnh về máy" });
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    const shareBtn = await screen.findByRole("button", { name: "Chia sẻ lên" });
    await userEvent.click(shareBtn);
    expect(shareSpy).toHaveBeenCalledWith(expect.objectContaining({ url: "http://storage/results/t1-123.png" }));

    // @ts-expect-error - cleanup the test-only property
    delete navigator.share;
  });

  it("falls back to platform share links when navigator.share is unavailable", async () => {
    // @ts-expect-error - ensure it's absent for this test
    delete navigator.share;

    global.fetch = vi.fn((url: string) => {
      if (url === "/api/campaigns/fpt38/generate") {
        return Promise.resolve({ ok: true, json: async () => ({ resultUrl: "http://storage/results/t1-123.png" }) });
      }
      return Promise.resolve({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) });
    }) as unknown as typeof fetch;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderCreator();
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), new File(["x"], "me.jpg", { type: "image/jpeg" }));
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");
    const downloadBtn = await screen.findByRole("button", { name: "Tải ảnh về máy" });
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    const fbLink = await screen.findByRole("link", { name: "Facebook" });
    expect(fbLink.getAttribute("href")).toContain("facebook.com/sharer");
    expect(fbLink.getAttribute("target")).toBe("_blank");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/avatar-creator.test.tsx`
Expected: FAIL — no "Chia sẻ lên" text or share buttons exist yet.

- [ ] **Step 3: Write the implementation**

Modify `src/app/(public)/c/[slug]/avatar-creator.tsx` — add after the download button's closing `</button>`:

```tsx
        {resultUrl && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 text-xs font-bold text-muted-foreground">{t("shareTitle")}</div>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <button
                type="button"
                onClick={() => navigator.share({ title: "Avatar Frame Platform", url: resultUrl })}
                className="w-full rounded-lg border border-input px-4 py-2 text-sm font-semibold"
              >
                {t("shareTitle")}
              </button>
            ) : (
              <div className="flex gap-2">
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(resultUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-9 items-center justify-center rounded-lg bg-muted text-xs font-bold text-secondary"
                >
                  Facebook
                </a>
                <a
                  href={`https://zalo.me/share?u=${encodeURIComponent(resultUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-9 items-center justify-center rounded-lg bg-muted text-xs font-bold text-emerald-600"
                >
                  Zalo
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(resultUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-9 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground"
                >
                  LinkedIn
                </a>
              </div>
            )}
          </div>
        )}
```

Note the `Facebook`/`Zalo`/`LinkedIn` link text doubles as their accessible name (used by the test's `getByRole("link", { name: "Facebook" })`) — keep the visible text exactly as written rather than replacing it with an icon-only button, so the accessible name stays meaningful without needing a separate `aria-label`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/avatar-creator.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/c/[slug]/avatar-creator.tsx" tests/app/avatar-creator.test.tsx
git commit -m "feat(public): add real share (Web Share API + platform link fallback)"
```

---

## Task 11: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. Pay attention to the route group move — search `grep -r "from \"@/app/page\"" src/` and `grep -rn "src/app/c/\[slug\]" src/ tests/` (excluding the new `(public)/` path) for any stray reference to the old, now-nonexistent paths.

- [ ] **Step 2: Production build**

Run: `npx next build`
Expected: build succeeds; the route table shows `/` and `/c/[slug]` at the same paths as before (route group is transparent to the URL), plus the new `/api/notifications` route.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including every file this plan created or modified.

- [ ] **Step 4: Manual smoke check in the browser** (if a local dev environment with Postgres/MinIO is available)

Start the dev server, then:
1. `/` — header with logo + lang toggle + notification bell appears; toggle EN switches card text; cards for campaigns with 0 frames show the disabled hint, not a link.
2. Click into a campaign with a real frame → `/c/[slug]` shows the 2-column layout: upload/template/Step-3 on the left, live preview on the right.
3. Upload a photo → canvas preview shows the photo inside the frame; drag on the canvas repositions it; the zoom slider zooms in/out live.
4. Fill in Step 3 fields → download button enables.
5. Click "Tải ảnh về máy" → a real file downloads to your machine; check `/admin/analytics` afterward — "Lượt tải theo Campaign" and "theo Ngày" should now show a nonzero count for this campaign (this was the original bug this plan set out to fix).
6. Share buttons appear after a successful download; on desktop, clicking one opens the platform's share URL in a new tab.
7. Open the notification bell — only campaign-lifecycle notifications appear (no "download" entries); mark-all-read clears the badge and survives a page reload (persisted in `localStorage`), independent of the admin dashboard's own unread count.

- [ ] **Step 5: Commit** (only if smoke-check fixes were needed)

```bash
git add -A
git commit -m "fix(public): smoke-test fixes for public site demo-parity work"
```
