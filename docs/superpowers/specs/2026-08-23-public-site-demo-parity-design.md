# Đồng bộ giao diện & hoàn thiện luồng chức năng trang công khai theo demo

Ngày: 2026-08-23
Trạng thái: Draft — chờ user review

## 1. Bối cảnh & mục tiêu

Sau khi hoàn thiện phần admin (spec `2026-08-22-admin-demo-parity-design.md`), trang công khai (`/`, `/c/[slug]`) vẫn ở trạng thái sơ khai so với demo (`docs/superpowers/demo/index.html` + `js/core/public-app.js` + `avatar-composer.js`):

- Không có header (logo, lang-toggle, chuông thông báo).
- Nội dung Campaign luôn hiển thị tiếng Việt dù DB đã có `titleEn`/`descriptionEn`/`ctaEn`.
- Trang chi tiết Campaign (`campaign-compositor.tsx`) chỉ có chọn khung + upload ảnh + canvas preview thô — thiếu layout 2 cột, kéo/zoom ảnh, bước 3 điền thông tin, nút tải ảnh thật, chia sẻ.
- **Nút "Tạo avatar" chưa từng gọi API `/generate` thật** — khách chọn khung, tải ảnh, xem preview nhưng không có gì được lưu, không tải được ảnh cuối cùng về máy. Trang Thống kê admin vì vậy luôn hiện 0 lượt tải.
- Bug đã biết: `frameImageKey` (storage key thô) bị dùng trực tiếp làm `src` ảnh, không phải URL công khai.

Mục tiêu: dựng lại trang công khai khớp demo về giao diện, đồng thời nối luồng chức năng thật (upload → chọn khung → điền thông tin → xem trước → tải ảnh thật qua API `/generate` đã có sẵn và hardening đầy đủ ở backend).

## 2. Phạm vi đã chốt qua trao đổi

**Sẽ làm:**
1. Header công khai mới: logo, lang-toggle VI/EN, chuông thông báo.
2. Hệ i18n riêng cho trang công khai (`public-i18n.tsx`), tách biệt hoàn toàn với `admin-i18n.tsx`.
3. Trang chủ hiển thị đúng `title`/`description`/`ctaLabel` theo ngôn ngữ đang chọn (dùng lại `pickLocalized`).
4. Trang chi tiết Campaign viết lại theo layout 2 cột của demo: cột trái (Bước 1 upload, Bước 2 chọn khung, Bước 3 điền thông tin), cột phải (preview card + nút tải + chia sẻ).
5. Kéo (drag) để dịch chuyển ảnh + slider zoom trong khung preview — port từ logic con trỏ (pointer events) của demo sang React.
6. **Nối nút "Tạo avatar" vào API `/generate` thật** — submit `FormData` (templateId, photo, overlayValues), nhận `resultUrl`, tự động tải file về máy khách (giống hành vi demo: fetch blob → tạo `<a download>` → click → thu hồi URL).
7. Sửa bug `frameImageUrl`: route `GET /api/campaigns/[slug]` trả thêm `frameImageUrl` cho từng template (dùng `storage.getPublicUrl()`, giống route admin đã làm).
8. Chuông thông báo công khai: endpoint mới `GET /api/notifications` (không cần đăng nhập), chỉ trả về thông báo loại `campaign-create`/`campaign-update`/`campaign-delete` (loại trừ `download`). Trạng thái "đã đọc"/"đánh dấu tất cả đã đọc" lưu **hoàn toàn phía client** (`localStorage`, danh sách ID đã xem) — không gọi API `mark-all-read`/`DELETE` hiện có của admin, không đụng cột `read` trong DB.
9. Chia sẻ thật: dùng Web Share API (`navigator.share`) khi trình duyệt hỗ trợ (chủ yếu mobile), fallback sang link chia sẻ trực tiếp cho Facebook/Zalo/LinkedIn khi không hỗ trợ (desktop).

**Sẽ KHÔNG làm (đã xác nhận):**
- Không làm modal đăng nhập giả như demo — trang chủ vẫn là điểm vào trực tiếp, khớp đúng kiến trúc backend thật (không có hệ thống xác thực khách).
- Không đổi schema Prisma, không đổi logic validate/hardening đã có ở `/generate` (giữ nguyên `validateOverlayValues`, giới hạn 10MB ảnh, `isCampaignPubliclyVisible`).
- Không đụng tới cột `read`/API `mark-all-read`/`DELETE` hiện có của `Notification` (dành riêng cho admin).

