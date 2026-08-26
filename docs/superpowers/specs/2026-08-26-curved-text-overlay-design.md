# Curved text overlay — design

Date: 2026-08-26
Status: approved, pending implementation plan

## Motivation

Khách hàng yêu cầu chữ overlay động (ví dụ "N NĂM LÀM FPT") uốn theo đường
cong của khung ảnh, giống dải ruy-băng vòng cung trong ảnh mẫu FPT gửi, thay
vì chỉ xoay thẳng một góc như hiện tại (`TextOverlay.rotation`).

Đây là tính năng **chung cho mọi khung**, admin tự bật/tắt và cấu hình khi
tạo/sửa khung trong trang quản trị — không phải hard-code riêng cho một
campaign.

## Current state

- `TextOverlay` (`src/lib/compositing/overlay-layout.ts`) mô tả một trường
  chữ: vị trí `x`/`y` (%), `fontSize`, `color`, `rotation` (độ, xoay cả
  chuỗi quanh 1 điểm — dùng cho ribbon chéo bake sẵn trong artwork).
- `resolveOverlayDraws()` là hàm thuần logic (không phụ thuộc canvas nào)
  chuyển `TextOverlay[]` + giá trị người dùng nhập thành `ResolvedDraw[]`
  (1 draw = 1 chuỗi chữ, có x/y/rotation/fontSize/color).
