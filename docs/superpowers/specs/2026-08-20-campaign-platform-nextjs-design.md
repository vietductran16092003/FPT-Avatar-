# Thiết kế: Nền tảng Avatar sự kiện FPT — kiến trúc Next.js theo báo cáo gốc

> Ngày: 20/08/2026 · Trạng thái: Dự thảo, chờ duyệt

## 1. Bối cảnh

Đây là bản thiết kế thay thế cho 2 spec/plan trước đó ([2026-08-20-admin-backend-api-design.md](2026-08-20-admin-backend-api-design.md), [2026-08-20-generic-text-overlays-design.md](2026-08-20-generic-text-overlays-design.md)) — 2 bản đó tự chọn kiến trúc Express + JWT + FE vanilla JS giữ nguyên, chỉ "tham khảo nguyên tắc bảo mật" từ báo cáo kiến trúc gốc chứ không theo đúng kiến trúc gốc.

Spec này bám sát đúng nội dung [Báo cáo kiến trúc hệ thống — Avatar sự kiện FPT, bản 1.2](../../origins/Bao_cao_kien_truc_he_thong_Avatar_su_kien_FPT_v1.2_1.docx) — tài liệu yêu cầu ban đầu của dự án — theo 4 quyết định đã chốt với người dùng:

1. **Codebase:** một Next.js 14 App Router duy nhất (public + admin + API Route Handlers), thay hoàn toàn cho phương án Express riêng.
2. **Auth:** NextAuth.js + Azure AD SSO, thay cho JWT email/password.
3. **Mô hình dữ liệu:** `textOverlays` tổng quát ngay từ Task đầu tiên (Campaign/Template/User/GeneratedAvatar theo đúng §3.2 báo cáo), không làm 4 field cứng rồi tổng quát hóa sau.
4. **Điều kiện chặn cứng:** các gate tổ chức trong báo cáo (§5, §7) được giữ nguyên là gate chờ duyệt — plan phải đánh dấu rõ task nào bị chặn bởi gate nào, không giả định đã duyệt.

**Phạm vi bản này:** kiến trúc nền tảng (schema, storage interface, auth, API surface cho Campaign/Template, luồng tạo avatar 2 bước, trang public liệt kê nhiều Campaign active, trang admin CRUD Campaign/Template). Không bao gồm: notification bell, analytics dashboard chi tiết (kế thừa từ demo, sẽ là spec nối tiếp), retention/cleanup job (chờ gate), GA4 (ngoài phạm vi MVP theo báo cáo §6).

## 2. Ngăn xếp công nghệ (theo báo cáo §3.1, không đổi)

| Lớp | Công nghệ |
|---|---|
| Giao diện + API | Next.js 14 (App Router, TypeScript), Route Handlers |
| CSDL | PostgreSQL qua Prisma ORM |
| Lưu trữ ảnh | Interface chung `ImageStorage` (upload/getPublicUrl/delete), adapter MinIO (dev) hoặc Azure Blob (prod) chọn qua biến môi trường |
| Xác thực | NextAuth.js + Azure AD provider (SSO) |
| Ghép ảnh | Một hàm vẽ overlay dùng chung: Canvas API (browser, preview) + `node-canvas` (server, bản chính thức) |
| Triển khai | Docker → Kubernetes nội bộ FPT hoặc Azure Container Apps, cùng 1 image |

## 3. Mô hình dữ liệu (Prisma, đúng §3.2 báo cáo)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      String   @default("user") // "user" | "admin"
  createdAt DateTime @default(now())
  avatars   GeneratedAvatar[]
}

model Campaign {
  id            String     @id @default(cuid())
  slug          String     @unique
  status        String     @default("draft") // draft | active | archived
  startDate     DateTime
  endDate       DateTime
  language      String     @default("vi")     // "vi" | "en", cố định cho toàn Campaign
  displayConfig Json       // { title, description, ctaLabel, badge, ... }
  templates     Template[]
  avatars       GeneratedAvatar[]
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
}

model Template {
  id            String   @id @default(cuid())
  campaignId    String
  campaign      Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  name          String
  frameImageKey String   // storage key của PNG khung
  overlayConfig Json     // { photoArea: {x,y,w,h}, textOverlays: TextOverlay[] }
  avatars       GeneratedAvatar[]
  createdAt     DateTime @default(now())
}