## 3. Kiến trúc & các thay đổi theo khu vực

### 3.1 i18n công khai

- Tạo `src/lib/public-i18n.tsx`: `PublicLangProvider`, `usePublicLang()` trả `{ lang, setLang, t }` — cùng cấu trúc với `admin-i18n.tsx` nhưng **dictionary riêng, `localStorage` key riêng** (`afp_public_lang`, khác `afp_admin_lang`). Dictionary lấy đúng các khóa demo dùng cho trang public trong `docs/superpowers/demo/js/config/i18n.js` (không lấy khóa `admin*`): `heroTitle`, `heroSubtitle`, `noCampaignsTitle`, `stepUpload`, `stepUploadHint`, `dropTitle`, `dropSub`, `changePhoto`, `stepTemplate`, `stepOverlay`, `previewTitle`, `previewNote`, `downloadButton`, `shareTitle`, `zoomHint`, `warnTitle`, `warnMissingPhoto`, `warnIncompleteFields`, `backHome`, `closedNotice`, `campaignNotReady`, `notifTitle`, `notifEmpty`, `notifMarkAllRead`, `notifJustNow`, `notifMinAgo`, `notifHourAgo`.

### 3.2 Layout công khai + Header

- Tạo route group `src/app/(public)/` — di chuyển `src/app/page.tsx` → `src/app/(public)/page.tsx`, `src/app/c/[slug]/` → `src/app/(public)/c/[slug]/`. URL không đổi (route group không xuất hiện trong path).
- Tạo `src/app/(public)/layout.tsx`: bọc `PublicLangProvider` + `<PublicHeader />` quanh `children`.
- Tạo `src/components/public-header.tsx`: logo, tên app, lang-toggle (tái dùng style từ `admin-header.tsx`'s `LangToggle` nhưng gọi `usePublicLang`), `<PublicNotificationBell />` (§3.6). **Không** có nút đăng xuất/danh tính admin (đúng như demo's public header comment: dành cho "nhân viên thường").

### 3.3 Trang chủ

- `src/app/(public)/page.tsx` giữ nguyên phần fetch server-side (`fetchActiveCampaigns`) để không mất tốc độ tải trang đầu.
- Tách phần render danh sách card ra `src/app/(public)/campaign-cards.tsx` (client component, nhận `campaigns` qua props), dùng `usePublicLang()` + `pickLocalized()` để hiển thị đúng `title`/`description`/`ctaLabel` theo ngôn ngữ. Card style giữ nguyên (đã khá gần demo), chỉ đổi nguồn chữ.
- `Campaign` interface trong `campaigns-client.ts` cần bổ sung `titleEn?`, `descriptionEn?`, `ctaEn?` (đã có sẵn trong DB qua `displayConfig`, chỉ cần khai báo type).

### 3.4 Route API: sửa bug `frameImageUrl` + endpoint public notifications

- `src/app/api/campaigns/[slug]/route.ts`: thêm `storage.getPublicUrl()` cho từng template, trả `frameImageUrl` — giống hệt cách route admin `GET /api/admin/campaigns/[slug]` đã làm.
- Tạo `src/app/api/notifications/route.ts` (public, **không** `requireAdmin`):
  ```ts
  GET → prisma.notification.findMany({
    where: { type: { in: ["campaign-create", "campaign-update", "campaign-delete"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  ```
  Không có DELETE/PATCH — public route chỉ đọc.

### 3.5 Trang chi tiết Campaign — viết lại `campaign-compositor.tsx`

Đổi tên thành `src/app/(public)/c/[slug]/avatar-creator.tsx` (rõ nghĩa hơn "compositor" — component giờ làm nhiều hơn compositing thuần túy) và viết lại theo state machine của demo, thu gọn cho đúng dữ liệu thật:

