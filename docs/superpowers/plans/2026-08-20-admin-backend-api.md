# Admin Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Express + TypeScript backend API for the Avatar Frame Platform admin (campaigns/templates/notifications/analytics/avatar generation), backed by PostgreSQL, and rewire the existing vanilla-JS FE (`FE/js/core/store.js`) to call it instead of `localStorage`.

**Architecture:** One Express service (`server/`) sitting next to the existing `FE/` folder. Prisma/PostgreSQL for persistence, an S3-compatible storage abstraction (MinIO for dev) for frame images and generated avatars, JWT for admin auth. The FE keeps its current file structure and method names — only the bodies of `AppStore` methods change from sync localStorage reads/writes to async `fetch()` calls, and callers gain `await`.

**Tech Stack:** Node.js 20 + Express + TypeScript, Prisma ORM + PostgreSQL, `@aws-sdk/client-s3` (MinIO-compatible), `sharp` (server-side image compositing), `jsonwebtoken` + `bcryptjs` (auth), `multer` (multipart uploads), Vitest + Supertest (tests).

**Spec:** [docs/superpowers/specs/2026-08-20-admin-backend-api-design.md](../specs/2026-08-20-admin-backend-api-design.md)

## Global Constraints

- Server never accepts a pre-composited image as the official result — only the original photo + component values; server always re-composites itself (spec §4, §7).
- All image reads/writes go through one storage interface (`upload`/`getPublicUrl`/`delete`); switching MinIO ⇄ another S3-compatible provider must be an env var change only (spec §7).
- `downloadCount` must carry forward when a campaign's slug is renamed (spec §7, matches current `store.js` behavior).
- No queue/worker infrastructure — requests are handled synchronously on the web tier (spec §7).
- FE method signatures in `store.js` (`saveCampaign`, `deleteCampaign`, `saveTemplate`, `deleteTemplate`, `recordDownload`, `addNotification`, `markAllRead`, `deleteNotification`, `clearNotifications`, `cycleCampaignStatus`, `findCampaign`) must be preserved; only their implementations change (spec §6).
- Admin JWT is stored under a storage key separate from `STORAGE_KEY` (`afp_platform_v2`) so it doesn't collide with existing persisted app state (spec §6).

---

