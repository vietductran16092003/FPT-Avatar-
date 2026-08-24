# Bắt buộc đăng nhập & hiển thị tài khoản trên trang công khai

Ngày: 2026-08-24
Trạng thái: Draft — chờ user review

## 1. Bối cảnh & mục tiêu

Sau khi hoàn thiện giao diện + luồng chức năng trang công khai (spec
`2026-08-23-public-site-demo-parity-design.md`), quyết định trước đó là
**không** yêu cầu khách vãng lai đăng nhập (khớp kiến trúc backend lúc
đó: `GeneratedAvatar.userId` optional, không có xác thực khách). User
giờ đảo lại quyết định này: trang công khai cần **bắt buộc đăng nhập
Azure AD ngay từ đầu**, giống demo, và hiển thị tài khoản + nút đăng
xuất trên header — giống hệt cách admin đang làm.

Khảo sát cho thấy hạ tầng NextAuth hiện tại **đã hỗ trợ sẵn user
thường** (không chỉ admin): `signIn` callback trong `auth-options.ts`
tự tạo `User` với `role: "user"` cho bất kỳ ai đăng nhập qua Azure AD
(chỉ dev-login mới được gán `role: "admin"`), và `getCurrentUser()`
trả về mọi user đã đăng nhập, không riêng admin. Phần còn thiếu chỉ là
nối hạ tầng này vào giao diện/luồng public.

## 2. Phạm vi đã chốt qua trao đổi

1. **Đăng nhập bắt buộc ngay từ đầu** — khách vào `/` hoặc `/c/[slug]`
   chưa đăng nhập sẽ bị chuyển hướng tới trang đăng nhập, giống demo.
2. **Dùng chung trang đăng nhập với admin** (`/admin/login`), không tạo
   trang `/login` riêng — nhưng phải phân biệt được ai đăng nhập (đã có
   sẵn qua `session.user.role`/`id`, chỉ cần dùng đúng).
3. Header public hiển thị avatar badge (chữ cái đầu) + nút đăng xuất —
   **y hệt pattern** `admin-header.tsx` đã có, viết component riêng cho
   public (không dùng chung, giữ đúng nguyên tắc tách biệt 2 khu vực đã
   áp dụng xuyên suốt — i18n, notification bell đều tách riêng).
4. Backend `/api/campaigns/[slug]/generate` gán `userId` thật vào
   `GeneratedAvatar` khi tạo — hiện field này tồn tại trong schema
   nhưng chưa từng được set (luôn `null`).

**Không đổi:**
- Không đổi Prisma schema (mọi field cần dùng đã có sẵn:
  `User.role`, `GeneratedAvatar.userId`).
- Không nới lỏng `requireAdmin()`/phân quyền admin hiện có.
- Không đổi Azure AD provider hay dev-login bypass.
- Không ảnh hưởng phạm vi middleware hiện tại cho `/admin/*` (chỉ mở
  rộng thêm, không thay đổi hành vi cũ).

## 3. Kiến trúc & các thay đổi theo khu vực

### 3.1 Middleware — mở rộng phạm vi bắt buộc đăng nhập

`src/middleware.ts` hiện tại:
```ts
export const config = { matcher: ["/admin/((?!login).*)"] };
```
Mở rộng `matcher` để chặn thêm 2 route công khai (`/` và `/c/[slug]`),
giữ nguyên `withAuth({ pages: { signIn: "/admin/login" } })`:
```ts
export const config = { matcher: ["/", "/c/:path*", "/admin/((?!login).*)"] };
```
`withAuth` mặc định chỉ yêu cầu **đã đăng nhập** (bất kỳ role nào) —
không kiểm tra role ở tầng middleware, đúng vì trang public không cần
phân biệt admin/user, chỉ cần "đã đăng nhập". Khi redirect, NextAuth tự
gắn `?callbackUrl=<đường-dẫn-gốc>` vào URL trang đăng nhập.

Route API (`/api/campaigns/*`, `/api/notifications`) **không** đưa vào
matcher này — middleware chỉ gate trang UI (trả về HTML/redirect), API
routes tự kiểm tra session bên trong handler (xem §3.3) vì cần trả JSON
401 thay vì redirect HTML.

### 3.2 Trang đăng nhập dùng chung

`src/app/admin/login/page.tsx` hiện hard-code
`callbackUrl: "/admin/campaigns"` cho cả 2 nút (Azure AD thật và dev
login). Sửa để đọc `callbackUrl` từ query string
(`useSearchParams().get("callbackUrl")`), mặc định về
`/admin/campaigns` khi không có (giữ nguyên hành vi cũ khi admin vào
thẳng `/admin/login`):
```tsx
const searchParams = useSearchParams();
const callbackUrl = searchParams.get("callbackUrl") ?? "/admin/campaigns";
// ...
onClick={() => signIn("azure-ad", { callbackUrl })}
```
`DevLoginForm` cũng nhận `callbackUrl` qua props thay vì hard-code.