model GeneratedAvatar {
  id            String    @id @default(cuid())
  campaignId    String
  campaign      Campaign  @relation(fields: [campaignId], references: [id])
  templateId    String
  template      Template  @relation(fields: [templateId], references: [id])
  userId        String?
  user          User?     @relation(fields: [userId], references: [id])
  overlayValues Json      // { [textOverlay.key]: giá trị user nhập }
  resultImageKey String
  createdAt     DateTime  @default(now())
}
```

`TextOverlay` (kiểu TypeScript dùng trong `overlayConfig.textOverlays`, không phải bảng riêng — luôn đọc/ghi trọn vẹn cùng Template, không có nhu cầu query xuyên overlay):

```ts
interface TextOverlay {
  key: string;
  label: string;
  labelEn: string;
  type: "select" | "text";
  options?: string[];      // bắt buộc khi type === "select"
  placeholder?: string;
  x: number;                // % ngang, 0-100
  y: number;                // % dọc, 0-100
  fontSize: number;
  color: string;
}
```

Một Campaign không cần overlay nào thì `textOverlays: []`. Không có field `joinYears` cứng ở bất kỳ model nào (lý do: báo cáo §3.2 — field cứng buộc mọi Campaign mang theo dù không dùng).

## 4. Storage interface (đúng §3.1/§3.4 báo cáo)

```ts
interface ImageStorage {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}
```

Một biến môi trường (`STORAGE_PROVIDER=minio|azure-blob`) chọn adapter lúc khởi động. Không có code nào khác trong app gọi thẳng SDK MinIO/Azure Blob — luôn qua interface này.

## 5. Auth (đúng §4.1 báo cáo)

- NextAuth.js với Azure AD provider (SSO), dùng App Registration đã có sẵn của FPT.
- Lần đăng nhập đầu tiên: tự tạo `User` với `role: "user"`.
- Quyền `admin` gán tay trong DB, không bị NextAuth ghi đè ở các lần đăng nhập sau (callback `session`/`jwt` đọc `role` từ DB, không đọc từ claim Azure AD).
- Trang `/admin/*` chặn 2 lớp: middleware Next.js chặn chung theo session, và mỗi Route Handler admin tự kiểm tra `role === "admin"`.
- **Gate chặn cứng:** phần này không code trước khi Team hạ tầng xác nhận `curl` thành công từ một pod K8s nội bộ tới `login.microsoftonline.com` (báo cáo §5, dòng 🔴). Task auth trong plan phải note rõ gate này.

## 6. API surface

**Public:**
- `GET /api/campaigns` — trả về **danh sách** Campaign có `status=active` và ngày hiện tại nằm trong `[startDate, endDate]` (không phải 1 bản ghi đơn — đúng §3.3, hỗ trợ nhiều Campaign song song).
- `GET /api/campaigns/:slug` — chi tiết 1 Campaign + templates.
- `POST /api/campaigns/:slug/generate` — tạo avatar chính thức (multipart: ảnh gốc + `templateId` + `overlayValues`).

**Admin (yêu cầu session NextAuth, role admin):**
- `POST/GET /api/admin/campaigns`, `PATCH/DELETE /api/admin/campaigns/:slug`
- `POST/PATCH/DELETE /api/admin/campaigns/:slug/templates/:id` (POST dùng multipart để upload PNG khung + `overlayConfig`)

## 7. Luồng tạo avatar (đúng §4.2 báo cáo — không đổi nguyên tắc bảo mật)

1. **Preview (browser):** hàm vẽ overlay dùng chung chạy trên Canvas API, ghép ảnh cá nhân + khung + text theo `overlayConfig` hiện tại của Template đã chọn. Không lưu gì.
2. **Tạo bản chính thức (server, bắt buộc):** client gửi `POST /api/campaigns/:slug/generate` với `{ templateId, photoFile, overlayValues }`. Server:
   - Tự lấy `template.overlayConfig` thật từ DB theo `templateId` thuộc đúng `campaign.slug` trong URL — không tin layout client gửi lên.
   - Validate `overlayValues` chỉ chứa key nằm trong `overlayConfig.textOverlays[].key`; với overlay `type === "select"`, giá trị phải nằm trong chính `options[]` của overlay đó — không chỉ kiểm tra key tồn tại.
   - Gọi cùng hàm vẽ overlay dùng chung (bản `node-canvas`) để ghép lại từ đầu bằng ảnh gốc client gửi + khung + overlayConfig thật từ DB.
   - Escape mọi giá trị `overlayValues` trước khi vẽ text (chống injection từ input người dùng cuối — kế thừa nguyên tắc "server không tin dữ liệu client").
   - Lưu kết quả vào storage, tạo record `GeneratedAvatar`.
   - Trả về URL ảnh kết quả.
   - Server không bao giờ nhận ảnh đã ghép sẵn từ client làm bản chính thức.

## 8. Trang chủ tự nhận diện Campaign đang active (đúng §4.3 báo cáo)

`GET /api/campaigns` trả về mảng, trang chủ (`app/page.tsx`) render danh sách tất cả Campaign thỏa điều kiện, mỗi Campaign dẫn tới `/c/[slug]`. Không có Campaign nào → trạng thái rỗng, không lỗi. Mỗi Campaign hiển thị theo đúng `displayConfig` và `language` riêng.

## 9. Ràng buộc

- Server luôn tự lấy `overlayConfig` từ DB theo Template thuộc đúng Campaign trong URL — không tin bất kỳ layout/overlay list nào client gửi lên (§4.2).
- `escapeXml`/escape tương đương bắt buộc trên mọi giá trị `overlayValues` chèn vào bước vẽ text server-side.
- Với `type: "select"`, giá trị gửi lên phải khớp `options[]`, không chỉ khớp key.
- Toàn bộ đọc/ghi ảnh đi qua interface `ImageStorage` duy nhất — đổi provider chỉ qua biến môi trường, không đổi code (§3.4).
- `GET /api/campaigns` (public, dùng cho trang chủ) phải trả về **mảng**, không phải object đơn — nhiều Campaign active song song không được loại trừ nhau (§3.3).
- Quyền `admin` chỉ đọc/ghi từ DB (`User.role`), không bao giờ suy ra từ claim Azure AD.
- Một Docker image duy nhất chạy được cả trên K8s nội bộ và Azure Container Apps, khác nhau chỉ ở biến môi trường (§3.1/§3.4).

## 10. Gate tổ chức chưa xác nhận (đúng §5 & §7 báo cáo — KHÔNG giả định đã duyệt)

Các task trong plan bị chặn bởi các gate sau phải note rõ, không thực thi trước khi có xác nhận:

| Gate | Chặn task nào | Ai xác nhận |
|---|---|---|
| Test `curl` thành công từ pod K8s nội bộ tới `login.microsoftonline.com` | Toàn bộ task NextAuth/Azure AD (auth) | Team hạ tầng |
| Xác nhận văn bản mục tiêu dual-deploy Azure + K8s nội bộ | Task viết Azure Blob adapter + manifest K8s | Chủ dự án |
| Chốt chính sách retention/cleanup ảnh (con số cụ thể) | Task cấu hình storage lifecycle/cleanup | Chủ dự án |
| Rà soát GA4 với team bảo mật dữ liệu | Bất kỳ task tracking nào (ngoài phạm vi MVP, không có task nào trong plan này đụng tới GA4) | Chủ dự án |

Plan không né các gate bằng cách âm thầm bỏ qua — mỗi task bị chặn ghi rõ "**⛔ CHẶN bởi gate: ...**" ngay đầu task.

## 11. Ngoài phạm vi (chưa làm ở bản này)

- Notification bell, analytics dashboard chi tiết (kế thừa demo — spec/plan nối tiếp riêng).
- Retention/cleanup job thật (chờ gate §10).
- GA4 / tracking (ngoài MVP theo báo cáo §6).
- Load test đa-Campaign bằng k6 (báo cáo §5/§6 yêu cầu trước khi chạy Campaign thật đầu tiên — là việc vận hành sau khi code xong, không phải một task viết code trong plan này; ghi chú trong "Bước tiếp theo" của plan).
- Manifest Kubernetes/Azure Container Apps chi tiết cho production (Dockerfile + docker-compose dev có trong plan; manifest triển khai thật chờ gate dual-deploy).
