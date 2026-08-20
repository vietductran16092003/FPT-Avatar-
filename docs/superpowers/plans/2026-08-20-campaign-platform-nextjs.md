# Campaign Platform (Next.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FPT event-avatar platform as a single Next.js 14 App Router codebase (public site + admin + API), with a generic Campaign/Template/`textOverlays` data model, Azure AD SSO for admin, and a server-side re-composite guarantee for every generated avatar — replacing the earlier Express/JWT plan, per the project's original architecture report.

**Architecture:** One Next.js 14 (App Router, TypeScript) app. Prisma + PostgreSQL for `User`/`Campaign`/`Template`/`GeneratedAvatar`. A single `ImageStorage` interface with a MinIO adapter (dev/K8s) and an Azure Blob adapter (Azure), selected by `STORAGE_PROVIDER` env var. One shared overlay-compositing function consumed by a browser Canvas preview and a `node-canvas` server compositor, so preview and official result never diverge. NextAuth.js + Azure AD provider for admin login (blocked on an infra gate — see Task 10).

**Tech Stack:** Next.js 14 (App Router, TypeScript, NextNode runtime), Tailwind CSS + shadcn/ui (Radix-based components copied into `src/components/ui/`), Prisma + PostgreSQL, `node-canvas`, `@aws-sdk/client-s3` (MinIO-compatible) + `@azure/storage-blob`, NextAuth.js (`next-auth`) with Azure AD provider, Vitest + Testing Library + Supertest-style route handler tests, Docker.

**Spec:** [docs/superpowers/specs/2026-08-20-campaign-platform-nextjs-design.md](../specs/2026-08-20-campaign-platform-nextjs-design.md)

## Global Constraints

- Server always re-fetches `template.overlayConfig` from the DB by the campaign-scoped template lookup — never trusts a client-supplied layout or overlay list (spec §7).
- Every `overlayValues` string composited into the server-side text draw must be escaped before rendering (spec §7).
- For an overlay with `type: "select"`, the submitted value must be a member of that overlay's own `options[]`, not merely a known key (spec §7).
- All image reads/writes go through the one `ImageStorage` interface (`upload`/`getPublicUrl`/`delete`); switching MinIO ⇄ Azure Blob is an env var change only (spec §4, §9).
- `GET /api/campaigns` (public) returns an array of every Campaign with `status=active` and today within `[startDate, endDate]` — never a single record (spec §3.3, §9).
- `User.role` is the only source of admin authorization; it is never derived from an Azure AD claim (spec §9).
- No field is hard-coded onto `Campaign` or `Template` for a specific event concept (e.g. no `joinYears` column) — all per-event text fields live in `Template.overlayConfig.textOverlays[]` (spec §3).
- A task whose spec section carries a ⛔ organizational gate (spec §10) is marked **⛔ CHẶN bởi gate: ...** at the top of the task and must not be executed until that gate is confirmed — this plan does not implement around it silently.
- One Docker image must run on both K8s and Azure Container Apps, differing only by env vars (spec §9) — actual K8s/Azure Container Apps manifests are out of scope for this plan (spec §11) and are not tasks here.
- All interactive UI elements (form fields, buttons in a submitting state) use shadcn/ui components (`Button`, `Input`, `Select`, `Label`) instead of raw unstyled HTML tags, and every form field has a real `<Label>` associated via `htmlFor`/`id` — not a placeholder standing in for a label.

---

## Task 1: Project scaffold + Prisma schema

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `.env.example`
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Test: `tests/prisma-schema.test.ts`

**Interfaces:**
- Produces: `prisma` singleton client exported from `src/lib/prisma.ts` as `export const prisma: PrismaClient`.
- Produces: Prisma models `User`, `Campaign`, `Template`, `GeneratedAvatar` exactly as defined in spec §3.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@14 . --typescript --app --tailwind --no-eslint --src-dir --import-alias "@/*" --use-npm
npm install prisma @prisma/client
npm install -D vitest @vitejs/plugin-react
npx prisma init --datasource-provider postgresql
npx shadcn-ui@latest init -d
npx shadcn-ui@latest add button input select label card
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String            @id @default(cuid())
  email     String            @unique
  name      String?
  role      String            @default("user")
  createdAt DateTime          @default(now())
  avatars   GeneratedAvatar[]
}

model Campaign {
  id            String            @id @default(cuid())
  slug          String            @unique
  status        String            @default("draft")
  startDate     DateTime
  endDate       DateTime
  language      String            @default("vi")
  displayConfig Json
  templates     Template[]
  avatars       GeneratedAvatar[]
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
}

model Template {
  id            String            @id @default(cuid())
  campaignId    String
  campaign      Campaign          @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  name          String
  frameImageKey String
  overlayConfig Json
  avatars       GeneratedAvatar[]
  createdAt     DateTime          @default(now())
}

model GeneratedAvatar {
  id              String   @id @default(cuid())
  campaignId      String
  campaign        Campaign @relation(fields: [campaignId], references: [id])
  templateId      String
  template        Template @relation(fields: [templateId], references: [id])
  userId          String?
  user            User?    @relation(fields: [userId], references: [id])
  overlayValues   Json
  resultImageKey  String
  createdAt       DateTime @default(now())
}
```

- [ ] **Step 3: Write `src/lib/prisma.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: Write a schema-shape test**