```ts
interface AvatarCreatorState {
  selectedTemplateId: string | null;
  overlayValues: Record<string, string>;
  photo: File | null;
  photoPreviewUrl: string | null; // object URL cho ảnh gốc
  transform: { scale: number; ox: number; oy: number }; // ox/oy: phân số kích thước khung
  downloading: boolean;
  error: string | null;
}
```

- **Bước 1 — Upload ảnh**: dropzone giống demo (`<input type="file" accept="image/jpeg,image/png">`), giới hạn 10MB phía client (khớp `MAX_PHOTO_BYTES` backend) để báo lỗi sớm thay vì đợi server từ chối. Khi chọn ảnh mới, reset `transform` về `{ scale: 1, ox: 0, oy: 0 }`.
- **Bước 2 — Chọn khung**: giữ nguyên grid chọn template hiện có, nhưng thêm `frameImageUrl` (đã có từ §3.4) — thumbnail thật thay vì gradient giả nếu có ảnh, checkerboard nền khi chưa chọn ảnh.
- **Bước 3 — Điền thông tin**: render động theo `selected.overlayConfig.textOverlays` (không phải `COMPONENT_DEFS` cố định của demo — hệ thống thật dùng overlay tự do). Với mỗi `TextOverlay`: nếu `type === "select"` → `<select>` với `options`; nếu `type === "text"` → `<input>` với `placeholder`. Nhãn lấy theo ngôn ngữ (`overlay.label`/`overlay.labelEn`).
- **Kéo/zoom ảnh**: port logic pointer-event từ demo (`pointerdown`/`pointermove`/`pointerup` trên ảnh, `clamp(-0.45, 0.45)` cho `ox`/`oy`) sang React — dùng ref + state, không dùng thư viện ngoài.
- **Preview**: **giữ nguyên canvas `renderPreview()` đã có** (`browser-compositor.ts`) — chính xác hơn cách CSS-approximate của demo vì phản ánh đúng vị trí overlay thật. Chỉ style lại `<canvas>` trong 1 card có border/shadow giống `preview-card`/`preview-stage` của demo.
- **Nút Tải ảnh**: disabled khi chưa đủ điều kiện (chưa có ảnh, hoặc còn field overlay bắt buộc trống — theo đúng logic `validateOverlayValues` phía backend, nhưng check phía client trước để UX mượt). Khi bấm:
  1. Build `FormData`: `templateId`, `photo` (File gốc, không phải canvas preview), `overlayValues` (JSON string).
  2. `POST /api/campaigns/[slug]/generate`.
  3. Nhận `{ resultUrl }` → `fetch(resultUrl)` → `blob()` → `URL.createObjectURL(blob)` → tạo `<a download="{slug}-{timestamp}.png">` ẩn, `click()`, sau đó `revokeObjectURL` (đúng pattern demo's `AvatarComposer.compose` dùng, nhưng ảnh giờ là ảnh ghép thật từ server, không phải canvas cục bộ).
  4. Lỗi (400/404/500) → hiện thông báo lỗi từ response, không crash.
- **Chia sẻ**: 3 nút Facebook/Zalo/LinkedIn. Nếu `navigator.share` tồn tại (chủ yếu mobile) → gọi `navigator.share({ title, url: resultUrl })` chung 1 nút "Chia sẻ" thay 3 nút riêng. Nếu không hỗ trợ (desktop) → hiện 3 link chia sẻ riêng theo URL chuẩn từng nền tảng (`https://www.facebook.com/sharer/sharer.php?u=...`, Zalo/LinkedIn tương tự) mở tab mới. Chỉ chia sẻ được sau khi đã tải ảnh thành công (cần `resultUrl`).

### 3.6 Chuông thông báo công khai

- Tạo `src/components/public-notification-bell.tsx`, dựa theo `notification-bell.tsx` hiện có (poll 30s, cùng UI icon/thời gian tương đối) nhưng:
  - Gọi `GET /api/notifications` (route mới, không `requireAdmin`) thay vì `/api/admin/notifications`.
  - Trạng thái "đã đọc" tính bằng cách so sánh `id` từng thông báo với 1 mảng ID đã lưu trong `localStorage` (key `afp_public_seen_notifications`, giới hạn giữ tối đa 200 ID gần nhất tránh phình vô hạn).
  - Nút "Đánh dấu đã đọc" → thêm toàn bộ ID đang hiển thị vào mảng đã lưu, re-render — **không** gọi API nào, không đụng cột `read` trong DB.
  - Không có nút "Xóa tất cả" (đó là hành động quản trị dữ liệu thật, không hợp lý để khách public xóa thông báo của admin).

## 4. Data flow

```
Khách mở "/" → PublicLangProvider load lang từ localStorage
  → HomePage (server) fetch GET /api/campaigns
  → CampaignCards (client) render theo lang đang chọn
  → Bấm "Tạo avatar ngay" → điều hướng /c/[slug]

Khách mở "/c/[slug]" → fetch GET /api/campaigns/[slug] (có frameImageUrl)
  → AvatarCreator render Bước 1/2/3 + preview canvas
  → Chọn ảnh, chọn khung, điền thông tin → canvas cập nhật live
  → Bấm "Tải ảnh về máy":
      POST /api/campaigns/[slug]/generate (FormData: templateId, photo, overlayValues)
      → backend validate + composite + lưu GeneratedAvatar + tạo Notification loại "download"
      → { resultUrl }
      → client fetch blob → tự động tải file về máy khách
  → Bấm chia sẻ → Web Share API hoặc link mạng xã hội, dùng resultUrl vừa nhận
```

## 5. Error handling

- Ảnh vượt 10MB: chặn phía client trước khi cho chọn khung/điền thông tin (giống cảnh báo `frameImageTooLarge` bên admin), tránh gửi lên server rồi mới báo lỗi.
- Overlay bắt buộc chưa điền: nút Tải ảnh disabled + hint text, không cho submit rỗng (khớp `validateOverlayValues` phía server — client chỉ là lớp UX, server vẫn là nguồn xác thực cuối).
- `POST /generate` trả lỗi (404 campaign/template không còn tồn tại, 400 dữ liệu không hợp lệ, 500): hiện toast/banner lỗi, không tự retry, giữ nguyên state form để khách sửa và thử lại.
- Route mới `GET /api/notifications`: nếu Postgres lỗi, trả mảng rỗng ở client (không throw, tương tự cách `notification-bell.tsx` hiện xử lý `catch(() => {})`).

## 6. Testing

- `tests/lib/public-i18n.test.tsx`: mặc định `vi`, toggle đổi `t()`, lưu/khôi phục `localStorage`, key riêng biệt với admin (không đụng `afp_admin_lang`).
- `tests/components/public-header.test.tsx`: render logo, lang-toggle, chuông thông báo; không có nút đăng xuất.
- `tests/app/home-page.test.tsx`: cập nhật để test hiển thị đúng `titleEn`/`descriptionEn` khi `lang=en` (mock `usePublicLang`).
- `tests/app/c-slug-page.test.tsx` + test mới cho `avatar-creator.tsx`: chọn khung → render đúng field theo `textOverlays`; kéo ảnh cập nhật `transform`; nút Tải ảnh disabled khi thiếu field bắt buộc; bấm Tải ảnh gọi đúng `POST .../generate` với `FormData` đúng field; xử lý lỗi response không ok.
- `tests/app/api/campaigns-slug.test.ts` (route đã có, bổ sung case): response bao gồm `frameImageUrl` cho mỗi template.
- `tests/app/api/public-notifications.test.ts` (mới): chỉ trả về 3 loại thông báo được chỉ định, không có route DELETE/PATCH nào tồn tại ở path này.
- `tests/components/public-notification-bell.test.tsx`: đánh dấu đã đọc chỉ ghi `localStorage`, không gọi fetch nào khác ngoài `GET /api/notifications`.
- Sau khi cài đặt: `npx tsc --noEmit`, `npx next build`, `npx vitest run`.

## 7. Ngoài phạm vi (không làm)

- Không xây hệ thống đăng nhập/xác thực cho khách vãng lai.
- Không đổi Prisma schema.
- Không đổi logic hardening đã có ở `/generate` (giới hạn kích thước, validate overlay, whitelist template theo campaign).
- Không thêm nút "Xóa" thông báo phía chuông public.
- Không tối ưu SEO/Open Graph cho việc chia sẻ (chỉ chia sẻ URL trang, không tạo ảnh preview riêng cho mạng xã hội).
