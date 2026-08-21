# Admin Notification Bell — Design Spec

**Status:** Approved for planning
**Author context:** Gap found while comparing `docs/superpowers/demo/admin.html` (`js/core/admin-app.js`, `store.js`) against the real admin app — the demo has a notification bell in both headers; the real app has none.

## 1. Problem

Admins have no in-app signal when a campaign is created/updated/deleted or when a visitor downloads an avatar. The demo prototype simulates this with a bell icon (unread badge + dropdown) backed by `localStorage`. The real app needs the same UX backed by Postgres, since state must survive across sessions/devices and multiple admins share one view.

## 2. Scope

**In scope:**
- A `Notification` table, written to by four existing admin/public actions.
- Three new API routes under `/api/admin/notifications`.
- A `NotificationBell` client component mounted in the admin header only.

**Out of scope (explicit non-goals):**
- Template create/update/delete do **not** generate notifications (matches demo).
- No bell on the public site header (admin-only, per current design where the public header never surfaces admin identity/links).
- No per-user read state — "read" is one shared flag per notification, visible the same way to every admin. See §7 for the tradeoff and why it's deferred.
- No real-time push (SSE/WebSocket) — the client polls on an interval.
- No bilingual notification text — admin UI has no i18n toggle anywhere today, so `message` is a single Vietnamese string.

## 3. Data model

Add to `prisma/schema.prisma`:

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

- `type` is a free-form string (`"campaign-create"`, `"campaign-update"`, `"campaign-delete"`, `"download"`), not a Prisma enum — matches the existing `Campaign.status` convention of plain strings (see `prisma/schema.prisma:22`), and keeps adding a new event type in the future a pure application-code change with no migration.
- `read` is a single boolean shared by every admin (§7).
- Retention: capped at the 50 most recent rows. Every write that creates a notification also deletes any rows beyond the 50 newest (ordered by `createdAt desc`). This bounds table growth from the `download` event, which can fire far more often than campaign edits.

## 4. Notification-writing helper

New file `src/lib/notifications.ts` exporting:

```ts
createNotification(message: string, type: string): Promise<void>
```

Behavior:
1. Insert one `Notification` row with `message`, `type` (and default `read: false`).
2. Query for row ids beyond the 50 newest (`orderBy: { createdAt: "desc" }, skip: 50`).
3. If any exist, delete them.

This is the **only** way any route writes a notification — callers never touch `prisma.notification` directly, so the retention rule can't be bypassed by a call site that forgets step 2–3.

## 5. Trigger points

Four call sites, each firing **after** the underlying write already succeeded (never before, and never on a failure path):

| Route | File | Message | `type` |
|---|---|---|---|
| `POST /api/admin/campaigns` | `src/app/api/admin/campaigns/route.ts` | `Đã tạo campaign mới "<title>".` | `campaign-create` |
| `PATCH /api/admin/campaigns/[slug]` | `src/app/api/admin/campaigns/[slug]/route.ts` | `Đã cập nhật campaign "<title>".` | `campaign-update` |
| `DELETE /api/admin/campaigns/[slug]` | `src/app/api/admin/campaigns/[slug]/route.ts` | `Đã xoá campaign "<title>".` | `campaign-delete` |
| `POST /api/campaigns/[slug]/generate` | `src/app/api/campaigns/[slug]/generate/route.ts` | `Có lượt tải avatar mới: <campaign title> – <template name>.` | `download` |

`<title>` is read from the campaign's `displayConfig.title` (cast the same way `src/app/api/admin/analytics/route.ts:16` already does: `(displayConfig as { title?: string })?.title`), falling back to the campaign's `slug` if the title is missing. `<template name>` is the `Template.name` column, already loaded by the existing `prisma.template.findFirst` call in the generate route.

The generate route currently calls `prisma.campaign.findUniqueOrThrow({ where: { slug: params.slug } })` inline just to read `.id` for the `GeneratedAvatar` create. That call's result must be captured in a variable so its `displayConfig` can also be read for the notification message, instead of being discarded.

A failed create/update/delete/generate (validation error, 404, 409, DB failure) must **not** produce a notification — the helper is called only on the success path, after the existing response-shaping logic already decided to return 200.

## 6. API routes

All three gated by `requireAdmin()` (`src/lib/require-admin.ts`), same pattern as every other `/api/admin/*` route — return the `401`/`403` response from `requireAdmin()` unchanged on failure.

**`GET /api/admin/notifications`**
`src/app/api/admin/notifications/route.ts`
Returns the 50 most recent notifications, newest first, as a JSON array of `{ id, message, type, read, createdAt }`.

**`DELETE /api/admin/notifications`**
Same file. Deletes every notification (`prisma.notification.deleteMany({})`). Returns `{ ok: true }`.

**`PATCH /api/admin/notifications/mark-all-read`**
`src/app/api/admin/notifications/mark-all-read/route.ts`
Sets `read: true` on every notification (`prisma.notification.updateMany({ data: { read: true } })`). Returns `{ ok: true }`.