## Task 1: Scaffold Express + TypeScript project with local Postgres/MinIO dev stack

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/.env.example`
- Create: `server/docker-compose.yml`
- Create: `server/src/app.ts`, `server/src/index.ts`
- Create: `server/vitest.config.ts`
- Test: `server/tests/smoke.test.ts`

**Interfaces:**
- Produces: an Express app exported as `export function createApp(): Express` from `server/src/app.ts`, and a running dev server on `PORT` (default `4000`) started by `server/src/index.ts`. Later tasks mount routers onto `createApp()`'s return value. `docker-compose up -d` exposes Postgres on `5432` and MinIO on `9000`/`9001`.

- [ ] **Step 1: Init the Node project**

```bash
mkdir server
cd server
npm init -y
npm install express cors dotenv
npm install -D typescript tsx @types/node @types/express @types/cors vitest supertest @types/supertest
npx tsc --init --target ES2022 --module commonjs --outDir dist --rootDir src --strict --esModuleInterop --skipLibCheck --resolveJsonModule
```

- [ ] **Step 2: Add `package.json` scripts**

Edit `server/package.json`, add under `"scripts"`:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Write the failing smoke test**

`server/tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("app scaffold", () => {
  it("responds to GET /health with 200", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

`server/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — `../src/app` has no exported member `createApp` (file doesn't exist yet).

- [ ] **Step 5: Implement `app.ts` and `index.ts`**

`server/src/app.ts`:
```ts
import express, { Express } from "express";
import cors from "cors";

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
```

`server/src/index.ts`:
```ts
import "dotenv/config";
import { createApp } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`Admin backend API listening on :${port}`);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test`
Expected: PASS

- [ ] **Step 7: Add `.env.example` and `docker-compose.yml`**

`server/.env.example`:
```bash
PORT=4000
DATABASE_URL="postgresql://afp:afp@localhost:5432/afp_admin"

STORAGE_PROVIDER="minio"
MINIO_ENDPOINT="http://localhost:9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="afp-admin"

JWT_SECRET="dev-secret-change-me"
```

`server/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: afp
      POSTGRES_PASSWORD: afp
      POSTGRES_DB: afp_admin
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 8: Start the stack and verify manually**

Run: `cd server && docker-compose up -d && cp .env.example .env && npm run dev`
Expected: console prints `Admin backend API listening on :4000`; `curl http://localhost:4000/health` returns `{"ok":true}`.

- [ ] **Step 9: Commit**

```bash
git add server
git commit -m "chore: scaffold Express admin backend with Postgres/MinIO dev stack"
```

---

## Task 2: Prisma schema (AdminUser, Campaign, Template, GeneratedAvatar, Notification)

**Files:**
- Create: `server/prisma/schema.prisma`
- Create: `server/src/db.ts`
- Create: `server/prisma/seed.ts`
- Test: `server/tests/db/schema.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` from `.env` (Task 1).
- Produces: Prisma Client types `AdminUser`, `Campaign`, `Template`, `GeneratedAvatar`, `Notification` importable from `@prisma/client`, and a singleton `export const prisma: PrismaClient` from `server/src/db.ts`. All later DB access goes through this singleton.

- [ ] **Step 1: Install Prisma**

```bash
cd server
npm install prisma @prisma/client
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Write the schema**

`server/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model AdminUser {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

model Campaign {
  id            String            @id @default(cuid())
  slug          String            @unique
  status        String            @default("draft")
  startDate     DateTime
  endDate       DateTime
  title         String
  titleEn       String
  description   String            @default("")
  descriptionEn String            @default("")
  cta           String            @default("Tạo avatar ngay")
  ctaEn         String            @default("Create your avatar")
  badge         String            @default("NEW")
  language      String            @default("vi")
  downloadCount Int               @default(0)
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
  photoArea     Json
  components    Json
  avatars       GeneratedAvatar[]
  createdAt     DateTime          @default(now())
}

model GeneratedAvatar {
  id              String   @id @default(cuid())
  campaignId      String
  campaign        Campaign @relation(fields: [campaignId], references: [id])
  templateId      String
  template        Template @relation(fields: [templateId], references: [id])
  componentValues Json
  resultImageKey  String
  createdAt       DateTime @default(now())
}

model Notification {
  id        String   @id @default(cuid())
  vi        String
  en        String
  type      String   @default("info")
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Write the failing schema test**

`server/tests/db/schema.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../../src/db";

describe("prisma schema", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("can create and read a Campaign", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        slug: "test-campaign",
        status: "active",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        title: "Test",
        titleEn: "Test",
      },
    });
    const found = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(found?.slug).toBe("test-campaign");
    await prisma.campaign.delete({ where: { id: campaign.id } });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npm test -- tests/db/schema.test.ts`
Expected: FAIL — `../../src/db` does not exist.

- [ ] **Step 5: Implement the Prisma client singleton**

`server/src/db.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 6: Run migration and re-run the test**

```bash
cd server
npx prisma migrate dev --name init
npm test -- tests/db/schema.test.ts
```
Expected: PASS

- [ ] **Step 7: Write the seed script**

`server/prisma/seed.ts`:
```ts
import bcrypt from "bcryptjs";
import { prisma } from "../src/db";

async function main() {
  const passwordHash = await bcrypt.hash("changeme123", 10);
  await prisma.adminUser.upsert({
    where: { email: "admin@fpt.com" },
    update: {},
    create: { email: "admin@fpt.com", passwordHash },
  });

  const campaign = await prisma.campaign.upsert({
    where: { slug: "fpt38" },
    update: {},
    create: {
      slug: "fpt38",
      status: "active",
      startDate: new Date("2026-08-13"),
      endDate: new Date("2026-09-13"),
      title: "FPT tròn 38 tuổi",
      titleEn: "FPT Turns 38",
      description: "Tạo avatar kỷ niệm hành trình 38 năm và chia sẻ lên mạng xã hội của bạn.",
      descriptionEn: "Create your anniversary avatar and share it on social media.",
      badge: "38",
      language: "vi",
    },
  });

  console.log("Seeded admin user admin@fpt.com and campaign:", campaign.slug);
}

main().finally(() => prisma.$disconnect());
```

Install bcryptjs and tsx-based seed runner:
```bash
cd server
npm install bcryptjs
npm install -D @types/bcryptjs tsx
```

Add to `server/package.json`:
```json
{
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

- [ ] **Step 8: Run the seed and verify**

Run: `cd server && npx prisma db seed`
Expected: prints `Seeded admin user admin@fpt.com and campaign: fpt38`

- [ ] **Step 9: Commit**

```bash
git add server
git commit -m "feat: add Prisma schema for AdminUser/Campaign/Template/GeneratedAvatar/Notification"
```

---

## Task 3: Storage abstraction (S3-compatible / MinIO)

**Files:**
- Create: `server/src/storage/types.ts`
- Create: `server/src/storage/minio-adapter.ts`
- Create: `server/src/storage/index.ts`
- Test: `server/tests/storage/minio-adapter.test.ts`

**Interfaces:**
- Consumes: env vars `STORAGE_PROVIDER`, `MINIO_*` (Task 1).
- Produces: `export interface StorageAdapter { upload(key: string, body: Buffer, contentType: string): Promise<string>; getPublicUrl(key: string): Promise<string>; delete(key: string): Promise<void>; }` and `export function getStorage(): StorageAdapter` from `server/src/storage/index.ts`. Tasks 6 and 8 only ever call `getStorage()`.

- [ ] **Step 1: Define the interface**

`server/src/storage/types.ts`:
```ts
export interface StorageAdapter {
  upload(key: string, body: Buffer, contentType: string): Promise<string>;
  getPublicUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test (requires `docker-compose up` from Task 1)**

`server/tests/storage/minio-adapter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MinioAdapter } from "../../src/storage/minio-adapter";

describe("MinioAdapter", () => {
  const adapter = new MinioAdapter({
    endpoint: "http://localhost:9000",
    accessKey: "minioadmin",
    secretKey: "minioadmin",
    bucket: "afp-admin-test",
  });

  it("uploads a buffer and returns a public URL containing the key", async () => {
    const key = `test/${Date.now()}.txt`;
    await adapter.upload(key, Buffer.from("hello"), "text/plain");
    const url = await adapter.getPublicUrl(key);
    expect(url).toContain(key);
    await adapter.delete(key);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npm test -- tests/storage/minio-adapter.test.ts`
Expected: FAIL — `MinioAdapter` module doesn't exist.

- [ ] **Step 4: Install AWS SDK and implement the adapter**

```bash
cd server
npm install @aws-sdk/client-s3
```

`server/src/storage/minio-adapter.ts`:
```ts
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./types";

export class MinioAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private endpoint: string;

  constructor(config: { endpoint: string; accessKey: string; secretKey: string; bucket: string }) {
    this.endpoint = config.endpoint;
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType })
    );
    return key;
  }

  async getPublicUrl(key: string): Promise<string> {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- tests/storage/minio-adapter.test.ts`
Expected: PASS

- [ ] **Step 6: Write the factory**

`server/src/storage/index.ts`:
```ts
import { MinioAdapter } from "./minio-adapter";
import type { StorageAdapter } from "./types";

let cached: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (cached) return cached;

  cached = new MinioAdapter({
    endpoint: process.env.MINIO_ENDPOINT!,
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
    bucket: process.env.MINIO_BUCKET!,
  });
  return cached;
}
```

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat: add S3-compatible storage abstraction (MinIO adapter)"
```

---

## Task 4: Auth — JWT login + admin-guard middleware

**Files:**
- Create: `server/src/auth.ts`
- Create: `server/src/routes/auth.ts`
- Test: `server/tests/auth/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), env var `JWT_SECRET` (Task 1).
- Produces: `export async function login(email: string, password: string): Promise<string | null>` (returns a JWT or `null` on bad credentials) and `export function requireAdmin(req, res, next)` Express middleware from `server/src/auth.ts`. Every admin route in Tasks 5/6/9/10 uses `requireAdmin`.

- [ ] **Step 1: Install auth deps**

```bash
cd server
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

- [ ] **Step 2: Write the failing test**

`server/tests/auth/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../src/db";
import { login } from "../../src/auth";

describe("login", () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("secret123", 10);
    await prisma.adminUser.create({ data: { email: "auth-test@fpt.com", passwordHash } });
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: "auth-test@fpt.com" } });
    await prisma.$disconnect();
  });

  it("returns a valid JWT for correct credentials", async () => {
    const token = await login("auth-test@fpt.com", "secret123");
    expect(token).not.toBeNull();
    const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string) as { email: string };
    expect(decoded.email).toBe("auth-test@fpt.com");
  });

  it("returns null for wrong password", async () => {
    const token = await login("auth-test@fpt.com", "wrong-password");
    expect(token).toBeNull();
  });

  it("returns null for unknown email", async () => {
    const token = await login("nobody@fpt.com", "secret123");
    expect(token).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npm test -- tests/auth/auth.test.ts`
Expected: FAIL — `../../src/auth` does not exist.

- [ ] **Step 4: Implement `auth.ts`**

`server/src/auth.ts`:
```ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db";

export async function login(email: string, password: string): Promise<string | null> {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return jwt.sign({ email: user.email, sub: user.id }, process.env.JWT_SECRET as string, {
    expiresIn: "8h",
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const token = header.slice("Bearer ".length);
  try {
    jwt.verify(token, process.env.JWT_SECRET as string);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- tests/auth/auth.test.ts`
Expected: PASS

- [ ] **Step 6: Add the login route**

`server/src/routes/auth.ts`:
```ts
import { Router } from "express";
import { login } from "../auth";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const token = await login(email, password);
  if (!token) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token });
});
```

Mount it in `server/src/app.ts` — add inside `createApp()`, after the `/health` route:
```ts
import { authRouter } from "./routes/auth";
// ...
app.use("/api/auth", authRouter);
```

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat: add JWT login and requireAdmin middleware"
```

---

## Task 5: Admin Campaign CRUD API

**Files:**
- Create: `server/src/campaigns.ts` (shared logic used by both admin and public routes)
- Create: `server/src/routes/admin-campaigns.ts`
- Create: `server/src/routes/campaigns.ts` (public)
- Test: `server/tests/campaigns.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `requireAdmin` (Task 4).
- Produces: `createCampaign`, `listActiveCampaigns`, `findCampaignBySlug`, `updateCampaign`, `deleteCampaign`, `cycleCampaignStatus` from `server/src/campaigns.ts`. Task 6 reads `campaignId` from a created Campaign's `id`. Task 8 reads `Campaign` fields via `findCampaignBySlug`.

- [ ] **Step 1: Write the failing test for the shared logic**

`server/tests/campaigns.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../src/db";
import { createCampaign, listActiveCampaigns, cycleCampaignStatus } from "../src/campaigns";

describe("campaigns logic", () => {
  afterEach(async () => {
    await prisma.campaign.deleteMany({ where: { slug: { startsWith: "test-" } } });
  });

  it("creates a campaign with defaults", async () => {
    const c = await createCampaign({
      slug: "test-a",
      title: "Test A",
      titleEn: "Test A",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    });
    expect(c.status).toBe("draft");
    expect(c.language).toBe("vi");
  });

  it("lists ALL active campaigns whose date range includes today, supporting concurrent campaigns", async () => {
    const now = new Date();
    const range = { startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000) };

    await createCampaign({ slug: "test-active-a", title: "A", titleEn: "A", status: "active", ...range });
    await createCampaign({ slug: "test-active-b", title: "B", titleEn: "B", status: "active", ...range });
    await createCampaign({ slug: "test-draft-in-range", title: "D", titleEn: "D", status: "draft", ...range });

    const active = await listActiveCampaigns();
    const slugs = active.map((c) => c.slug);
    expect(slugs).toContain("test-active-a");
    expect(slugs).toContain("test-active-b");
    expect(slugs).not.toContain("test-draft-in-range");
  });

  it("cycles status draft -> active -> archived -> draft", async () => {
    const c = await createCampaign({
      slug: "test-cycle",
      title: "Cycle",
      titleEn: "Cycle",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    });
    const step1 = await cycleCampaignStatus(c.slug);
    expect(step1?.status).toBe("active");
    const step2 = await cycleCampaignStatus(c.slug);
    expect(step2?.status).toBe("archived");
    const step3 = await cycleCampaignStatus(c.slug);
    expect(step3?.status).toBe("draft");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/campaigns.test.ts`
Expected: FAIL — `../src/campaigns` does not exist.

- [ ] **Step 3: Implement `server/src/campaigns.ts`**

```ts
import { prisma } from "./db";
import type { Campaign } from "@prisma/client";

const STATUS_ORDER = ["draft", "active", "archived"] as const;

export async function createCampaign(input: {
  slug: string;
  title: string;
  titleEn: string;
  startDate: Date;
  endDate: Date;
  status?: "draft" | "active" | "archived";
  language?: "vi" | "en";
  description?: string;
  descriptionEn?: string;
  cta?: string;
  ctaEn?: string;
  badge?: string;
}): Promise<Campaign> {
  return prisma.campaign.create({
    data: {
      slug: input.slug,
      title: input.title,
      titleEn: input.titleEn,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? "draft",
      language: input.language ?? "vi",
      description: input.description ?? "",
      descriptionEn: input.descriptionEn ?? "",
      cta: input.cta ?? "Tạo avatar ngay",
      ctaEn: input.ctaEn ?? "Create your avatar",
      badge: input.badge ?? "NEW",
    },
  });
}

export async function listActiveCampaigns(): Promise<Campaign[]> {
  const now = new Date();
  return prisma.campaign.findMany({
    where: { status: "active", startDate: { lte: now }, endDate: { gte: now } },
    include: { templates: true },
    orderBy: { startDate: "desc" },
  });
}

export async function findCampaignBySlug(slug: string) {
  return prisma.campaign.findUnique({ where: { slug }, include: { templates: true } });
}

export async function updateCampaign(slug: string, patch: Partial<{
  slug: string; title: string; titleEn: string; startDate: Date; endDate: Date;
  status: string; language: string; description: string; descriptionEn: string;
  cta: string; ctaEn: string; badge: string;
}>): Promise<Campaign> {
  return prisma.campaign.update({ where: { slug }, data: patch });
}

export async function deleteCampaign(slug: string): Promise<Campaign> {
  return prisma.campaign.delete({ where: { slug } });
}

export async function cycleCampaignStatus(slug: string): Promise<Campaign | null> {
  const c = await prisma.campaign.findUnique({ where: { slug } });
  if (!c) return null;
  const next = STATUS_ORDER[(STATUS_ORDER.indexOf(c.status as typeof STATUS_ORDER[number]) + 1) % STATUS_ORDER.length];
  return prisma.campaign.update({ where: { slug }, data: { status: next } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- tests/campaigns.test.ts`
Expected: PASS

- [ ] **Step 5: Admin routes**

`server/src/routes/admin-campaigns.ts`:
```ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAdmin } from "../auth";
import { createCampaign, updateCampaign, deleteCampaign, cycleCampaignStatus } from "../campaigns";

export const adminCampaignsRouter = Router();
adminCampaignsRouter.use(requireAdmin);

adminCampaignsRouter.get("/", async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({ orderBy: { startDate: "desc" } });
  res.json(campaigns);
});

adminCampaignsRouter.post("/", async (req, res) => {
  const body = req.body;
  const campaign = await createCampaign({
    slug: body.slug,
    title: body.title,
    titleEn: body.titleEn,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    status: body.status,
    language: body.language,
    description: body.description,
    descriptionEn: body.descriptionEn,
    cta: body.cta,
    ctaEn: body.ctaEn,
    badge: body.badge,
  });
  res.status(201).json(campaign);
});

adminCampaignsRouter.patch("/:slug", async (req, res) => {
  const campaign = await updateCampaign(req.params.slug, req.body);
  res.json(campaign);
});

adminCampaignsRouter.delete("/:slug", async (req, res) => {
  await deleteCampaign(req.params.slug);
  res.json({ ok: true });
});

adminCampaignsRouter.post("/:slug/cycle-status", async (req, res) => {
  const campaign = await cycleCampaignStatus(req.params.slug);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  res.json(campaign);
});
```

`server/src/routes/campaigns.ts`:
```ts
import { Router } from "express";
import { listActiveCampaigns, findCampaignBySlug } from "../campaigns";

export const campaignsRouter = Router();

campaignsRouter.get("/", async (_req, res) => {
  const campaigns = await listActiveCampaigns();
  res.json(campaigns);
});

campaignsRouter.get("/:slug", async (req, res) => {
  const campaign = await findCampaignBySlug(req.params.slug);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  res.json(campaign);
});
```

Mount both in `server/src/app.ts`, after the auth router:
```ts
import { adminCampaignsRouter } from "./routes/admin-campaigns";
import { campaignsRouter } from "./routes/campaigns";
// ...
app.use("/api/admin/campaigns", adminCampaignsRouter);
app.use("/api/campaigns", campaignsRouter);
```

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat: add admin and public Campaign CRUD routes"
```

---

## Task 6: Admin Template CRUD API (frame image upload)

**Files:**
- Create: `server/src/templates.ts`
- Create: `server/src/routes/admin-templates.ts`
- Test: `server/tests/templates.test.ts`

**Interfaces:**
- Consumes: `getStorage()` (Task 3), `prisma` (Task 2), `requireAdmin` (Task 4).
- Produces: `createTemplate`, `updateTemplate`, `deleteTemplate` from `server/src/templates.ts`. `photoArea` shape `{ x: number; y: number; w: number; h: number }` and `components` shape `string[]` (values from `COMPONENT_DEFS` keys: `joinYear`/`unit`/`slogan`/`signature`) match exactly what [FE/js/config/constants.js](../../../FE/js/config/constants.js) already defines — Task 8's compositor and the FE's `saveTemplate` payload both use this shape.

- [ ] **Step 1: Write the failing test**

`server/tests/templates.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../src/db";
import { createCampaign } from "../src/campaigns";
import { createTemplate } from "../src/templates";

describe("templates logic", () => {
  afterEach(async () => {
    await prisma.template.deleteMany({ where: { name: { startsWith: "Test " } } });
    await prisma.campaign.deleteMany({ where: { slug: { startsWith: "test-tpl-" } } });
  });

  it("creates a template with photoArea and components", async () => {
    const campaign = await createCampaign({
      slug: "test-tpl-campaign",
      title: "T",
      titleEn: "T",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    });

    const template = await createTemplate({
      campaignId: campaign.id,
      name: "Test Template A",
      imageBuffer: Buffer.from("fake-png-bytes"),
      photoArea: { x: 18, y: 14, w: 64, h: 64 },
      components: ["joinYear", "slogan"],
    });

    expect(template.campaignId).toBe(campaign.id);
    expect(template.components).toEqual(["joinYear", "slogan"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/templates.test.ts`
Expected: FAIL — `../src/templates` does not exist.

- [ ] **Step 3: Implement `server/src/templates.ts`**

```ts
import { prisma } from "./db";
import { getStorage } from "./storage";
import type { Template } from "@prisma/client";

export interface PhotoArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function createTemplate(input: {
  campaignId: string;
  name: string;
  imageBuffer: Buffer;
  photoArea: PhotoArea;
  components: string[];
}): Promise<Template> {
  const key = `frames/${input.campaignId}/${Date.now()}-${input.name.replace(/\s+/g, "-")}.png`;
  await getStorage().upload(key, input.imageBuffer, "image/png");
  return prisma.template.create({
    data: {
      campaignId: input.campaignId,
      name: input.name,
      frameImageKey: key,
      photoArea: input.photoArea as unknown as object,
      components: input.components as unknown as object,
    },
  });
}

export async function updateTemplate(id: string, patch: Partial<{
  name: string; photoArea: PhotoArea; components: string[];
}>): Promise<Template> {
  return prisma.template.update({
    where: { id },
    data: patch as unknown as Record<string, unknown>,
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return;
  await getStorage().delete(template.frameImageKey);
  await prisma.template.delete({ where: { id } });
}
```

- [ ] **Step 4: Run test to verify it passes (requires MinIO running from Task 1)**

Run: `cd server && npm test -- tests/templates.test.ts`
Expected: PASS

- [ ] **Step 5: Install multer and add the admin route**

```bash
cd server
npm install multer
npm install -D @types/multer
```

`server/src/routes/admin-templates.ts`:
```ts
import { Router } from "express";
import multer from "multer";
import { requireAdmin } from "../auth";
import { createTemplate, updateTemplate, deleteTemplate } from "../templates";

const upload = multer({ storage: multer.memoryStorage() });

export const adminTemplatesRouter = Router();
adminTemplatesRouter.use(requireAdmin);

adminTemplatesRouter.post("/", upload.single("image"), async (req, res) => {
  const { campaignId, name } = req.body as { campaignId: string; name: string };
  const photoArea = JSON.parse(req.body.photoArea);
  const components = JSON.parse(req.body.components);
  if (!req.file) return res.status(400).json({ error: "image file is required" });

  const template = await createTemplate({
    campaignId,
    name,
    imageBuffer: req.file.buffer,
    photoArea,
    components,
  });
  res.status(201).json(template);
});

adminTemplatesRouter.patch("/:id", async (req, res) => {
  const template = await updateTemplate(req.params.id, req.body);
  res.json(template);
});

adminTemplatesRouter.delete("/:id", async (req, res) => {
  await deleteTemplate(req.params.id);
  res.json({ ok: true });
});
```

Mount it in `server/src/app.ts`:
```ts
import { adminTemplatesRouter } from "./routes/admin-templates";
// ...
app.use("/api/admin/templates", adminTemplatesRouter);
```

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat: add admin Template CRUD with frame image upload"
```

---

## Task 7: Notifications API

**Files:**
- Create: `server/src/routes/admin-notifications.ts`
- Test: `server/tests/notifications.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `requireAdmin` (Task 4).
- Produces: routes `GET/DELETE /api/admin/notifications`, `PATCH /api/admin/notifications/read-all`. No other task depends on this one's internals.

- [ ] **Step 1: Write the failing test**

`server/tests/notifications.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const token = () => jwt.sign({ email: "t@fpt.com" }, process.env.JWT_SECRET as string);

describe("admin notifications routes", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists notifications newest first", async () => {
    await prisma.notification.create({ data: { vi: "Cũ", en: "Old", type: "info" } });
    await prisma.notification.create({ data: { vi: "Mới", en: "New", type: "info" } });

    const res = await request(createApp())
      .get("/api/admin/notifications")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body[0].vi).toBe("Mới");
  });

  it("marks all as read", async () => {
    await prisma.notification.create({ data: { vi: "A", en: "A", type: "info" } });

    const res = await request(createApp())
      .patch("/api/admin/notifications/read-all")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    const all = await prisma.notification.findMany();
    expect(all.every((n) => n.read)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/notifications.test.ts`
Expected: FAIL — route `/api/admin/notifications` returns 404.

- [ ] **Step 3: Implement the route**

`server/src/routes/admin-notifications.ts`:
```ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAdmin } from "../auth";

export const adminNotificationsRouter = Router();
adminNotificationsRouter.use(requireAdmin);

adminNotificationsRouter.get("/", async (_req, res) => {
  const notifications = await prisma.notification.findMany({ orderBy: { createdAt: "desc" } });
  res.json(notifications);
});

adminNotificationsRouter.patch("/read-all", async (_req, res) => {
  await prisma.notification.updateMany({ data: { read: true } });
  res.json({ ok: true });
});

adminNotificationsRouter.delete("/:id", async (req, res) => {
  await prisma.notification.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

adminNotificationsRouter.delete("/", async (_req, res) => {
  await prisma.notification.deleteMany({});
  res.json({ ok: true });
});
```

Mount it in `server/src/app.ts`:
```ts
import { adminNotificationsRouter } from "./routes/admin-notifications";
// ...
app.use("/api/admin/notifications", adminNotificationsRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- tests/notifications.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: add admin notifications routes"
```

---

## Task 8: Avatar generation — mandatory server-side re-composite

**Files:**
- Create: `server/src/compositor.ts`
- Create: `server/src/routes/generate.ts`
- Test: `server/tests/compositor.test.ts`, `server/tests/generate.test.ts`

**Interfaces:**
- Consumes: `findCampaignBySlug` (Task 5), `getStorage()` (Task 3), `prisma` (Task 2).
- Produces: `export async function compositeAvatar(photoBuffer: Buffer, framePngBuffer: Buffer, photoArea: PhotoArea): Promise<Buffer>` from `server/src/compositor.ts` (returns a composited PNG buffer). Route `POST /api/campaigns/:slug/generate`.

- [ ] **Step 1: Install sharp**

```bash
cd server
npm install sharp
```

- [ ] **Step 2: Write the failing compositor test**

`server/tests/compositor.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { compositeAvatar } from "../src/compositor";

describe("compositeAvatar", () => {
  it("returns a PNG buffer sized to the frame image, not the raw photo", async () => {
    const frame = await sharp({
      create: { width: 500, height: 500, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const photo = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();

    const result = await compositeAvatar(photo, frame, { x: 10, y: 10, w: 80, h: 80 });
    const meta = await sharp(result).metadata();

    expect(meta.width).toBe(500);
    expect(meta.height).toBe(500);
    expect(meta.format).toBe("png");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npm test -- tests/compositor.test.ts`
Expected: FAIL — `../src/compositor` does not exist.

- [ ] **Step 4: Implement `server/src/compositor.ts`**

`photoArea` values are percentages of the frame's width/height (matching the existing FE convention in `store.js`'s `templates[].photoArea`, e.g. `{ x: 18, y: 14, w: 64, h: 64 }`).

```ts
import sharp from "sharp";

export interface PhotoArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function compositeAvatar(
  photoBuffer: Buffer,
  framePngBuffer: Buffer,
  photoArea: PhotoArea
): Promise<Buffer> {
  const frameMeta = await sharp(framePngBuffer).metadata();
  const frameWidth = frameMeta.width ?? 500;
  const frameHeight = frameMeta.height ?? 500;

  const photoWidth = Math.round((photoArea.w / 100) * frameWidth);
  const photoHeight = Math.round((photoArea.h / 100) * frameHeight);
  const left = Math.round((photoArea.x / 100) * frameWidth);
  const top = Math.round((photoArea.y / 100) * frameHeight);

  const resizedPhoto = await sharp(photoBuffer)
    .resize(photoWidth, photoHeight, { fit: "cover" })
    .png()
    .toBuffer();

  return sharp({
    create: { width: frameWidth, height: frameHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: resizedPhoto, left, top },
      { input: framePngBuffer, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- tests/compositor.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing route test**

`server/tests/generate.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createCampaign } from "../src/campaigns";
import { createTemplate } from "../src/templates";

describe("POST /api/campaigns/:slug/generate", () => {
  let slug: string;
  let templateId: string;

  beforeAll(async () => {
    const now = new Date();
    const campaign = await createCampaign({
      slug: "test-generate-campaign",
      title: "T",
      titleEn: "T",
      status: "active",
      startDate: new Date(now.getTime() - 86400000),
      endDate: new Date(now.getTime() + 86400000),
    });
    slug = campaign.slug;

    const frame = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();

    const template = await createTemplate({
      campaignId: campaign.id,
      name: "Test Generate Template",
      imageBuffer: frame,
      photoArea: { x: 10, y: 10, w: 80, h: 80 },
      components: ["joinYear"],
    });
    templateId = template.id;
  });

  afterAll(async () => {
    await prisma.generatedAvatar.deleteMany({ where: { campaign: { slug: "test-generate-campaign" } } });
    await prisma.template.deleteMany({ where: { name: "Test Generate Template" } });
    await prisma.campaign.deleteMany({ where: { slug: "test-generate-campaign" } });
    await prisma.$disconnect();
  });

  it("composites the photo server-side and records a GeneratedAvatar, ignoring any client-provided image URL", async () => {
    const photo = await sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();

    const res = await request(createApp())
      .post(`/api/campaigns/${slug}/generate`)
      .field("templateId", templateId)
      .field("componentValues", JSON.stringify({ joinYear: "2020" }))
      .attach("photo", photo, "photo.png");

    expect(res.status).toBe(201);
    expect(res.body.resultUrl).toBeDefined();

    const record = await prisma.generatedAvatar.findFirst({ where: { templateId } });
    expect(record?.componentValues).toEqual({ joinYear: "2020" });

    const campaign = await prisma.campaign.findUnique({ where: { slug } });
    expect(campaign?.downloadCount).toBe(1);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd server && npm test -- tests/generate.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 8: Implement the route**

`server/src/routes/generate.ts`:
```ts
import { Router } from "express";
import multer from "multer";
import { prisma } from "../db";
import { findCampaignBySlug } from "../campaigns";
import { getStorage } from "../storage";
import { compositeAvatar } from "../compositor";

const upload = multer({ storage: multer.memoryStorage() });

export const generateRouter = Router();

generateRouter.post("/:slug/generate", upload.single("photo"), async (req, res) => {
  const campaign = await findCampaignBySlug(req.params.slug);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const { templateId } = req.body as { templateId: string };
  const template = campaign.templates.find((t) => t.id === templateId);
  if (!template) return res.status(400).json({ error: "Template does not belong to this campaign" });

  if (!req.file) return res.status(400).json({ error: "photo file is required" });

  const componentValues = JSON.parse(req.body.componentValues ?? "{}");
  const allowedKeys = template.components as unknown as string[];
  const invalidKey = Object.keys(componentValues).find((k) => !allowedKeys.includes(k));
  if (invalidKey) {
    return res.status(400).json({ error: `Unknown component key: ${invalidKey}` });
  }

  const storage = getStorage();
  const frameKey = template.frameImageKey;
  const frameUrl = await storage.getPublicUrl(frameKey);
  const frameResponse = await fetch(frameUrl);
  const frameBuffer = Buffer.from(await frameResponse.arrayBuffer());

  const photoArea = template.photoArea as unknown as { x: number; y: number; w: number; h: number };
  const resultBuffer = await compositeAvatar(req.file.buffer, frameBuffer, photoArea);

  const resultKey = `results/${campaign.id}/${Date.now()}.png`;
  await storage.upload(resultKey, resultBuffer, "image/png");
  const resultUrl = await storage.getPublicUrl(resultKey);

  await prisma.generatedAvatar.create({
    data: {
      campaignId: campaign.id,
      templateId: template.id,
      componentValues,
      resultImageKey: resultKey,
    },
  });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { downloadCount: { increment: 1 } } });

  res.status(201).json({ resultUrl });
});
```

Mount it in `server/src/app.ts`, before `campaignsRouter` (both share the `/api/campaigns` prefix; Express matches in mount order, and `generateRouter`'s `/:slug/generate` path won't collide with `campaignsRouter`'s `/:slug` and `/` routes since Express tries each router's routes in sequence):
```ts
import { generateRouter } from "./routes/generate";
// ...
app.use("/api/campaigns", generateRouter);
app.use("/api/campaigns", campaignsRouter);
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd server && npm test -- tests/generate.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add server
git commit -m "feat: add mandatory server-side avatar compositing endpoint"
```

---

## Task 9: Admin analytics endpoint

**Files:**
- Create: `server/src/routes/admin-analytics.ts`
- Test: `server/tests/analytics.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `requireAdmin` (Task 4).
- Produces: `GET /api/admin/analytics` → `{ byCampaign: Array<{ name: string; value: number }> }`, replacing the static mock `analytics` object in the current [FE/js/core/store.js](../../../FE/js/core/store.js:37).

- [ ] **Step 1: Write the failing test**

`server/tests/analytics.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createCampaign } from "../src/campaigns";

const token = () => jwt.sign({ email: "t@fpt.com" }, process.env.JWT_SECRET as string);

describe("GET /api/admin/analytics", () => {
  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { slug: "test-analytics" } });
    await prisma.$disconnect();
  });

  it("returns downloadCount per campaign as byCampaign", async () => {
    const campaign = await createCampaign({
      slug: "test-analytics",
      title: "Analytics Test",
      titleEn: "Analytics Test",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { downloadCount: 42 } });

    const res = await request(createApp())
      .get("/api/admin/analytics")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    const entry = res.body.byCampaign.find((c: { name: string }) => c.name === "Analytics Test");
    expect(entry.value).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/analytics.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 3: Implement the route**

`server/src/routes/admin-analytics.ts`:
```ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAdmin } from "../auth";

export const adminAnalyticsRouter = Router();
adminAnalyticsRouter.use(requireAdmin);

adminAnalyticsRouter.get("/", async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    select: { title: true, downloadCount: true },
    orderBy: { downloadCount: "desc" },
  });
  res.json({
    byCampaign: campaigns.map((c) => ({ name: c.title, value: c.downloadCount })),
  });
});
```

Mount it in `server/src/app.ts`:
```ts
import { adminAnalyticsRouter } from "./routes/admin-analytics";
// ...
app.use("/api/admin/analytics", adminAnalyticsRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- tests/analytics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: add admin analytics endpoint backed by real download counts"
```

---

## Task 10: Rewire FE `store.js` to call the backend API

**Files:**
- Modify: `FE/js/core/store.js`
- Modify: `FE/js/core/admin-app.js` (add `await` at call sites)
- Modify: `FE/js/core/public-app.js` (add `await` at call sites)
- Create: `FE/js/config/api.js`

**Interfaces:**
- Consumes: all API routes from Tasks 4–9.
- Produces: `AppStore` keeps its existing public method names but each becomes `async`; every caller in `admin-app.js`/`public-app.js` must `await` them. `FE/js/config/api.js` exports `API_BASE_URL` and `authHeader()`.

This task has no automated tests (it's browser-integration code with no existing test harness in `FE/`) — verification is manual per Step 6.

- [ ] **Step 1: Add the API base config**

`FE/js/config/api.js`:
```js
export const API_BASE_URL = 'http://localhost:4000/api';
const TOKEN_KEY = 'afp_admin_token';

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setAdminToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
}
export function authHeader() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

- [ ] **Step 2: Rewrite `AppStore` in `FE/js/core/store.js` to call the API**

Replace the full contents of [FE/js/core/store.js](../../../FE/js/core/store.js) with:

```js
/* ============================================================
   AppStore — owns campaigns / templates / notifications / analytics
   and talks to the admin backend API instead of localStorage.
   ============================================================ */
import { API_BASE_URL, authHeader } from '../config/api.js';

export class AppStore {
  constructor() {
    this.campaigns = [];
    this.notifications = [];
    this.analytics = { byCampaign: [] };
  }

  async load() {
    const res = await fetch(`${API_BASE_URL}/campaigns`);
    this.campaigns = await res.json();
  }

  async loadAdmin() {
    const res = await fetch(`${API_BASE_URL}/admin/campaigns`, { headers: authHeader() });
    this.campaigns = await res.json();
    const notifRes = await fetch(`${API_BASE_URL}/admin/notifications`, { headers: authHeader() });
    this.notifications = await notifRes.json();
  }

  findCampaign(slug) {
    return this.campaigns.find((x) => x.slug === slug);
  }

  async saveCampaign(draft, editingSlug) {
    const isNew = !editingSlug;
    if (isNew) {
      await fetch(`${API_BASE_URL}/admin/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(draft),
      });
    } else {
      await fetch(`${API_BASE_URL}/admin/campaigns/${editingSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(draft),
      });
    }
    await this.loadAdmin();
    return isNew;
  }

  async deleteCampaign(slug) {
    const c = this.findCampaign(slug);
    await fetch(`${API_BASE_URL}/admin/campaigns/${slug}`, { method: 'DELETE', headers: authHeader() });
    await this.loadAdmin();
    return c;
  }

  async cycleCampaignStatus(slug) {
    const res = await fetch(`${API_BASE_URL}/admin/campaigns/${slug}/cycle-status`, {
      method: 'POST',
      headers: authHeader(),
    });
    const updated = await res.json();
    await this.loadAdmin();
    return updated;
  }

  async recordDownload(slug) {
    // downloadCount is incremented server-side by POST /campaigns/:slug/generate (Task 8);
    // this method is kept only so existing FE call sites don't need to change shape.
    await this.load();
  }

  async saveTemplate(campaignSlug, draft, editingTemplateId, imageFile) {
    const campaign = this.findCampaign(campaignSlug);
    const form = new FormData();
    form.set('campaignId', campaign.id);
    form.set('name', draft.name);
    form.set('photoArea', JSON.stringify(draft.photoArea));
    form.set('components', JSON.stringify(draft.components));
    if (imageFile) form.set('image', imageFile);

    if (editingTemplateId) {
      await fetch(`${API_BASE_URL}/admin/templates/${editingTemplateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(draft),
      });
    } else {
      await fetch(`${API_BASE_URL}/admin/templates`, {
        method: 'POST',
        headers: authHeader(),
        body: form,
      });
    }
    await this.loadAdmin();
  }

  async deleteTemplate(campaignSlug, templateId) {
    await fetch(`${API_BASE_URL}/admin/templates/${templateId}`, { method: 'DELETE', headers: authHeader() });
    await this.loadAdmin();
  }

  async loadAnalytics() {
    const res = await fetch(`${API_BASE_URL}/admin/analytics`, { headers: authHeader() });
    this.analytics = await res.json();
    return this.analytics;
  }

  unreadCount() {
    return this.notifications.filter((n) => !n.read).length;
  }

  async markAllRead() {
    await fetch(`${API_BASE_URL}/admin/notifications/read-all`, { method: 'PATCH', headers: authHeader() });
    await this.loadAdmin();
  }

  async deleteNotification(id) {
    await fetch(`${API_BASE_URL}/admin/notifications/${id}`, { method: 'DELETE', headers: authHeader() });
    await this.loadAdmin();
  }

  async clearNotifications() {
    await fetch(`${API_BASE_URL}/admin/notifications`, { method: 'DELETE', headers: authHeader() });
    await this.loadAdmin();
  }
}
```

- [ ] **Step 3: Update call sites in `admin-app.js` and `public-app.js`**

Search both files for every call to the `AppStore` methods above (`store.saveCampaign(...)`, `store.deleteCampaign(...)`, `store.saveTemplate(...)`, `store.deleteTemplate(...)`, `store.cycleCampaignStatus(...)`, `store.markAllRead(...)`, `store.deleteNotification(...)`, `store.clearNotifications(...)`, `store.load(...)`) and prefix each with `await`; the enclosing function must itself become `async` if it isn't already (follow the `await` chain upward until you reach an event handler, then mark that handler `async` too).

- [ ] **Step 4: Add a minimal admin login screen**

In `FE/admin.html`, before the existing `<div id="app">`, add:
```html
<div id="login-screen" style="display:none">
  <form id="login-form">
    <input type="email" id="login-email" placeholder="Email" required />
    <input type="password" id="login-password" placeholder="Password" required />
    <button type="submit">Đăng nhập</button>
  </form>
</div>
```

In `FE/js/main-admin.js`, before bootstrapping the admin app, add a guard:
```js
import { API_BASE_URL, getAdminToken, setAdminToken } from './config/api.js';

async function ensureLoggedIn() {
  if (getAdminToken()) return;
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('app').style.display = 'none';

  await new Promise((resolve) => {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return;
      const { token } = await res.json();
      setAdminToken(token);
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      resolve();
    });
  });
}

await ensureLoggedIn();
```

- [ ] **Step 5: Set the storage `frameImageUrl` field to come from the API response instead of a data URL**

In whichever function in `admin-app.js` currently builds `frameImageUrl` for a template preview (search for `frameImageUrl` in [FE/js/core/admin-app.js](../../../FE/js/core/admin-app.js)), replace any hard-coded/local reference with the `frameImageKey`'s resolved public URL returned by the template object from the API (the backend already returns full `Template` records including `frameImageKey`; add a `resultUrl`/`frameUrl` field client-side by calling `GET /api/campaigns/:slug` and reading the `frameImageKey` through a `${API_BASE_URL}/../storage-proxy/` path is out of scope — for MVP, expose the MinIO public URL directly via `getPublicUrl` server-side and return it as `frameImageUrl` in the Template JSON response. This requires one small addition to Task 5/6's routes: when serializing a `Template` for any response, replace `frameImageKey` with a resolved `frameImageUrl`).

Update `server/src/routes/campaigns.ts` (Task 5) and `server/src/routes/admin-templates.ts` (Task 6) to resolve URLs before responding — add this helper to `server/src/templates.ts`:
```ts
import { getStorage } from "./storage";

export async function withResolvedFrameUrl<T extends { frameImageKey: string }>(template: T) {
  const frameImageUrl = await getStorage().getPublicUrl(template.frameImageKey);
  return { ...template, frameImageUrl };
}
```
Then in `campaignsRouter.get("/:slug", ...)` and `campaignsRouter.get("/", ...)`, map each campaign's `templates` through `withResolvedFrameUrl` before calling `res.json(...)`.

- [ ] **Step 6: Manual verification**

Run: `cd server && npm run dev` (in one terminal) and serve `FE/` with `python serve.py` (in another, from the repo root).
Open `admin.html` in a browser, log in with `admin@fpt.com` / `changeme123` (seeded in Task 2), create a campaign, upload a template frame image, and confirm it appears in the list without a page reload showing stale localStorage data. Open `index.html`, confirm the newly created active campaign appears, generate an avatar, and confirm the downloaded image comes from the server's `resultUrl` (check the Network tab — request to `POST /api/campaigns/:slug/generate` returns `201` with a `resultUrl`).

- [ ] **Step 7: Commit**

```bash
git add FE
git commit -m "feat: rewire FE store.js to call the admin backend API instead of localStorage"
```

---

## Self-Review Notes

- **Spec coverage:** §2 stack → Task 1; §3 data model → Task 2; §4 compositing flow → Task 8; §5 API surface → Tasks 4–9; §6 FE changes → Task 10; §7 constraints → enforced in Tasks 5 (slug rename keeps downloadCount because it's a column update, not a keyed map), 8 (server always re-composites), 3 (single storage interface), all admin routes (no queue introduced).
- **Type consistency verified:** `PhotoArea` shape `{x,y,w,h}` used identically in `templates.ts` and `compositor.ts`; `components: string[]` used identically in `templates.ts`, `generate.ts`, and the FE's `saveTemplate` payload.
- **No placeholders:** every step has runnable code or an exact shell command.
