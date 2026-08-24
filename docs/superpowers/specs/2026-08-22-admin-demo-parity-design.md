# Đồng bộ giao diện & thao tác Admin theo demo tham chiếu

Ngày: 2026-08-22
Trạng thái: Draft — chờ user review

## 1. Bối cảnh & mục tiêu

Trang quản lý (`/admin/*`) hiện tại dùng theme shadcn mặc định về phần
lớn kiểu dáng (dù đã port màu FPT vào `globals.css`), route/luồng thao
tác khác với bản demo tĩnh ở `docs/superpowers/demo/admin.html`
(+ `js/core/admin-app.js`, `styles.css`). Mục tiêu: làm cho giao diện
và thao tác admin khớp với demo ở mức tối đa, **trừ** những chỗ demo
kém hơn hệ thống thật đang có (đã thống nhất với user qua brainstorming).

## 2. Phạm vi đã chốt

**Sẽ làm giống demo:**
1. Toàn bộ visual system: màu cam/xanh FPT, font Be Vietnam Pro, bo góc
   14px, shadow, pill trạng thái, style bảng/card/button/avatar-badge.
2. Gộp "Quản lý khung" vào ngay trong form sửa Campaign (bỏ route con).
3. Trường song ngữ VI/EN cho Campaign: `titleEn`, `descriptionEn`, `ctaEn`
   (lồng trong `displayConfig` JSON có sẵn, không migration DB).
4. Nút chuyển ngôn ngữ giao diện admin VI/EN — dịch cả **nhãn UI tĩnh**
   và **dữ liệu động** (bảng Campaign hiển thị bản `titleEn`/`descriptionEn`
   khi ở chế độ EN, fallback về bản VI nếu field EN trống).
5. Trang Thống kê: style lại 3 KPI card + chart hiện có, thêm 2 chart:
   "theo Ngày" (dữ liệu thật, 7 ngày gần nhất) và "theo Đơn vị" (dữ liệu
   minh họa, có ghi chú rõ chưa kết nối GA thật — theo đúng cách demo tự
   ghi chú `liveDataNote`).

**Sẽ KHÔNG làm giống demo (giữ nguyên vì lý do kỹ thuật, đã xác nhận
với user):**
- Form Khung (Template) **giữ nguyên overlay editor động** hiện tại
  (nhiều trường tùy chỉnh vị trí X/Y, cỡ chữ, màu sắc) thay vì thu về
  badge 1 dòng cố định như demo — vì demo không hỗ trợ định vị/tùy biến
  từng trường (chỉ nối chuỗi text vào 1 pill ở đáy ảnh, xem
  `avatar-composer.js:66-88`), trong khi hệ thống thật đã hoàn thiện,
  hardening bảo mật, và có thể đã có Campaign phụ thuộc vào nó.
- **Bổ sung** (không phải thay thế): 4 checkbox lối tắt trong form Khung,
  lấy đúng định nghĩa từ `docs/superpowers/demo/js/config/constants.js`
  (`COMPONENT_DEFS`), để tạo nhanh 1 overlay preset — chi tiết ở §5.

## 3. Kiến trúc & các thay đổi theo khu vực

### 3.1 Design tokens & typography

- `globals.css`: đã có tokens màu FPT (`--primary`, `--secondary`,
  `--radius`...) — giữ nguyên, chỉ audit lại các chỗ chưa dùng token mà
  vẫn hard-code màu Tailwind mặc định (`slate-*`, `zinc-*`...).
- Thêm font Be Vietnam Pro qua Google Fonts (`next/font/google`), áp
  dụng cho toàn app (hoặc riêng route `/admin` nếu route công khai đã
  cố định font khác — cần kiểm tra `layout.tsx` gốc trước khi đổi).
- Thêm biến shadow còn thiếu nếu cần (`--shadow-sm`, `--shadow-md`,
  `--shadow-lg` theo đúng giá trị demo) để dùng cho card/dropdown.