Đổi câu mô tả từ "Đăng nhập bằng tài khoản FPT để quản trị." sang
"Đăng nhập bằng tài khoản FPT để tiếp tục." — trung lập cho cả admin
lẫn nhân viên thường, không đổi tiêu đề/logo/nút.

### 3.3 Header public: hiển thị tài khoản + đăng xuất

- `src/app/(public)/layout.tsx`: thêm `SessionProvider` (từ
  `next-auth/react`) bọc quanh `PublicLangProvider` — pattern y hệt
  `src/app/admin/layout.tsx` đã làm.
- `src/components/public-header.tsx`: thêm `AvatarBadge` (đọc
  `useSession()`, hiện chữ cái đầu tên/email) + nút đăng xuất
  (`signOut({ callbackUrl: "/admin/login" })`) — copy đúng cấu trúc từ
  `admin-header.tsx`'s `AvatarBadge`, viết bản riêng cho file này (theo
  đúng nguyên tắc không dùng chung component giữa 2 khu vực).

### 3.4 Backend: gán `userId` thật vào `GeneratedAvatar`

`src/app/api/campaigns/[slug]/generate/route.ts` hiện không kiểm tra
session, `userId` không bao giờ được set khi `prisma.generatedAvatar.create()`.
Thêm ở đầu handler:
```ts
import { getCurrentUser } from "@/lib/session";
// ...
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... logic hiện tại giữ nguyên ...
  await prisma.generatedAvatar.create({
    data: {
      campaignId: campaign.id,
      templateId: template.id,
      userId: user.id, // mới — trước đây không set, luôn null
      overlayValues,
      resultImageKey: resultKey,
    },
  });
```
Đây là lớp phòng thủ thứ 2 (middleware đã gate trang UI, nhưng API vẫn
có thể bị gọi trực tiếp) — khớp nguyên tắc hardening đã áp dụng xuyên
suốt dự án.

## 4. Data flow

```
Khách chưa đăng nhập vào "/" hoặc "/c/[slug]"
  → middleware chặn → redirect /admin/login?callbackUrl=<đường-dẫn-gốc>
  → bấm "Đăng nhập với tài khoản FPT" → Azure AD → signIn callback
    tạo/cập nhật User (role mặc định "user")
  → quay lại đúng đường-dẫn-gốc (callbackUrl)
  → Header public hiện avatar badge + nút đăng xuất
  → Tạo avatar → POST /generate → getCurrentUser() xác nhận đã đăng
    nhập → GeneratedAvatar lưu đúng userId
```

## 5. Error handling

- `getCurrentUser()` trả `null` trong `/generate` (trường hợp session
  hết hạn giữa chừng dù middleware đã gate trang) → 401, không crash.
- Middleware redirect giữ nguyên cơ chế NextAuth mặc định — không thêm
  logic tùy chỉnh, tránh vòng lặp redirect (đã có comment cảnh báo cũ
  về vấn đề này với `/admin/login`, giữ nguyên loại trừ đó).

## 6. Testing

Đã kiểm tra: chưa có test file nào cho `middleware.ts`,
`admin/login/page.tsx`, hay `/api/campaigns/[slug]/generate` — cả 3 đều
là test mới, không phải mở rộng.

- `tests/middleware.test.ts` (mới): xác nhận `matcher` export bao gồm
  `"/"`, `"/c/:path*"`, và pattern admin cũ — test cấu hình tĩnh (đọc
  giá trị `config.matcher`), không test hành vi runtime của `withAuth`
  (thư viện NextAuth đã tự có test riêng cho phần đó).
- `tests/app/admin/login-page.test.tsx` (mới): đọc đúng `callbackUrl`
  từ query string khi có, mặc định `/admin/campaigns` khi không có;
  cả nút Azure AD lẫn dev-login đều dùng đúng `callbackUrl` đã đọc.
- `tests/components/public-header.test.tsx` (đã có từ trước — mở
  rộng): thêm test hiển thị avatar badge + nút đăng xuất khi có
  session. Test cũ khẳng định "không có nút đăng xuất" cần cập nhật
  lại vì giờ **có** — đây là thay đổi hành vi có chủ đích của spec
  này, cập nhật test cho khớp, không phải regression.
- `tests/app/api/generate.test.ts` (mới — route `/generate` hiện chưa
  có test file riêng): thêm case 401 khi chưa đăng nhập, case `userId`
  được set đúng vào `GeneratedAvatar.create()` khi đã đăng nhập, cộng
  với việc giữ nguyên các case thành công/lỗi hiện có (validate
  overlay, 404 template/campaign...) nếu viết file test mới hoàn toàn
  cho route này lần đầu.
- Sau khi cài đặt: `npx tsc --noEmit`, `npx next build`, `npx vitest run`.

## 7. Ngoài phạm vi (không làm)

- Không tạo trang `/login` riêng cho public.
- Không đổi Prisma schema.
- Không đổi logic phân quyền admin (`requireAdmin()`).
- Không thêm UI hiển thị lịch sử avatar đã tạo theo từng user (chỉ lưu
  đúng `userId`, chưa làm màn hình xem lại).