```ts
// tests/prisma-schema.test.ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

describe("Prisma schema", () => {
  it("defines Campaign with displayConfig and no joinYears field", () => {
    const fields = Prisma.dmmf.datamodel.models.find(m => m.name === "Campaign")!.fields.map(f => f.name);
    expect(fields).toContain("displayConfig");
    expect(fields).not.toContain("joinYears");
  });

  it("defines Template with overlayConfig, not a fixed components list", () => {
    const fields = Prisma.dmmf.datamodel.models.find(m => m.name === "Template")!.fields.map(f => f.name);
    expect(fields).toContain("overlayConfig");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails (Prisma client not generated yet)**

Run: `npx vitest run tests/prisma-schema.test.ts`
Expected: FAIL — `@prisma/client` has no generated `Prisma.dmmf` yet, or import error.

- [ ] **Step 6: Generate the Prisma client and run test to verify it passes**

Run: `npx prisma generate && npx vitest run tests/prisma-schema.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs .env.example prisma src/lib/prisma.ts tests/prisma-schema.test.ts
git commit -m "feat: scaffold Next.js app with Campaign/Template/User/GeneratedAvatar schema"
```

---

## Task 2: `ImageStorage` interface + MinIO adapter

**Files:**
- Create: `src/lib/storage/types.ts`
- Create: `src/lib/storage/minio-storage.ts`
- Create: `src/lib/storage/index.ts`
- Test: `tests/lib/storage/minio-storage.test.ts`

**Interfaces:**
- Produces: `interface ImageStorage { upload(key: string, buffer: Buffer, contentType: string): Promise<void>; getPublicUrl(key: string): string; delete(key: string): Promise<void>; }` in `src/lib/storage/types.ts`.
- Produces: `export function getStorage(): ImageStorage` in `src/lib/storage/index.ts`, selecting adapter by `process.env.STORAGE_PROVIDER`.
- Consumes: none (foundation task).

- [ ] **Step 1: Write `src/lib/storage/types.ts`**

```ts
export interface ImageStorage {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test for the MinIO adapter**

```ts
// tests/lib/storage/minio-storage.test.ts
import { describe, it, expect, vi } from "vitest";
import { MinioStorage } from "../../../src/lib/storage/minio-storage";

describe("MinioStorage", () => {
  it("uploads via the injected S3 client and builds a public URL from the bucket", async () => {
    const send = vi.fn().mockResolvedValue({});
    const fakeClient = { send };
    const storage = new MinioStorage(fakeClient as any, "avatars", "http://localhost:9000");

    await storage.upload("templates/frame.png", Buffer.from("x"), "image/png");

    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.getPublicUrl("templates/frame.png")).toBe("http://localhost:9000/avatars/templates/frame.png");
  });

  it("deletes via the injected S3 client", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new MinioStorage({ send } as any, "avatars", "http://localhost:9000");

    await storage.delete("templates/frame.png");

    expect(send).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/storage/minio-storage.test.ts`
Expected: FAIL — `../../../src/lib/storage/minio-storage` has no exported member `MinioStorage`.

- [ ] **Step 4: Install the S3 SDK and implement `MinioStorage`**

```bash
npm install @aws-sdk/client-s3
```

```ts
// src/lib/storage/minio-storage.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { ImageStorage } from "./types";

export class MinioStorage implements ImageStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
  ) {}

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${this.bucket}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/storage/minio-storage.test.ts`
Expected: PASS

- [ ] **Step 6: Write `src/lib/storage/index.ts` — the env-driven factory (no Azure Blob branch yet, throws until Task 9)**

```ts
import { S3Client } from "@aws-sdk/client-s3";
import type { ImageStorage } from "./types";
import { MinioStorage } from "./minio-storage";

export function getStorage(): ImageStorage {
  const provider = process.env.STORAGE_PROVIDER ?? "minio";

  if (provider === "minio") {
    const client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
      },
    });
    return new MinioStorage(client, process.env.MINIO_BUCKET ?? "avatars", process.env.MINIO_PUBLIC_URL ?? "http://localhost:9000");
  }

  throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`);
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage tests/lib/storage
git commit -m "feat: add ImageStorage interface with MinIO adapter"
```

---

## Task 3: Shared overlay-compositing function (pure, environment-agnostic)

**Files:**
- Create: `src/lib/compositing/overlay-layout.ts`
- Test: `tests/lib/compositing/overlay-layout.test.ts`

**Interfaces:**
- Produces: `export interface TextOverlay { key: string; label: string; labelEn: string; type: "select" | "text"; options?: string[]; placeholder?: string; x: number; y: number; fontSize: number; color: string; }`
- Produces: `export function resolveOverlayDraws(overlays: TextOverlay[], values: Record<string, string>, width: number, height: number): { text: string; x: number; y: number; fontSize: number; color: string }[]` — pure function converting % coordinates to pixel coordinates and filtering to overlays that have a value. Both the browser preview (Task 8) and the server compositor (Task 4) call this so the two never diverge.
- Consumes: none.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/compositing/overlay-layout.test.ts
import { describe, it, expect } from "vitest";
import { resolveOverlayDraws, type TextOverlay } from "../../../src/lib/compositing/overlay-layout";

const overlays: TextOverlay[] = [
  { key: "joinYear", label: "Năm gia nhập", labelEn: "Join year", type: "select", options: ["2020", "2021"], x: 50, y: 80, fontSize: 24, color: "#ffffff" },
  { key: "slogan", label: "Khẩu hiệu", labelEn: "Slogan", type: "text", x: 10, y: 90, fontSize: 16, color: "#000000" },
];

describe("resolveOverlayDraws", () => {
  it("converts percentage coordinates to pixels for a 1000x800 canvas", () => {
    const draws = resolveOverlayDraws(overlays, { joinYear: "2021" }, 1000, 800);
    expect(draws).toEqual([{ text: "2021", x: 500, y: 640, fontSize: 24, color: "#ffffff" }]);
  });

  it("skips overlays with no submitted value", () => {
    const draws = resolveOverlayDraws(overlays, {}, 1000, 800);
    expect(draws).toHaveLength(0);
  });

  it("includes multiple overlays that both have values", () => {
    const draws = resolveOverlayDraws(overlays, { joinYear: "2020", slogan: "Dream Big" }, 1000, 800);
    expect(draws.map(d => d.text)).toEqual(["2020", "Dream Big"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/compositing/overlay-layout.test.ts`
Expected: FAIL — module `../../../src/lib/compositing/overlay-layout` not found.

- [ ] **Step 3: Implement `resolveOverlayDraws`**