### 3.2 Admin shell (`admin-header.tsx`, `admin-shell.tsx`)

- Header: thêm avatar badge tròn (chữ cái đầu tên/email user đang đăng
  nhập — lấy từ session), thêm cụm nút chuyển ngôn ngữ (pill VI/EN).
- Sidebar nav: đổi active-item từ khối `bg-primary` đặc sang pill nền
  cam nhạt (`#FDE9D6`) / chữ cam đậm (`#C25A00`) như demo.
- Không đổi cấu trúc layout lưới `220px 1fr`.

### 3.3 i18n cho UI admin

- Thêm `src/lib/admin-i18n.ts`: dictionary VI/EN cho nhãn UI tĩnh, dịch
  từ đúng bộ khóa demo dùng (`docs/superpowers/demo/js/config/i18n.js`)
  — chỉ lấy các khóa liên quan đến admin (`adminCampaigns`, `colSlug`,
  `fSlug`, `btn*`, thông báo lỗi/toast...), bỏ các khóa thuộc trang công
  khai (`heroTitle`, `stepUpload`...).
- Thêm `AdminLangProvider` (React context) bọc trong `admin/layout.tsx`
  (trừ trang login), cung cấp `lang`, `setLang(lang)`, `t(key)`. Lưu lựa
  chọn vào `localStorage` (key riêng, không đụng gì phía public site vì
  public site chưa có i18n).
- **Dữ liệu động theo ngôn ngữ**: các nơi hiển thị `displayConfig.title`
  / `description` / `ctaLabel` trong admin (bảng Campaign, breadcrumb...)
  đổi sang hàm `pickLocalized(displayConfig, lang)` — trả về field `*En`
  nếu `lang === 'en'` và field đó không rỗng, ngược lại trả bản gốc (VI).
  Không đổi cách trang công khai (`/c/[slug]`) hiển thị — trang công khai
  đã tự chọn theo `campaign.language`, không liên quan lang-toggle admin.

### 3.4 Campaign: trường song ngữ + gộp Quản lý khung

- `campaign-form.tsx`: thêm field `titleEn`, `descriptionEn`, `ctaEn`
  (input/textarea đi kèm field VI hiện có, layout 2 cột như demo —
  VI bên trái, EN bên phải). Không bắt buộc nhập EN (validation chỉ
  giữ nguyên yêu cầu cũ: slug + title VI + ngày).
- API `PATCH /api/admin/campaigns/[slug]` (`route.ts`) và
  `POST /api/admin/campaigns` (`route.ts`): mở rộng để `displayConfig`
  chấp nhận thêm 3 field mới trong object — whitelist đã áp dụng ở tầng
  parse `displayConfig` nguyên khối (không có allowlist field-by-field
  cho object này hiện tại) nên **không cần đổi API**, chỉ cần frontend
  gửi đủ field trong object `displayConfig`. Cần xác nhận lại điều này
  khi đọc kỹ route hiện tại lúc viết plan (đã đọc `[slug]/route.ts`:
  `data.displayConfig = body.displayConfig` — nhận nguyên object, nên
  không cần đổi backend).
- `campaigns/page.tsx`: khi `editing` khác `null` (đang sửa 1 Campaign
  đã lưu — có `slug`), render thêm section "Quản lý khung" ngay dưới
  form, gồm:
  - Card grid các Template thuộc campaign (ảnh khung, tên, chip
    component đã chọn, nút Sửa/Xóa) — tái sử dụng logic gọi API hiện
    có (`GET /api/admin/campaigns/[slug]` để lấy `templates`).
  - Nút "+ Khung mới" mở `TemplateForm` (đã có, xem §3.5) ngay tại chỗ.
  - Nếu đang tạo Campaign mới (chưa lưu, chưa có slug) → hiện hint
    "Lưu Campaign này trước để bắt đầu thêm khung ảnh" (giống demo),
    không cho thêm khung.
