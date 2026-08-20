# Thiết kế: Backend API cho Avatar Frame Platform (giữ nguyên FE vanilla JS)

> Ngày: 20/08/2026 · Trạng thái: Dự thảo, chờ duyệt

## 1. Bối cảnh

FE hiện tại ([FE/](../../../FE)) là vanilla JS + ES modules, không có backend thật — toàn bộ state (campaigns, templates, download counts, notifications) sống trong `localStorage` qua `AppStore` ([FE/js/core/store.js](../../../FE/js/core/store.js)). Mục tiêu: thêm một backend API thật cho phần admin, **không viết lại FE**, chỉ đổi `store.js` từ đọc/ghi `localStorage` sang gọi API.

Có tham khảo báo cáo kiến trúc và kế hoạch của một dự án song song (FCC-avatar, Next.js full-stack) cho nguyên tắc bảo mật ghép ảnh phía server, nhưng backend ở đây là **service Express riêng biệt**, không phải Next.js.

## 2. Stack

| Lớp | Công nghệ | Lý do |
|---|---|---|
| API server | Node.js + Express + TypeScript | Cùng ngôn ngữ với FE, đội quen thuộc |
| ORM/DB | Prisma + PostgreSQL | Quan hệ rõ ràng Campaign→Template→GeneratedAvatar |
| Storage ảnh | S3-compatible (MinIO cho dev, cloud S3-compatible cho prod) qua interface chung | Đổi provider không sửa code |
| Ghép ảnh server | `sharp` hoặc `node-canvas` (dùng lại logic vẽ của `avatar-composer.js` viết lại bằng Node) | Không tin ảnh client gửi lên |
| Auth admin | JWT, email/password (bcrypt hash) | Đơn giản, không phụ thuộc Azure AD |

## 3. Mô hình dữ liệu (Prisma)

```prisma
model AdminUser {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

model Campaign {
  id            String     @id @default(cuid())
  slug          String     @unique
  status        String     @default("draft") // draft | active | archived
  startDate     DateTime
  endDate       DateTime
  title         String
  titleEn       String
  description   String     @default("")
  descriptionEn String     @default("")
  cta           String     @default("Tạo avatar ngay")
  ctaEn         String     @default("Create your avatar")
  badge         String     @default("NEW")
  language      String     @default("vi")
  downloadCount Int        @default(0)
  templates     Template[]
  avatars       GeneratedAvatar[]
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
}

model Template {
  id           String   @id @default(cuid())
  campaignId   String
  campaign     Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  name         String
  frameImageKey String   // storage key của PNG khung
  photoArea    Json     // { x, y, w, h } theo % — giữ đúng format hiện tại của FE
  components   Json     // mảng key: ["joinYear","unit","slogan","signature"]
  avatars      GeneratedAvatar[]
  createdAt    DateTime @default(now())
}

model GeneratedAvatar {
  id           String   @id @default(cuid())
  campaignId   String
  campaign     Campaign @relation(fields: [campaignId], references: [id])
  templateId   String
  template     Template @relation(fields: [templateId], references: [id])
  componentValues Json  // giá trị user nhập cho từng component (joinYear/unit/slogan/signature)
  resultImageKey String // ảnh kết quả server đã ghép lại
  createdAt    DateTime @default(now())
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

`components` trên Template map 1-1 với `COMPONENT_DEFS` đã có ở [constants.js](../../../FE/js/config/constants.js) — không đổi khái niệm, chỉ chuyển từ hard-code phía FE sang dữ liệu do Template khai báo (đã đúng theo model hiện tại của `store.js`, không cần tổng quát hoá thêm như báo cáo FCC-avatar vì FE này không có khái niệm `joinYears` cứng trong schema Campaign).

## 4. Luồng ghép ảnh (bắt buộc server re-render)

1. **Preview (client):** `avatar-composer.js` ghép trực tiếp trong Canvas như hiện tại — không đổi, chỉ để xem trước.
2. **Tạo bản chính thức (server):** client gửi `POST /api/campaigns/:slug/generate` với `{ templateId, photoFile, componentValues }`. Server:
   - Lấy `frameImageKey` + `photoArea` + `components` thật từ DB theo `templateId` (không tin bất kỳ giá trị layout nào client gửi lên).
   - Validate `componentValues` chỉ chứa key nằm trong `template.components`.
   - Ghép ảnh gốc (`photoFile`) với khung bằng `sharp`/`node-canvas` phía server, dùng đúng `photoArea` đã lưu.
   - Lưu kết quả vào storage, tạo record `GeneratedAvatar`, tăng `Campaign.downloadCount`.
   - Trả về URL ảnh kết quả để user tải về.

## 5. API surface

**Public:**
- `GET /api/campaigns` — chỉ campaign `status=active` và trong khoảng ngày (trả mảng, hỗ trợ nhiều campaign active song song)
- `GET /api/campaigns/:slug` — chi tiết 1 campaign + templates
- `POST /api/campaigns/:slug/generate` — tạo avatar chính thức (multipart: ảnh gốc + componentValues)

**Admin (yêu cầu JWT, header `Authorization: Bearer <token>`):**
- `POST /api/auth/login` → `{ token }`
- `GET/POST /api/admin/campaigns`, `PATCH/DELETE /api/admin/campaigns/:slug`
- `POST/PATCH/DELETE /api/admin/campaigns/:slug/templates/:id` — POST dùng multipart để upload PNG khung
- `GET/DELETE /api/admin/notifications`, `PATCH /api/admin/notifications/read-all`
- `GET /api/admin/analytics` — thay thế mock data tĩnh hiện có trong `store.js` (`analytics.byCampaign/byUnit/byDay`) bằng số liệu tính từ `GeneratedAvatar`

## 6. Thay đổi phía FE

`store.js`, `admin-app.js`, `public-app.js` giữ nguyên method signatures hiện có (`saveCampaign`, `deleteCampaign`, `saveTemplate`, `recordDownload`, `addNotification`...), nhưng đổi thân hàm từ đọc/ghi `localStorage` đồng bộ sang `fetch()` bất đồng bộ tới API trên — các nơi gọi các hàm này trong `admin-app.js`/`public-app.js` cần thêm `await`. Thêm màn hình login đơn giản cho admin (lưu JWT vào `localStorage` dưới key riêng, không đụng `STORAGE_KEY` hiện có).

## 7. Ràng buộc

- Server không bao giờ nhận ảnh đã ghép sẵn từ client làm bản chính thức — chỉ nhận ảnh gốc + giá trị component, tự ghép lại (§4).
- Storage đi qua 1 interface duy nhất (upload/getPublicUrl/delete), đổi provider chỉ qua biến môi trường.
- `downloadCount` trên Campaign phải cộng dồn qua migration khi rename slug (giữ nguyên hành vi hiện có trong `saveCampaign` của `store.js`).
- Không dùng queue/worker riêng — quy mô nội bộ, xử lý đồng bộ ngay trên request.

## 8. Ngoài phạm vi (chưa làm ở bản này)

- SSO Azure AD (dùng JWT email/password đơn giản trước, nâng cấp sau nếu cần)
- Retention/cleanup policy cho ảnh (cần chốt số liệu cụ thể trước khi làm, giống khuyến nghị trong báo cáo FCC-avatar)
- Deploy K8s/Azure Container Apps chi tiết — sẽ làm plan riêng khi có yêu cầu hạ tầng cụ thể