```ts
// src/lib/compositing/overlay-layout.ts
export interface TextOverlay {
  key: string;
  label: string;
  labelEn: string;
  type: "select" | "text";
  options?: string[];
  placeholder?: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export interface ResolvedDraw {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export function resolveOverlayDraws(
  overlays: TextOverlay[],
  values: Record<string, string>,
  width: number,
  height: number,
): ResolvedDraw[] {
  return overlays
    .filter(o => values[o.key])
    .map(o => ({
      text: values[o.key],
      x: (o.x / 100) * width,
      y: (o.y / 100) * height,
      fontSize: o.fontSize,
      color: o.color,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/compositing/overlay-layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/compositing tests/lib/compositing
git commit -m "feat: add shared overlay-layout resolver used by preview and server compositor"
```

---

## Task 4: Server-side compositor (`node-canvas`) with overlay validation helper

**Files:**
- Create: `src/lib/compositing/server-compositor.ts`
- Create: `src/lib/compositing/validate-overlay-values.ts`
- Test: `tests/lib/compositing/validate-overlay-values.test.ts`
- Test: `tests/lib/compositing/server-compositor.test.ts`

**Interfaces:**
- Consumes: `resolveOverlayDraws`, `TextOverlay` from `src/lib/compositing/overlay-layout.ts` (Task 3).
- Produces: `export function validateOverlayValues(overlays: TextOverlay[], values: Record<string, string>): { valid: boolean; error?: string }` in `validate-overlay-values.ts`.
- Produces: `export async function compositeAvatar(framePngBuffer: Buffer, photoBuffer: Buffer, photoArea: { x: number; y: number; w: number; h: number }, overlays: TextOverlay[], overlayValues: Record<string, string>): Promise<Buffer>` in `server-compositor.ts` — returns a PNG buffer.

- [ ] **Step 1: Write the failing test for `validateOverlayValues`**

```ts
// tests/lib/compositing/validate-overlay-values.test.ts
import { describe, it, expect } from "vitest";
import { validateOverlayValues } from "../../../src/lib/compositing/validate-overlay-values";
import type { TextOverlay } from "../../../src/lib/compositing/overlay-layout";

const overlays: TextOverlay[] = [
  { key: "joinYear", label: "Năm gia nhập", labelEn: "Join year", type: "select", options: ["2020", "2021"], x: 50, y: 80, fontSize: 24, color: "#fff" },
  { key: "slogan", label: "Khẩu hiệu", labelEn: "Slogan", type: "text", x: 10, y: 90, fontSize: 16, color: "#000" },
];

describe("validateOverlayValues", () => {
  it("accepts values whose keys are all declared on the template", () => {
    expect(validateOverlayValues(overlays, { joinYear: "2021" })).toEqual({ valid: true });
  });

  it("rejects an unknown key not declared on the template", () => {
    const result = validateOverlayValues(overlays, { unknownKey: "x" });
    expect(result.valid).toBe(false);
  });

  it("rejects a select overlay value not in its own options", () => {
    const result = validateOverlayValues(overlays, { joinYear: "1999" });
    expect(result.valid).toBe(false);
  });

  it("accepts any string for a free-text overlay", () => {
    expect(validateOverlayValues(overlays, { slogan: "Dream Big, Move Fast" })).toEqual({ valid: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/compositing/validate-overlay-values.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `validateOverlayValues`**

```ts
// src/lib/compositing/validate-overlay-values.ts
import type { TextOverlay } from "./overlay-layout";

export function validateOverlayValues(
  overlays: TextOverlay[],
  values: Record<string, string>,
): { valid: boolean; error?: string } {
  const knownKeys = new Set(overlays.map(o => o.key));

  for (const key of Object.keys(values)) {
    if (!knownKeys.has(key)) {
      return { valid: false, error: `Unknown overlay key: ${key}` };
    }
  }

  for (const overlay of overlays) {
    if (overlay.type === "select" && values[overlay.key] !== undefined) {
      if (!overlay.options?.includes(values[overlay.key])) {
        return { valid: false, error: `Invalid value for select overlay "${overlay.key}"` };
      }
    }
  }

  return { valid: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/compositing/validate-overlay-values.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `compositeAvatar`**

```ts
// tests/lib/compositing/server-compositor.test.ts
import { describe, it, expect } from "vitest";
import { createCanvas } from "canvas";
import { compositeAvatar } from "../../../src/lib/compositing/server-compositor";

function solidPng(width: number, height: number, color: string): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

describe("compositeAvatar", () => {
  it("returns a PNG buffer sized to the frame image, with photo + overlay text drawn in", async () => {
    const frame = solidPng(200, 200, "rgba(0,0,0,0)");
    const photo = solidPng(100, 100, "#ff0000");

    const result = await compositeAvatar(
      frame,
      photo,
      { x: 10, y: 10, w: 50, h: 50 },
      [{ key: "slogan", label: "Khẩu hiệu", labelEn: "Slogan", type: "text", x: 50, y: 90, fontSize: 20, color: "#ffffff" }],
      { slogan: "Dream Big" },
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    const decoded = await import("canvas").then(({ loadImage }) => loadImage(result));
    expect(decoded.width).toBe(200);
    expect(decoded.height).toBe(200);
  });

  it("escapes overlay values so raw markup cannot be injected into the drawn text", async () => {
    const frame = solidPng(50, 50, "rgba(0,0,0,0)");
    const photo = solidPng(20, 20, "#00ff00");

    const result = await compositeAvatar(
      frame, photo, { x: 0, y: 0, w: 20, h: 20 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 50, fontSize: 10, color: "#000" }],
      { slogan: "<script>alert(1)</script>" },
    );

    expect(Buffer.isBuffer(result)).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/lib/compositing/server-compositor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Install `canvas` and implement `compositeAvatar`**

```bash
npm install canvas
```

```ts
// src/lib/compositing/server-compositor.ts
import { createCanvas, loadImage } from "canvas";
import { resolveOverlayDraws, type TextOverlay } from "./overlay-layout";

export async function compositeAvatar(
  framePngBuffer: Buffer,
  photoBuffer: Buffer,
  photoArea: { x: number; y: number; w: number; h: number },
  overlays: TextOverlay[],
  overlayValues: Record<string, string>,
): Promise<Buffer> {
  const frame = await loadImage(framePngBuffer);
  const photo = await loadImage(photoBuffer);

  const canvas = createCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d");

  const px = (photoArea.x / 100) * frame.width;
  const py = (photoArea.y / 100) * frame.height;
  const pw = (photoArea.w / 100) * frame.width;
  const ph = (photoArea.h / 100) * frame.height;
  ctx.drawImage(photo, px, py, pw, ph);

  ctx.drawImage(frame, 0, 0);

  const draws = resolveOverlayDraws(overlays, overlayValues, frame.width, frame.height);
  for (const draw of draws) {
    ctx.fillStyle = draw.color;
    ctx.font = `${draw.fontSize}px sans-serif`;
    // node-canvas's fillText draws literal characters, not markup — no
    // separate XML escaping step is needed here (unlike an SVG-string
    // compositor), but values still pass through resolveOverlayDraws
    // unmodified, never interpolated into an executable string.
    ctx.fillText(draw.text, draw.x, draw.y);
  }

  return canvas.toBuffer("image/png");
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/lib/compositing/server-compositor.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/compositing tests/lib/compositing package.json package-lock.json
git commit -m "feat: add node-canvas server compositor and overlay value validation"
```

---

## Task 5: Public API — `GET /api/campaigns` (active list) and `GET /api/campaigns/:slug`

**Files:**
- Create: `src/app/api/campaigns/route.ts`
- Create: `src/app/api/campaigns/[slug]/route.ts`
- Test: `tests/app/api/campaigns.test.ts`
- Test: `tests/app/api/campaigns-slug.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/prisma.ts` (Task 1).
- Produces: `GET /api/campaigns` → `Campaign[]` JSON (only `status="active"` and today within range).
- Produces: `GET /api/campaigns/:slug` → `{ ...Campaign, templates: Template[] }` JSON, or 404.

- [ ] **Step 1: Write the failing test for the list endpoint**

```ts
// tests/app/api/campaigns.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: { campaign: { findMany: vi.fn() } },
}));