- Xóa route `src/app/admin/campaigns/[slug]/templates/` (cả
  `page.tsx`), giữ lại `template-form.tsx` (di chuyển hoặc import
  thẳng từ `campaigns/`) vì component này vẫn cần dùng.
- Điều hướng cũ tới `/admin/campaigns/[slug]/templates` → xóa hẳn, để
  Next.js trả 404 mặc định (đã chốt với user, không cần trang redirect
  riêng).

### 3.5 Form Khung: giữ overlay editor + thêm checkbox lối tắt

- Thêm `COMPONENT_PRESETS` (hằng số ở `src/lib/component-presets.ts`),
  copy đúng nội dung từ demo `constants.js` (`COMPONENT_DEFS`):

  | key | type | label (VI) | label (EN) | options / placeholder |
  |---|---|---|---|---|
  | `joinYear` | select | Năm gia nhập FPT | Year joined FPT | các năm từ 1988 → năm hiện tại |
  | `unit` | select | Đơn vị công tác | Business unit | FPT Software, FPT Telecom, FPT IS, FPT Education, FPT Retail, Khác |
  | `slogan` | text | Câu châm ngôn | Personal slogan | placeholder "VD: Dream Big, Move Fast" |
  | `signature` | text | Chữ ký / Tên hiển thị | Display name / signature | placeholder "VD: Nguyễn Văn A" |

- `template-form.tsx`: thêm khối 4 checkbox phía trên danh sách overlay
  editor hiện có (label lấy từ `COMPONENT_PRESETS`).
  - **Tick** một checkbox mà overlay có `key` tương ứng **chưa tồn tại**
    trong danh sách overlay hiện tại → thêm 1 overlay mới vào cuối danh
    sách, giá trị khởi tạo lấy từ preset (`key`, `label`, `labelEn`,
    `type`, `options` nếu có) + vị trí mặc định tạm `x:50, y:50`,
    `fontSize:20`, `color:"#ffffff"` (đồng bộ với `emptyOverlay()` hiện
    có trong file, chỉ khác `key`/`label`/`type`/`options` được điền sẵn).
  - **Bỏ tick**: nếu overlay đó **chưa bị sửa** so với giá trị preset gốc
    (so sánh nông object) → xóa khỏi danh sách overlay ngay. Nếu **đã bị
    sửa tay** (vị trí/màu/cỡ chữ/label khác preset gốc) → hiện
    `window.confirm` cảnh báo trước khi xóa (giống pattern
    `window.confirm` đã dùng ở các chỗ xóa khác trong app), hủy thì giữ
    nguyên checkbox ở trạng thái tick.
  - Trạng thái tick của mỗi checkbox = có tồn tại overlay với đúng `key`
    đó trong danh sách hay không (derive từ `overlays`, không lưu state
    riêng) — tránh lệch trạng thái khi admin tự đổi `key` của overlay đã
    tạo từ preset.
- Không đổi `overlayConfig` schema (`Template.overlayConfig` Json) — 4
  preset chỉ là cách điền nhanh, dữ liệu lưu xuống DB vẫn là
  `TextOverlay[]` y hệt cấu trúc hiện tại.

### 3.6 Trang Thống kê

- Style lại 3 KPI card + chart "theo Campaign" theo demo (card padding,
  title, bar-track/bar-fill dùng token màu `--primary`).
- Thêm chart "theo Ngày" (7 ngày gần nhất, dữ liệu thật):
  - API `GET /api/admin/analytics`: thêm truy vấn đếm
    `GeneratedAvatar` group theo ngày (`createdAt`) trong 7 ngày gần
    nhất, trả thêm field `byDay: { day: string; count: number }[]`
    trong response hiện có (không đổi field cũ, chỉ thêm field mới).
  - Frontend: render dạng cột (bar chart dọc) giống demo
    `.day-chart`/`.day-chart__col`.
