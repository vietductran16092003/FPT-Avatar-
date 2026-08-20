# Task 1 & 2: Scaffold and Image Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js 14 project skeleton with its Prisma schema, and build the `ImageStorage` abstraction (MinIO adapter) that every later task reads/writes images through — the two foundation tasks every other task in the platform depends on.

**Architecture:** A single Next.js 14 (App Router, TypeScript) app scaffolded with Prisma + PostgreSQL for the `User`/`Campaign`/`Template`/`GeneratedAvatar` model. Image reads/writes go through one `ImageStorage` interface with a single MinIO adapter for now (the Azure Blob adapter is a separate later task) — the interface is deliberately widened in this plan (vs. the original draft) to include a `download` method, because a later task (server-side avatar generation) needs to read an image's bytes back out of storage without an extra HTTP round-trip.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Prisma + PostgreSQL, `@aws-sdk/client-s3` (MinIO-compatible), Vitest.

**Spec:** [docs/superpowers/specs/2026-08-20-campaign-platform-nextjs-design.md](../specs/2026-08-20-campaign-platform-nextjs-design.md)

## Global Constraints

- No field is hard-coded onto `Campaign` or `Template` for a specific event concept (e.g. no `joinYears` column) — all per-event text fields live in `Template.overlayConfig.textOverlays[]` (spec §3).
- All image reads/writes go through the one `ImageStorage` interface (`upload`/`download`/`getPublicUrl`/`delete`); switching MinIO ⇄ Azure Blob is an env var change only (spec §4, §9). No other module in the app is allowed to import an S3/Blob SDK directly.
- `ImageStorage.getPublicUrl()` assumes the underlying bucket/container is configured for public-read access. This plan does not implement signed/expiring URLs — if a later deployment requires a private bucket, `getPublicUrl()`'s contract changes (likely to `Promise<string>` for a signed URL) and every adapter must be revisited together, not one at a time. Record this assumption in `.env.example` as a comment so it is not silently violated during ops setup.
- Deleting a `Campaign` that still has `Template` rows cascades and deletes those `Template` rows (Prisma `onDelete: Cascade`). Deleting a `Campaign` or `Template` that still has `GeneratedAvatar` rows referencing it is **blocked at the database level** (Prisma's default referential action for a required relation is `Restrict`) — the delete throws a foreign-key violation rather than silently orphaning history. Handling that error into a clean HTTP response (e.g. 409) is the job of the admin delete route, out of scope for this plan.

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

  // Matches the exact filter GET /api/campaigns uses (status + date-range
  // lookup on every public home-page load) — without this, Postgres falls
  // back to a full table scan of Campaign on that hot path.
  @@index([status, startDate, endDate])
}

model Template {
  id            String            @id @default(cuid())
  campaignId    String
  // Deleting a Campaign cascades to its Templates. If any of those
  // Templates still has a GeneratedAvatar, the cascade fails with a
  // foreign-key violation (GeneratedAvatar.templateId has no onDelete
  // override, so Prisma's default Restrict applies) instead of silently
  // deleting a Template that generation history still points to.
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

  it("indexes Campaign on status + startDate + endDate for the active-campaign lookup", () => {
    const campaignModel = Prisma.dmmf.datamodel.models.find(m => m.name === "Campaign")!;
    const index = campaignModel.uniqueIndexes.concat(
      (campaignModel as any).indexes ?? []
    ).find((idx: any) => JSON.stringify(idx.fields) === JSON.stringify(["status", "startDate", "endDate"]));
    expect(index).toBeDefined();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails (Prisma client not generated yet)**

Run: `npx vitest run tests/prisma-schema.test.ts`
Expected: FAIL — `@prisma/client` has no generated `Prisma.dmmf` yet, or import error.

- [ ] **Step 6: Generate the Prisma client and run test to verify it passes**

Run: `npx prisma generate && npx vitest run tests/prisma-schema.test.ts`
Expected: PASS

- [ ] **Step 7: Add the public-read bucket assumption to `.env.example`**

```bash
# .env.example — append
# ImageStorage.getPublicUrl() assumes this bucket/container allows public
# read access. If your MinIO/Azure Blob setup uses a private bucket,
# getPublicUrl() will return a URL that does not resolve — do not point
# STORAGE_PROVIDER at a private bucket without revisiting the storage
# adapters (see Global Constraints in docs/superpowers/plans/2026-08-20-scaffold-and-storage.md).
STORAGE_PROVIDER=minio
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=avatars
MINIO_PUBLIC_URL=http://localhost:9000
```

- [ ] **Step 8: Commit**

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
- Produces: `interface ImageStorage { upload(key: string, buffer: Buffer, contentType: string): Promise<void>; download(key: string): Promise<Buffer>; getPublicUrl(key: string): string; delete(key: string): Promise<void>; }` in `src/lib/storage/types.ts`. `download` exists so a later task (server-side avatar generation) can read an object's bytes straight from storage instead of doing an HTTP round-trip through `getPublicUrl()`.
- Produces: `export function getStorage(): ImageStorage` in `src/lib/storage/index.ts`, selecting adapter by `process.env.STORAGE_PROVIDER`.
- Consumes: none (foundation task).

- [ ] **Step 1: Write `src/lib/storage/types.ts`**

```ts
export interface ImageStorage {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
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

  it("downloads an object's bytes via the injected S3 client", async () => {
    const fakeBody = {
      transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    };
    const send = vi.fn().mockResolvedValue({ Body: fakeBody });
    const storage = new MinioStorage({ send } as any, "avatars", "http://localhost:9000");

    const result = await storage.download("templates/frame.png");

    expect(send).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(Array.from(result)).toEqual([1, 2, 3]);
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
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

  async download(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await (result.Body as any).transformToByteArray();
    return Buffer.from(bytes);
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

- [ ] **Step 6: Write `src/lib/storage/index.ts` — the env-driven factory (Azure Blob branch is a separate later task; unknown provider throws)**

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
git commit -m "feat: add ImageStorage interface (upload/download/getPublicUrl/delete) with MinIO adapter"
```