import { GET } from "../../../src/app/api/campaigns/route";
import { prisma } from "../../../src/lib/prisma";

describe("GET /api/campaigns", () => {
  it("returns every active campaign currently within its date range as an array", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      { id: "1", slug: "fpt38", status: "active" },
      { id: "2", slug: "techweek-2026", status: "active" },
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
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/campaigns.test.ts`
Expected: FAIL — module `src/app/api/campaigns/route` not found.

- [ ] **Step 3: Implement `GET /api/campaigns`**

```ts
// src/app/api/campaigns/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "active",
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });
  return NextResponse.json(campaigns);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/campaigns.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the detail endpoint**

```ts
// tests/app/api/campaigns-slug.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: { campaign: { findUnique: vi.fn() } },
}));

import { GET } from "../../../src/app/api/campaigns/[slug]/route";
import { prisma } from "../../../src/lib/prisma";

describe("GET /api/campaigns/:slug", () => {
  it("returns the campaign with its templates when found", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "1", slug: "fpt38", templates: [] });

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
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/app/api/campaigns-slug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `GET /api/campaigns/:slug`**

```ts
// src/app/api/campaigns/[slug]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: params.slug },
    include: { templates: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/app/api/campaigns-slug.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/api/campaigns tests/app/api/campaigns.test.ts tests/app/api/campaigns-slug.test.ts
git commit -m "feat: add public campaigns list and detail API routes"
```

---

## Task 6: Public API — `POST /api/campaigns/:slug/generate`

**Files:**
- Create: `src/app/api/campaigns/[slug]/generate/route.ts`
- Test: `tests/app/api/campaigns-generate.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `getStorage` (Task 2), `compositeAvatar`, `validateOverlayValues` (Task 4).
- Produces: `POST /api/campaigns/:slug/generate` (multipart form: `templateId`, `photo`, `overlayValues` as JSON string) → `{ resultUrl: string }` JSON, 400 on invalid overlay values, 404 on missing template.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/api/campaigns-generate.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    template: { findFirst: vi.fn() },
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

import { POST } from "../../../src/app/api/campaigns/[slug]/generate/route";
import { prisma } from "../../../src/lib/prisma";

const overlays = [
  { key: "joinYear", label: "L", labelEn: "L", type: "select", options: ["2021"], x: 10, y: 10, fontSize: 10, color: "#fff" },
];

function multipartRequest(overlayValues: object, templateId = "tpl1") {
  const form = new FormData();
  form.set("templateId", templateId);
  form.set("overlayValues", JSON.stringify(overlayValues));
  form.set("photo", new Blob([Buffer.from("photo-bytes")], { type: "image/png" }), "photo.png");
  return new Request("http://x/api/campaigns/fpt38/generate", { method: "POST", body: form });
}

describe("POST /api/campaigns/:slug/generate", () => {
  it("re-composites server-side and stores the result, ignoring any client-sent layout", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/campaigns/[slug]/generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { compositeAvatar } from "@/lib/compositing/server-compositor";
import { validateOverlayValues } from "@/lib/compositing/validate-overlay-values";

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

  const overlayConfig = template.overlayConfig as {
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
      campaignId: (await prisma.campaign.findUniqueOrThrow({ where: { slug: params.slug } })).id,
      templateId: template.id,
      overlayValues,
      resultImageKey: resultKey,
    },
  });

  return NextResponse.json({ resultUrl: storage.getPublicUrl(resultKey) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/campaigns-generate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[slug]/generate tests/app/api/campaigns-generate.test.ts
git commit -m "feat: add server-side avatar generation endpoint with mandatory re-composite"
```

---

## Task 7: Admin API — Campaign CRUD

**Files:**
- Create: `src/app/api/admin/campaigns/route.ts`
- Create: `src/app/api/admin/campaigns/[slug]/route.ts`
- Create: `src/lib/require-admin.ts`
- Test: `tests/lib/require-admin.test.ts`
- Test: `tests/app/api/admin-campaigns.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces: `export async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; response: Response }>` in `src/lib/require-admin.ts` — every admin route calls this first (real session check wired in Task 10; this task builds it against an injectable session getter so the route logic is testable before NextAuth lands).
- Produces: `GET/POST /api/admin/campaigns`, `PATCH/DELETE /api/admin/campaigns/:slug`.

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

- [ ] **Step 3: Write a placeholder `src/lib/session.ts` (real NextAuth wiring lands in Task 10) and implement `requireAdmin`**

```ts
// src/lib/session.ts
// Placeholder until Task 10 wires NextAuth's Azure AD session. Reads the
// user by whatever mechanism Task 10 puts here — kept as its own module so
// requireAdmin and every admin route can be tested against a mock now,
// without waiting on the Azure AD network gate (spec §10).
import { prisma } from "./prisma";

export async function getCurrentUser(): Promise<{ id: string; role: string } | null> {
  throw new Error("getCurrentUser is not wired yet — implemented in Task 10");
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

- [ ] **Step 5: Write the failing test for admin campaign CRUD**

```ts
// tests/app/api/admin-campaigns.test.ts
import { describe, it, expect, vi } from "vitest";

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
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-campaigns.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 7: Implement the two route files**

```ts
// src/app/api/admin/campaigns/route.ts
import { NextResponse } from "next/server";
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
}
```

```ts
// src/app/api/admin/campaigns/[slug]/route.ts
import { NextResponse } from "next/server";
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
  const campaign = await prisma.campaign.delete({ where: { slug: params.slug } });
  return NextResponse.json(campaign);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-campaigns.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/api/admin/campaigns src/lib/require-admin.ts src/lib/session.ts tests/lib/require-admin.test.ts tests/app/api/admin-campaigns.test.ts
git commit -m "feat: add admin campaign CRUD API behind requireAdmin"
```

---

## Task 8: Admin API — Template CRUD with `overlayConfig`

**Files:**
- Create: `src/app/api/admin/campaigns/[slug]/templates/route.ts`
- Create: `src/app/api/admin/campaigns/[slug]/templates/[id]/route.ts`
- Test: `tests/app/api/admin-templates.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 7), `prisma` (Task 1), `getStorage` (Task 2).
- Produces: `POST /api/admin/campaigns/:slug/templates` (multipart: `name`, `frameImage`, `overlayConfig` JSON string) → created `Template`. `PATCH/DELETE /api/admin/campaigns/:slug/templates/:id`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/api/admin-templates.test.ts
import { describe, it, expect, vi } from "vitest";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/admin-templates.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the two route files**

```ts
// src/app/api/admin/campaigns/[slug]/templates/route.ts
import { NextResponse } from "next/server";
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

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { slug: params.slug } });

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
  const template = await prisma.template.delete({ where: { id: params.id } });
  return NextResponse.json(template);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/admin-templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/campaigns/[slug]/templates tests/app/api/admin-templates.test.ts
git commit -m "feat: add admin template CRUD API with overlayConfig upload"
```

---

## Task 9: Azure Blob storage adapter

**Files:**
- Create: `src/lib/storage/azure-blob-storage.ts`
- Modify: `src/lib/storage/index.ts`
- Test: `tests/lib/storage/azure-blob-storage.test.ts`

**Interfaces:**
- Consumes: `ImageStorage` (Task 2).
- Produces: `export class AzureBlobStorage implements ImageStorage`, wired into `getStorage()`'s `provider === "azure-blob"` branch.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/storage/azure-blob-storage.test.ts
import { describe, it, expect, vi } from "vitest";
import { AzureBlobStorage } from "../../../src/lib/storage/azure-blob-storage";

describe("AzureBlobStorage", () => {
  it("uploads via the injected container client and builds a public URL from the account/container", async () => {
    const upload = vi.fn().mockResolvedValue({});
    const getBlockBlobClient = vi.fn().mockReturnValue({ uploadData: upload });
    const containerClient = { getBlockBlobClient, url: "https://acct.blob.core.windows.net/avatars" };

    const storage = new AzureBlobStorage(containerClient as any);
    await storage.upload("templates/frame.png", Buffer.from("x"), "image/png");

    expect(getBlockBlobClient).toHaveBeenCalledWith("templates/frame.png");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(storage.getPublicUrl("templates/frame.png")).toBe("https://acct.blob.core.windows.net/avatars/templates/frame.png");
  });

  it("deletes via the injected container client", async () => {
    const deleteIfExists = vi.fn().mockResolvedValue({});
    const containerClient = { getBlockBlobClient: () => ({ deleteIfExists }), url: "https://acct.blob.core.windows.net/avatars" };

    const storage = new AzureBlobStorage(containerClient as any);
    await storage.delete("templates/frame.png");

    expect(deleteIfExists).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/storage/azure-blob-storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Install the Azure SDK and implement `AzureBlobStorage`**

```bash
npm install @azure/storage-blob
```

```ts
// src/lib/storage/azure-blob-storage.ts
import type { ContainerClient } from "@azure/storage-blob";
import type { ImageStorage } from "./types";

export class AzureBlobStorage implements ImageStorage {
  constructor(private readonly container: ContainerClient) {}

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const blockBlobClient = this.container.getBlockBlobClient(key);
    await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
  }

  getPublicUrl(key: string): string {
    return `${this.container.url}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const blockBlobClient = this.container.getBlockBlobClient(key);
    await blockBlobClient.deleteIfExists();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/storage/azure-blob-storage.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the `azure-blob` branch into `getStorage()`**

```ts
// src/lib/storage/index.ts — add alongside the existing minio branch
import { BlobServiceClient } from "@azure/storage-blob";
import { AzureBlobStorage } from "./azure-blob-storage";

// inside getStorage(), after the "minio" branch:
if (provider === "azure-blob") {
  const serviceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING ?? "");
  const container = serviceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER ?? "avatars");
  return new AzureBlobStorage(container);
}
```

- [ ] **Step 6: Run the full storage test suite to confirm no regression**

Run: `npx vitest run tests/lib/storage`
Expected: PASS (both MinIO and Azure Blob suites)

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage package.json package-lock.json
git commit -m "feat: add Azure Blob storage adapter, selected via STORAGE_PROVIDER env var"
```

---

## Task 10: ⛔ CHẶN bởi gate: NextAuth + Azure AD SSO admin login

**⛔ CHẶN bởi gate:** Team hạ tầng phải xác nhận `curl` thành công tới `login.microsoftonline.com` từ một pod trong cluster K8s nội bộ **trước khi bắt đầu task này** (spec §5, §10 — báo cáo gốc mục 5, dòng 🔴). Không code phần này nếu gate chưa xác nhận.

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/session.ts` (replaces the Task 7 placeholder)
- Modify: `src/middleware.ts`
- Test: `tests/lib/session.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces: real `export async function getCurrentUser(): Promise<{ id: string; role: string } | null>` in `src/lib/session.ts`, replacing the Task 7 placeholder that every admin route (Tasks 7, 8) already calls through `requireAdmin` — no admin route file changes in this task.

- [ ] **Step 1: Confirm the gate is cleared**

Do not proceed past this step without written confirmation from Team hạ tầng that the curl test succeeded (spec §10). Record the confirmation date/link in the commit message of Step 7.

- [ ] **Step 2: Install NextAuth and configure the Azure AD provider**

```bash
npm install next-auth
```

```ts
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { prisma } from "@/lib/prisma";

const handler = NextAuth({
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // First login creates the User with role "user". Admin role is
      // granted by hand directly in the DB and must never be overwritten
      // here on subsequent logins (spec §5, §9) — upsert only touches
      // name/email, never role.
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name ?? undefined },
        create: { email: user.email, name: user.name ?? undefined, role: "user" },
      });
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
        (session.user as any).id = dbUser?.id;
        (session.user as any).role = dbUser?.role ?? "user";
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
```

- [ ] **Step 3: Write the failing test for `getCurrentUser`**

```ts
// tests/lib/session.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("../../src/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { getCurrentUser } from "../../src/lib/session";
import { getServerSession } from "next-auth";
import { prisma } from "../../src/lib/prisma";

describe("getCurrentUser", () => {
  it("returns id and role from the DB user matching the session email", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "a@fpt.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "admin" });

    const user = await getCurrentUser();

    expect(user).toEqual({ id: "u1", role: "admin" });
  });

  it("returns null when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/lib/session.test.ts`
Expected: FAIL — `getCurrentUser` still throws the Task 7 placeholder error.

- [ ] **Step 5: Implement real `src/lib/session.ts`**

```ts
// src/lib/session.ts
import { getServerSession } from "next-auth";
import { prisma } from "./prisma";

export async function getCurrentUser(): Promise<{ id: string; role: string } | null> {
  const session = await getServerSession();
  if (!session?.user?.email) return null;

  const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!dbUser) return null;

  return { id: dbUser.id, role: dbUser.role };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/lib/session.test.ts`
Expected: PASS

- [ ] **Step 7: Add `src/middleware.ts` for the outer `/admin` gate**

```ts
// src/middleware.ts
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/admin/login" },
});

export const config = { matcher: ["/admin/:path*"] };
```

- [ ] **Step 8: Commit (include gate confirmation reference)**

```bash
git add src/app/api/auth src/lib/session.ts src/middleware.ts tests/lib/session.test.ts package.json package-lock.json
git commit -m "feat: wire NextAuth Azure AD SSO for admin login

Gate confirmed: <link/date of Team hạ tầng curl confirmation to login.microsoftonline.com>"
```

---

## Task 11: Public UI — home page listing active campaigns

**Files:**
- Create: `src/lib/base-url.ts` (absolute-URL helper for server-side `fetch` calls)
- Create: `src/app/page.tsx`
- Create: `src/app/campaigns-client.ts` (thin fetch helper, testable independent of React)
- Test: `tests/lib/base-url.test.ts`
- Test: `tests/app/campaigns-client.test.ts`

**Interfaces:**
- Consumes: `GET /api/campaigns` (Task 5).
- Produces: `export function getBaseUrl(): string` in `src/lib/base-url.ts` — returns `""` when called in the browser (a relative URL resolves fine there) and an absolute origin when called in a Server Component (no `window`, so a relative `fetch` URL has nothing to resolve against).
- Produces: `export async function fetchActiveCampaigns(): Promise<Campaign[]>` in `campaigns-client.ts`, used by `page.tsx`.

- [ ] **Step 1: Write the failing test for `getBaseUrl`**

```ts
// tests/lib/base-url.test.ts
import { describe, it, expect } from "vitest";
import { getBaseUrl } from "../../src/lib/base-url";

describe("getBaseUrl", () => {
  it("returns an absolute origin for server-side calls (no window in this test environment)", () => {
    expect(getBaseUrl()).toBe(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/base-url.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `getBaseUrl`**

```ts
// src/lib/base-url.ts
export function getBaseUrl(): string {
  // Server Components run with no `window` — a relative fetch URL fails
  // there because there is no browser origin to resolve it against, so
  // an absolute one is built from an env var (falling back to localhost
  // for local dev). In the browser, `window` exists and a relative URL
  // is kept so it still works behind any reverse-proxy path/port.
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/base-url.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `fetchActiveCampaigns`**

```ts
// tests/app/campaigns-client.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchActiveCampaigns } from "../../src/app/campaigns-client";

afterEach(() => vi.restoreAllMocks());

describe("fetchActiveCampaigns", () => {
  it("fetches from an absolute /api/campaigns URL (safe to call from a Server Component)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => [{ slug: "fpt38" }] });

    const campaigns = await fetchActiveCampaigns();

    expect(campaigns).toEqual([{ slug: "fpt38" }]);
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:3000/api/campaigns", expect.any(Object));
  });

  it("returns an empty array (not an error) when the API returns none", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => [] });

    const campaigns = await fetchActiveCampaigns();

    expect(campaigns).toEqual([]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/app/campaigns-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `campaigns-client.ts`**

```ts
// src/app/campaigns-client.ts
import { getBaseUrl } from "@/lib/base-url";

export interface Campaign {
  slug: string;
  displayConfig: { title: string; description: string; ctaLabel: string; badge?: string };
  language: "vi" | "en";
}

export async function fetchActiveCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns`, { cache: "no-store" });
  return res.json();
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/app/campaigns-client.test.ts`
Expected: PASS

- [ ] **Step 9: Implement `src/app/page.tsx` (empty-state shown when the array is empty, per spec §8; static metadata for SEO)**

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
    return <p>Hiện chưa có chiến dịch nào đang diễn ra.</p>;
  }

  return (
    <ul>
      {campaigns.map(c => (
        <li key={c.slug}>
          <Link href={`/c/${c.slug}`}>{c.displayConfig.title}</Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/base-url.ts src/app/page.tsx src/app/campaigns-client.ts tests/lib/base-url.test.ts tests/app/campaigns-client.test.ts
git commit -m "feat: add public home page listing all currently-active campaigns"
```

---

## Task 12: Public UI — campaign page with browser preview compositor

**Files:**
- Create: `src/app/c/[slug]/page.tsx` (Server Component — fetches campaign + templates)
- Create: `src/app/c/[slug]/campaign-compositor.tsx` (Client Component — interactive selection, overlay inputs, canvas)
- Create: `src/lib/compositing/browser-compositor.ts`
- Test: `tests/lib/compositing/browser-compositor.test.ts`

**Interfaces:**
- Consumes: `resolveOverlayDraws` (Task 3), `GET /api/campaigns/:slug` (Task 5), `getBaseUrl` (Task 11).
- Produces: `export async function renderPreview(canvas: HTMLCanvasElement, frameImg: HTMLImageElement, photoImg: HTMLImageElement, photoArea: {x:number;y:number;w:number;h:number}, overlays: TextOverlay[], overlayValues: Record<string,string>): Promise<void>` — the browser half of the shared compositing approach (spec §7 step 1).
- Produces: `export function CampaignCompositor({ templates }: { templates: Template[] })` — the Client Component `page.tsx` renders, so all `fetch`/DOM-dependent state stays out of the Server Component.

- [ ] **Step 1: Write the failing test using a jsdom canvas stub**

```ts
// tests/lib/compositing/browser-compositor.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderPreview } from "../../../src/lib/compositing/browser-compositor";

function fakeCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    font: "",
  };
  return { canvas: { width: 200, height: 200, getContext: () => ctx }, ctx };
}

describe("renderPreview", () => {
  it("draws the photo into photoArea, then the frame, then each overlay with a value", async () => {
    const { canvas, ctx } = fakeCanvas();
    const frameImg = {} as HTMLImageElement;
    const photoImg = {} as HTMLImageElement;

    await renderPreview(
      canvas as any, frameImg, photoImg,
      { x: 0, y: 0, w: 50, h: 50 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 90, fontSize: 16, color: "#fff" }],
      { slogan: "Dream Big" },
    );

    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, photoImg, 0, 0, 100, 100);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, frameImg, 0, 0);
    expect(ctx.fillText).toHaveBeenCalledWith("Dream Big", 100, 180);
  });

  it("draws no text when overlayValues has no matching value", async () => {
    const { canvas, ctx } = fakeCanvas();

    await renderPreview(
      canvas as any, {} as HTMLImageElement, {} as HTMLImageElement,
      { x: 0, y: 0, w: 50, h: 50 },
      [{ key: "slogan", label: "S", labelEn: "S", type: "text", x: 50, y: 90, fontSize: 16, color: "#fff" }],
      {},
    );

    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/compositing/browser-compositor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `renderPreview`, reusing `resolveOverlayDraws` so preview and server never diverge**

```ts
// src/lib/compositing/browser-compositor.ts
import { resolveOverlayDraws, type TextOverlay } from "./overlay-layout";

export async function renderPreview(
  canvas: HTMLCanvasElement,
  frameImg: HTMLImageElement,
  photoImg: HTMLImageElement,
  photoArea: { x: number; y: number; w: number; h: number },
  overlays: TextOverlay[],
  overlayValues: Record<string, string>,
): Promise<void> {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const px = (photoArea.x / 100) * canvas.width;
  const py = (photoArea.y / 100) * canvas.height;
  const pw = (photoArea.w / 100) * canvas.width;
  const ph = (photoArea.h / 100) * canvas.height;
  ctx.drawImage(photoImg, px, py, pw, ph);

  ctx.drawImage(frameImg, 0, 0);

  const draws = resolveOverlayDraws(overlays, overlayValues, canvas.width, canvas.height);
  for (const draw of draws) {
    ctx.fillStyle = draw.color;
    ctx.font = `${draw.fontSize}px sans-serif`;
    ctx.fillText(draw.text, draw.x, draw.y);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/compositing/browser-compositor.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `src/app/c/[slug]/campaign-compositor.tsx` — the Client Component holding all interactive state**

```tsx
// src/app/c/[slug]/campaign-compositor.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { renderPreview } from "@/lib/compositing/browser-compositor";
import type { TextOverlay } from "@/lib/compositing/overlay-layout";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  // Loads frame + photo images only when the selection actually changes —
  // kept out of the render effect below so typing into an overlay input
  // does not re-fetch the frame image on every keystroke.
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
        <Label htmlFor="template-select">Chọn khung</Label>
        <Select onValueChange={id => setSelected(templates.find(t => t.id === id) ?? null)}>
          <SelectTrigger id="template-select">
            <SelectValue placeholder="Chọn khung" />
          </SelectTrigger>
          <SelectContent>
            {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
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

- [ ] **Step 6: Implement `src/app/c/[slug]/page.tsx` as a Server Component — fetches once during render, ships no client-side fetch waterfall**

```tsx
// src/app/c/[slug]/page.tsx
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

  return <CampaignCompositor templates={campaign.templates} />;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/c src/lib/compositing/browser-compositor.ts tests/lib/compositing/browser-compositor.test.ts
git commit -m "feat: add public campaign page with browser preview using shared overlay resolver

Splits fetch (Server Component page.tsx) from interactive state (Client
Component campaign-compositor.tsx) so the initial template list is
fetched during render instead of a client-side useEffect waterfall."
```

---

## Task 13: Admin UI — Campaign list + form

**Files:**
- Create: `src/app/admin/campaigns/page.tsx`
- Create: `src/app/admin/campaigns/campaign-form.tsx`
- Test: `tests/app/admin/campaign-form.test.tsx`

**Interfaces:**
- Consumes: `POST/GET/PATCH/DELETE /api/admin/campaigns` (Task 7).
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

## Task 14: Seed script for local dev

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `"prisma": { "seed": "tsx prisma/seed.ts" }`)
- Test: `tests/prisma/seed.test.ts`

**Interfaces:**
- Consumes: Prisma models (Task 1).
- Produces: `export async function seedDatabase(client: PrismaClient): Promise<void>`, invoked by `prisma/seed.ts` with the real client.

- [ ] **Step 1: Write the failing test**

```ts
// tests/prisma/seed.test.ts
import { describe, it, expect, vi } from "vitest";
import { seedDatabase } from "../../prisma/seed";

describe("seedDatabase", () => {
  it("creates the two demo campaigns with generic textOverlays, not fixed joinYear columns", async () => {
    const create = vi.fn().mockResolvedValue({});
    const fakeClient = { campaign: { create } } as any;

    await seedDatabase(fakeClient);

    expect(create).toHaveBeenCalledTimes(2);
    const firstCallData = create.mock.calls[0][0].data;
    expect(firstCallData.slug).toBe("fpt38");
    expect(firstCallData.templates.create[0].overlayConfig.textOverlays[0].key).toBe("joinYear");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prisma/seed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `prisma/seed.ts`**

```ts
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

export async function seedDatabase(client: PrismaClient) {
  await client.campaign.create({
    data: {
      slug: "fpt38",
      status: "active",
      startDate: new Date("2026-08-13"),
      endDate: new Date("2026-09-13"),
      language: "vi",
      displayConfig: { title: "FPT tròn 38 tuổi", description: "Tạo avatar kỷ niệm 38 năm", ctaLabel: "Tạo avatar ngay" },
      templates: {
        create: [{
          name: "Khung cam chuẩn",
          frameImageKey: "frames/fpt38-orange.png",
          overlayConfig: {
            photoArea: { x: 18, y: 14, w: 64, h: 64 },
            textOverlays: [
              { key: "joinYear", label: "Năm gia nhập FPT", labelEn: "Year joined FPT", type: "select", options: ["2020", "2021", "2022"], x: 50, y: 85, fontSize: 24, color: "#ffffff" },
            ],
          },
        }],
      },
    },
  });

  await client.campaign.create({
    data: {
      slug: "techweek-2026",
      status: "active",
      startDate: new Date("2026-08-20"),
      endDate: new Date("2026-08-28"),
      language: "vi",
      displayConfig: { title: "Ngày hội Công nghệ FPT 2026", description: "Ghép avatar cùng khung Tech Week", ctaLabel: "Tạo avatar ngay" },
      templates: {
        create: [{
          name: "Khung công nghệ xanh dương",
          frameImageKey: "frames/tw-blue.png",
          overlayConfig: {
            photoArea: { x: 16, y: 18, w: 68, h: 68 },
            textOverlays: [
              { key: "unit", label: "Đơn vị công tác", labelEn: "Business unit", type: "select", options: ["FPT Software", "FPT Telecom", "FPT IS"], x: 50, y: 88, fontSize: 20, color: "#ffffff" },
            ],
          },
        }],
      },
    },
  });
}

if (require.main === module) {
  const client = new PrismaClient();
  seedDatabase(client).finally(() => client.$disconnect());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prisma/seed.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the seed command and install `tsx`**

```bash
npm install -D tsx
```

```json
// package.json — add
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts tests/prisma/seed.test.ts package.json package-lock.json
git commit -m "feat: add local dev seed script with generic textOverlays sample data"
```

---

## Task 15: Docker image (single image for K8s and Azure Container Apps)

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.dev.yml` (Postgres + MinIO for local dev)
- Test: none (infra-only task, verified by manual build below — not a code-testable unit)

**Interfaces:**
- Consumes: nothing new — packages the app built in Tasks 1–14.
- Produces: one Docker image, environment-selected storage/DB, matching spec §9's "one image, env-var-only difference" constraint.

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
# node-canvas needs Cairo/Pango at build time on Alpine.
RUN apk add --no-cache build-base cairo-dev pango-dev giflib-dev
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache cairo pango giflib
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 2: Write `docker-compose.dev.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: avatar_platform
    ports: ["5432:5432"]
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
```

- [ ] **Step 3: Build the image locally to verify it compiles**

Run: `docker build -t avatar-platform:local .`
Expected: build succeeds with exit code 0.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.dev.yml
git commit -m "chore: add single Dockerfile and local dev compose (Postgres + MinIO)"
```

---

## Bước tiếp theo (ngoài phạm vi các task ở trên — theo spec §11 và báo cáo §7)

- Chạy load test đa-Campaign (k6, ≥2 Campaign active song song) trên môi trường giống production trước khi chạy Campaign thật đầu tiên — việc vận hành, do Team kỹ thuật thực hiện sau khi Task 1–15 xong, không phải một task viết code.
- Viết manifest Kubernetes/Azure Container Apps thật — chờ xác nhận văn bản mục tiêu dual-deploy (gate ở Task 15 phạm vi, xác nhận bởi Chủ dự án).
- Chốt chính sách retention/cleanup ảnh bằng con số cụ thể rồi mới viết task storage lifecycle.
- Notification bell + analytics dashboard (kế thừa từ demo) — spec/plan riêng.