- Thêm chart "theo Đơn vị" (dữ liệu minh họa, **không** đụng backend):
  - Mảng tĩnh hard-code ở frontend (`src/lib/analytics-placeholder.ts`),
    dùng đúng số liệu mẫu demo có sẵn hoặc số liệu mẫu mới hợp lý.
  - Có dòng ghi chú rõ ràng dưới chart (giống `liveDataNote` của demo):
    "(số liệu minh hoạ — chưa kết nối dữ liệu thật)".

## 4. Data flow tổng quan (Campaign + Khung)

```
Admin mở /admin/campaigns
  → GET /api/admin/campaigns (danh sách, không đổi)
  → Bấm "Sửa" 1 campaign → form mở rộng dưới bảng (như hiện tại)
    → Section "Quản lý khung" tự động hiện (vì đã có slug)
      → GET /api/admin/campaigns/[slug] (lấy templates, không đổi)
      → Bấm "+ Khung mới" → TemplateForm mở tại chỗ
        → Tick checkbox preset → tự thêm overlay vào state cục bộ
        → Submit → POST /api/admin/campaigns/[slug]/templates (không đổi)
      → Bấm "Sửa" 1 khung → TemplateForm mở với overlay hiện có
        → checkbox tự tick nếu overlay.key khớp preset
        → Submit → PATCH .../templates/[id] (không đổi)
```

Không có API mới ngoài phần mở rộng response của
`GET /api/admin/analytics` (thêm field `byDay`, không phải endpoint mới).

## 5. Error handling

- Giữ nguyên toàn bộ validate/whitelist đã hardening trước đó (slug
  kebab-case, mass-assignment whitelist ở route Campaign/Template, giới
  hạn dung lượng file). Không nới lỏng gì.
- Field song ngữ (`titleEn`, `descriptionEn`, `ctaEn`) là optional —
  không thêm validate bắt buộc.
- Bỏ tick checkbox khi overlay đã bị sửa tay → xác nhận qua
  `window.confirm` (client-side only, không có state phía server).
- `AdminLangProvider`: nếu `localStorage` không khả dụng (như
  `notification-bell` hiện tại đang xử lý), fallback về `'vi'` mặc định,
  không throw lỗi.

## 6. Testing

- Cập nhật test hiện có bị ảnh hưởng bởi đổi class/route:
  `tests/components/admin-header.test.tsx`, test của
  `campaigns/page.tsx` nếu có, xóa/cập nhật test của route
  `[slug]/templates` cũ.
- Test mới:
  - `AdminLangProvider`/`useAdminLang`: toggle đổi `t(key)` đúng, lưu
    `localStorage`, fallback khi storage lỗi.
  - `pickLocalized()`: trả đúng field theo lang, fallback khi field EN
    rỗng.
  - Checkbox preset trong `template-form.tsx`: tick thêm overlay đúng
    preset, bỏ tick xóa overlay chưa sửa, bỏ tick overlay đã sửa → hiện
    confirm, hủy confirm → giữ nguyên.
  - `GET /api/admin/analytics`: response có field `byDay` đúng định
    dạng, đếm đúng theo `createdAt`.
  - Route Campaign gộp Template: campaign form hiển thị section quản lý
    khung khi có slug, ẩn khi đang tạo mới.
- Sau khi implement: chạy `npx tsc --noEmit`, `npx next build`,
  `npx vitest run` — đúng quy trình đã áp dụng các đợt trước (ghi trong
  bản tóm tắt bàn giao, vitest xanh không đủ, đã từng bắt lỗi kiểu dữ
  liệu mà build mới phát hiện).

## 7. Ngoài phạm vi (không làm)

- Không xây i18n cho trang công khai (`/`, `/c/[slug]`, `/generate`).
- Không đổi cơ chế đăng nhập (vẫn dev-login bypass).
- Không tích hợp Google Analytics thật cho chart "theo Đơn vị".
- Không đổi `overlayConfig`/`Template` schema trong Prisma.
- Không xóa/migrate dữ liệu Template hiện có.