**`DELETE /api/admin/notifications/[id]`**
`src/app/api/admin/notifications/[id]/route.ts`
Deletes one notification by id. If the id doesn't exist, Prisma throws `P2025` — catch it and return 404 with `{ error: "Notification not found" }`, matching the existing pattern in `src/app/api/admin/campaigns/[slug]/route.ts:44-48`. On success, returns `{ ok: true }`.

## 7. Read-state tradeoff (recorded for future reference)

Considered building a `NotificationRead` join table (`userId` + `notificationId`) so each admin has an independent read/unread view, instead of the single shared `read` flag above.

**Decision: shared flag, no join table**, because:
- The app currently has no real multi-admin concept — sign-in is a single `dev-login` bypass or Azure AD, with no visible flow for managing multiple distinct admin accounts today.
- Building the per-user table now would be speculative: a "flexibility nobody asked for" per this project's guidelines (`CLAUDE.md` §2).
- The migration path later is additive, not destructive: a `NotificationRead` table can be introduced without altering or discarding any existing `Notification` rows. Building it now costs more than deferring it.

If multi-admin per-user read tracking becomes a real requirement, revisit this section rather than the schema above.

## 8. UI — `NotificationBell` component

New file: `src/components/notification-bell.tsx` (client component).

**Mount point:** inside `src/components/admin-header.tsx`, between the title block and the existing "Đăng xuất" button — the public site's header (`src/app/c/[slug]/campaign-compositor.tsx` and friends) is untouched.

**Data flow:**
- On mount, `GET /api/admin/notifications` and store the array in state.
- Re-fetch on a 30-second interval (`setInterval`), cleared on unmount.
- Unread count = `items.filter(i => !i.read).length`, computed client-side from the fetched list (no separate count endpoint).

**Interaction:**
- A bell button toggles a dropdown panel. Badge showing the unread count sits on the bell; hidden when the count is 0.
- Panel lists notifications (message text + `createdAt` formatted with `toLocaleString("vi-VN")`), newest first, unread ones visually distinguished (background tint).
- "Đánh dấu đã đọc" button: `PATCH /api/admin/notifications/mark-all-read`, then re-fetch.
- Per-item delete (✕): `DELETE /api/admin/notifications/[id]`, then re-fetch.
- "Xoá tất cả" button: `DELETE /api/admin/notifications`, then re-fetch.
- Clicking outside the panel closes it (listener registered in the capture phase, same technique already used in the demo's `closeNotifOnOutsideClick` and safe to reuse here since this is a fresh component, not shared code).

Opening the panel does **not** auto-mark items as read — matches the demo, which only marks read via the explicit button.

## 9. Testing

**API tests** (new file `tests/app/api/admin-notifications.test.ts`, following the existing `vi.mock("../../../src/lib/prisma", ...)` + direct route-handler-import pattern used in `tests/app/api/admin-campaigns.test.ts`):
- `GET` returns the mocked list as JSON.
- `DELETE` (collection) calls `prisma.notification.deleteMany({})`.
- `PATCH mark-all-read` calls `prisma.notification.updateMany({ data: { read: true } })`.
- `DELETE /[id]` calls `prisma.notification.delete({ where: { id } })`; returns 404 on a mocked `P2025` rejection.
- All four reject with the `requireAdmin()` failure response when unauthorized (mock `requireAdmin` to return `{ ok: false, ... }` once).

**Helper test** (new file `tests/lib/notifications.test.ts`):
- `createNotification` inserts a row via `prisma.notification.create`.
- When more than 50 rows exist, the ones beyond the newest 50 are deleted (mock `findMany` to return excess ids, assert `deleteMany` was called with those ids).

**Trigger-point tests** (extend the four existing route test files — `tests/app/api/admin-campaigns.test.ts`, `tests/app/api/campaigns-generate.test.ts` — by mocking `../../../src/lib/notifications` as `{ createNotification: vi.fn() }` and asserting the call args on the success path of create/update/delete/generate; asserting it is **not** called on the existing failure-path tests already in those files, e.g. the `409` duplicate-slug test and the `404` template-not-found test).

**Component test** (new file `tests/components/notification-bell.test.tsx`, jsdom + `@testing-library/react`, mirroring `tests/app/admin/campaigns-page.test.tsx`'s `global.fetch` mocking style):
- Renders the unread badge count from a mocked `GET` response.
- Opens the dropdown on click and lists the mocked items.
- Clicking "Đánh dấu đã đọc" calls the mark-all-read `PATCH` then re-fetches.
- Clicking a per-item ✕ calls `DELETE /api/admin/notifications/[id]`.
- Using fake timers (`vi.useFakeTimers()`), advancing 30 seconds triggers a second `GET`.

## 10. Migration

`prisma/schema.prisma` gets the `Notification` model above. This repo tracks migrations under `prisma/migrations/` (see the existing `20260821043047_init`). The implementer runs:

```bash
npx prisma migrate dev --name add_notification
```

This requires a reachable Postgres (`docker compose -f docker-compose.dev.yml up -d`, per the project's existing local-dev instructions). If Postgres is not reachable in the execution environment, `npx prisma generate` alone (no DB connection required) is enough to regenerate the Prisma client so the test suite — which mocks `prisma` in every test above — passes; the actual `migrate dev` step must still run before this ships to any real database.