- Hai nơi tiêu thụ `ResolvedDraw[]` và tự vẽ:
  - **Client preview**: `use-avatar-canvas.ts`, dùng Fabric.js, vẽ 1
    `FabricText` mỗi draw.
  - **Server download**: `server-compositor.ts`, dùng `node-canvas`,
    `ctx.translate` + `ctx.rotate` + `ctx.fillText` mỗi draw.
  - Cả hai phải khớp pixel-tương-đối vì server luôn render lại từ đầu ở độ
    phân giải gốc, không xuất pixel từ canvas preview (spec gốc "Client
    Preview / Server Render split").
- Admin cấu hình từng overlay qua `template-form.tsx`: nhập tay `x`, `y`,
  `fontSize`, `color` bằng input số. `rotation` hiện KHÔNG có ô nhập trong
  UI (chỉ set thủ công qua DB/seed cho ribbon bake sẵn).
- `photo-area-picker.tsx` là ví dụ pattern kéo-thả % toạ độ sẵn có trong
  admin UI (không dùng thư viện ngoài, tự viết pointer event handlers).

## Data model

Thêm trường tuỳ chọn `curve` vào `TextOverlay`:

```ts
export interface TextOverlay {
  // ...existing fields unchanged...
  curve?: {
    centerX: number;  // % chiều rộng khung — tâm vòng tròn
    centerY: number;  // % chiều cao khung — tâm vòng tròn
    radius: number;   // % chiều rộng khung — bán kính
    angle: number;    // độ, quy ước toán học (0=phải, -90=trên, đo theo
                       // chiều kim đồng hồ dương) — góc của điểm GIỮA chữ
                       // trên đường tròn
    direction: "cw" | "ccw"; // chiều đọc chữ dọc theo cung, từ điểm giữa
                              // toả ra hai bên
  };
}
```

Quy tắc:

- Khi `curve` có giá trị: vị trí/góc xoay khi vẽ được tính hoàn toàn từ
  `curve`, bỏ qua `x`/`y`/`rotation` của overlay đó. Ba trường này VẪN được
  giữ nguyên trong dữ liệu lưu (không xoá, không đặt giá trị giả) — chỉ đơn
  giản không dùng tới khi `curve` tồn tại.
- Khi `curve` là `undefined` (overlay cũ, hoặc admin không bật): hành vi
  render giữ nguyên 100% như hiện tại — không có regression.
- `radius` được đo theo % chiều rộng khung (giống quy ước `x`), để nhất
  quán đơn vị với `centerX`/`centerY`; khi áp vào chiều cao (nếu khung
  không vuông) dùng cùng hệ số theo chiều rộng để hình tròn không bị méo
  thành elip.

## Admin UI — CurveTextPicker

File mới: `src/app/admin/campaigns/curve-text-picker.tsx`, cùng cấp và tái
dùng pattern pointer-drag % toạ độ của `photo-area-picker.tsx` (tự viết
`pointerdown`/`pointermove`/`pointerup` trên `window`, không dùng lib kéo
thả ngoài).

- Nền: ảnh khung đang chỉnh (giống `PhotoAreaPicker`).
- Hai điểm kéo được, vẽ trên 1 lớp SVG/overlay tuyệt đối phía trên ảnh:
  - **Điểm tâm** (chấm tròn nhỏ, màu primary) — kéo để đặt `centerX`,
    `centerY`.
  - **Điểm neo chữ** (chấm vuông) — kéo tự do trong khung; vị trí này
    được **suy ra ngược** thành `radius` (khoảng cách Euclid tới tâm, theo
    % chiều rộng) và `angle` (`atan2(dy, dx)` tính bằng độ).
  - Vẽ một vòng tròn viền mờ (dashed) nối tâm và bán kính hiện tại, để
    admin thấy trực quan cả cung tròn trước khi xem preview thật.
- Nút bật/tắt hai trạng thái **"Thuận kim đồng hồ" / "Ngược kim đồng hồ"**
  (`direction`), đặt cạnh khu vực kéo-thả.
- Trong `template-form.tsx`: thêm 1 checkbox "Chữ theo đường cong" trên mỗi
  overlay field. Khi tick, hiện `CurveTextPicker` thay cho 2 ô input X/Y số
  hiện có (giữ nguyên ô Cỡ chữ, Màu chữ — 2 trường này vẫn áp dụng cho chữ
  cong). Khi bỏ tick, `curve` bị xoá khỏi overlay draft (quay lại `x`/`y`
  mặc định 50/50 nếu chưa từng có).

## Rendering algorithm

Hàm thuần logic mới trong `overlay-layout.ts`, dùng chung cho cả client và
server — không đổi kiến trúc "logic dùng chung, vẽ riêng ở 2 nơi" hiện có:

```ts
export interface ResolvedCurvedDraw {
  char: string;
  x: number;
  y: number;
  rotation: number; // độ
  fontSize: number;
  color: string;
}

export function resolveCurvedDraws(
  text: string,
  curve: NonNullable<TextOverlay["curve"]>,
  fontSize: number,
  color: string,
  width: number,
  height: number,
  measureChar: (ch: string) => number, // đơn vị: px, đo bởi canvas context của nơi gọi
): ResolvedCurvedDraw[]
```

Các bước tính toán:

1. **Đo từng ký tự bằng `measureChar`** — hàm này được truyền vào từ nơi
   gọi (client dùng `fabric` canvas 2d context, server dùng `node-canvas`
   context), vì độ rộng chữ phụ thuộc font-rendering engine của từng môi
   trường; `overlay-layout.ts` không tự đoán độ rộng để tránh sai lệch
   giữa preview và bản tải về.
2. **Tính góc mỗi ký tự chiếm**: `charAngleRad = charWidthPx / radiusPx`
   (độ dài cung ≈ bán kính × góc radian, với ký tự đủ nhỏ so với bán
   kính). `radiusPx = curve.radius / 100 * width`.
3. **Dàn đều quanh `curve.angle`**: cộng dồn góc từng ký tự bắt đầu từ mép
   trái của chuỗi sao cho điểm giữa hình học của toàn chuỗi rơi đúng vào
   `curve.angle`; thứ tự cộng dồn theo `direction` (`cw` tăng góc theo
   chiều kim đồng hồ, `ccw` ngược lại).
4. **Vị trí + góc xoay từng ký tự**, với `angleᵢ` là góc (độ, chuyển sang
   radian khi tính lượng giác) của ký tự thứ *i*:
   - `x = centerX + radiusPx · cos(angleᵢ)`
   - `y = centerY + radiusPx · sin(angleᵢ)`
   - `rotation = angleᵢ + 90°` (chữ vuông góc với bán kính, hướng ra
     ngoài); nếu `direction === "ccw"`, cộng thêm 180° để chữ không bị úp
     ngược khi đọc từ trái sang phải theo chiều ngược kim đồng hồ.
5. Overlay có `curve`: trả về mảng `ResolvedCurvedDraw[]` (1 phần tử/ký
   tự) thay cho 1 `ResolvedDraw` duy nhất. Overlay không có `curve`: hành
   vi `resolveOverlayDraws()` giữ nguyên y hệt hiện tại — không đổi kiểu
   trả về cho trường hợp này.

## Vẽ ở client (Fabric) và server (node-canvas)

Cả hai nơi lặp qua mảng ký tự và vẽ đúng cách overlay thẳng đang vẽ hôm
nay (translate tới điểm, rotate, vẽ tại gốc toạ độ cục bộ) — không cần kỹ
thuật vẽ mới, chỉ vẽ nhiều ký tự thay vì một chuỗi:

- **Server** (`server-compositor.ts`): với overlay có `curve`, gọi
  `resolveCurvedDraws()` (đo ký tự bằng chính `ctx` của node-canvas qua
  `ctx.measureText`), rồi lặp `ctx.save()/translate/rotate/fillText(char,
  0, 0)/restore()` cho từng ký tự — cùng khối code đang dùng cho overlay
  thẳng, chỉ khác input là mảng ký tự.
- **Client** (`use-avatar-canvas.ts`): với overlay có `curve`, tạo nhiều
  `FabricText` (1 ký tự/object) thay vì 1 `FabricText` cho cả chuỗi, đặt
  `left`/`top`/`angle` theo từng draw ký tự. Đo ký tự bằng một canvas 2d
  context tạm (`document.createElement('canvas').getContext('2d')`,
  cùng `font` string với Fabric) trước khi gọi `resolveCurvedDraws()`.

## Testing

- `overlay-layout.test.ts`: test `resolveCurvedDraws()` với `measureChar`
  giả lập cố định — kiểm tra vị trí/góc từng ký tự đúng công thức, chiều
  `cw`/`ccw` cho kết quả đối xứng nhau qua `curve.angle`, và xác nhận
  overlay không có `curve` qua `resolveOverlayDraws()` cho kết quả giống
  hệt trước khi thêm tính năng (regression guard).
- `server-compositor.test.ts`: thêm case overlay có `curve` — assert số
  lần `fillText` gọi đúng bằng số ký tự, và vị trí/góc mỗi lần gọi khớp
  công thức (mock `ctx` hoặc kiểm tra qua ảnh render nếu test hiện tại làm
  vậy).
- `avatar-creator.test.tsx` / `c-slug-page.test.tsx`: đảm bảo preview
  không crash khi overlay có `curve`; không cần so khớp pixel chính xác —
  preview vốn đã là bản gần đúng theo thiết kế Client-Preview/Server-Render
  split có sẵn.

## Scope / non-goals

- Không tự động chuyển overlay cũ (đang dùng `x`/`y`/`rotation`) sang dạng
  cong — admin phải chủ động bật "Chữ theo đường cong" cho từng overlay
  muốn áp dụng.
- Không đổi Prisma schema — `curve` nằm trong `Template.overlayConfig`
  (cột Json sẵn có).
- Không hỗ trợ cung không tròn (ellipse, spline tự do) — chỉ cung tròn
  đơn giản, đúng nhu cầu ribbon vòng cung trong ảnh mẫu.
- Không đổi hành vi `rotation` (xoay thẳng) hiện có — hai cơ chế tồn tại
  song song, `curve` chỉ được set độc lập, không tương tác với
  `rotation`.
