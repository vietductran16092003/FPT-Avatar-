# Thiết kế: Tổng quát hoá Text Overlay cho Template

> Ngày: 20/08/2026 · Trạng thái: Dự thảo, chờ duyệt

## 1. Bối cảnh

Backend admin API hiện tại ([docs/superpowers/specs/2026-08-20-admin-backend-api-design.md](2026-08-20-admin-backend-api-design.md)) đã xong, đã merge-ready. Trong đó, `Template.components` là mảng string cố định (`"joinYear" | "unit" | "slogan" | "signature"`), tham chiếu tới `COMPONENT_DEFS` hard-code trong [FE/js/config/constants.js](../../../FE/js/config/constants.js). Muốn thêm một loại field mới cho một Campaign/sự kiện khác (ví dụ "phòng ban", "số điện thoại") đòi hỏi sửa code và deploy lại — vi phạm mục tiêu "hệ thống dùng chung nhiều sự kiện, tạo Campaign/Template mới không cần sửa code" mà báo cáo kiến trúc của một dự án tham khảo khác (FCC-avatar, mục 3.2, `textOverlays` tổng quát ở cấp Template) đã nêu ra như một yêu cầu bắt buộc.

Spec này tổng quát hoá `components` thành `textOverlays` — một mảng tự mô tả (key, nhãn, kiểu nhập, vị trí, style) mà admin khai báo tự do khi tạo Template, không giới hạn trong danh sách cố định.

**Phạm vi:** chỉ overlay dạng chữ (text). Overlay dạng ảnh/icon (badge, logo) không nằm trong phạm vi bản này.

**Dữ liệu hiện có:** chưa có dữ liệu production thật — không cần migration script, chỉ cần đổi schema và seed lại dữ liệu mẫu theo format mới.

## 2. Mô hình dữ liệu

`Template.components: Json` (mảng string) → `Template.textOverlays: Json` (mảng object):

```ts
interface TextOverlay {
  key: string;              // định danh duy nhất trong phạm vi 1 Template, vd "joinYear"
  label: string;             // nhãn hiển thị tiếng Việt
  labelEn: string;           // nhãn hiển thị tiếng Anh
  type: "select" | "text";   // dropdown chọn sẵn hay gõ tự do
  options?: string[];        // bắt buộc khi type === "select", danh sách giá trị hợp lệ
  placeholder?: string;      // chỉ dùng khi type === "text"
  x: number;                 // vị trí % theo chiều ngang trên khung ảnh (0-100)
  y: number;                 // vị trí % theo chiều dọc (0-100)
  fontSize: number;          // px
  color: string;             // mã màu hex, vd "#ffffff"
}
```

`GeneratedAvatar.componentValues` đổi tên thành `overlayValues` (vẫn kiểu `Json`, chỉ đổi tên cho khớp ngữ nghĩa mới) — lưu `{ [overlay.key]: giá_trị_user_nhập }`.

`COMPONENT_DEFS`, `ComponentRegistry`, `getComponentDef`, `componentLabel` trong [FE/js/config/constants.js](../../../FE/js/config/constants.js) bị xoá hoàn toàn.

**Quyết định:** `textOverlays` lưu dạng JSON trên cột `Template`, không tách bảng riêng — overlay luôn được đọc/ghi trọn vẹn cùng Template, không có nhu cầu query xuyên overlay ở bất kỳ luồng nào trong spec này. Tách bảng riêng sẽ là over-engineering.

## 3. Ghép chữ vào ảnh — compositor (server + client)

### Server (`Backend/src/compositor.ts`, dùng `sharp`)

`sharp` không vẽ text trực tiếp nhưng composite được ảnh SVG. `compositeAvatar()` nhận thêm 2 tham số: `textOverlays: TextOverlay[]` và `overlayValues: Record<string,string>`. Hàm dựng một buffer SVG chứa `<text>` cho từng overlay có giá trị:

```ts
function buildOverlaySvg(overlays: TextOverlay[], values: Record<string,string>, w: number, h: number): Buffer {
  const texts = overlays
    .filter(o => values[o.key])
    .map(o => `<text x="${(o.x/100)*w}" y="${(o.y/100)*h}" font-size="${o.fontSize}" fill="${o.color}">${escapeXml(values[o.key])}</text>`)
    .join('');
  return Buffer.from(`<svg width="${w}" height="${h}">${texts}</svg>`);
}
```

Thứ tự composite: nền trong suốt → ảnh cá nhân (theo `photoArea`) → SVG chữ → khung PNG (frame) trên cùng. `escapeXml()` bắt buộc trên mọi giá trị chèn vào SVG — chống XML/SVG injection nếu user nhập ký tự đặc biệt vào ô text tự do (đây là input do người dùng cuối gõ, không phải admin, nên phải coi là untrusted).

### Validate ở `Backend/src/routes/generate.ts`

Giữ nguyên nguyên tắc bảo mật đã có (server tự lấy template/frame/photoArea từ DB, không tin client) — mở rộng thêm:
- `overlayValues` chỉ được chứa key nằm trong `template.textOverlays[].key` (đã có từ trước, không đổi).
- **Mới:** nếu overlay có `type === "select"`, giá trị gửi lên phải nằm trong chính `overlay.options` — không chỉ kiểm tra key tồn tại như hiện tại, còn phải kiểm tra value hợp lệ. Giá trị không khớp → 400.

### Client preview (`FE/js/core/avatar-composer.js`, Canvas API)

Hiện tại chỉ vẽ ảnh cá nhân + khung, chưa vẽ chữ. Thêm bước vẽ text bằng `ctx.fillText()` theo đúng `x/y/fontSize/color` từ mỗi overlay có giá trị, dùng chung công thức tính toạ độ `% → pixel` với server để preview khớp với bản chính thức server trả về.

## 4. UI Admin — form tạo Template với overlay + click chọn vị trí

**Form tạo/sửa Template** ([FE/js/core/admin-app.js](../../../FE/js/core/admin-app.js) + [FE/admin.html](../../../FE/admin.html)):

1. Upload khung ảnh PNG — giữ nguyên hành vi hiện tại, hiện preview ngay sau khi chọn file.
2. Khu vực "Text overlays" — danh sách overlay đã thêm, mỗi dòng gồm: input `key`, input `label`/`labelEn`, dropdown `type` (Chọn sẵn / Gõ tự do), textarea `options` (mỗi dòng 1 giá trị, chỉ hiện khi `type = select`), input `fontSize`, color picker `color`, và nút **"📍 Chọn vị trí"**.
3. Nút "+ Thêm overlay mới" ở cuối danh sách.

**Cơ chế click-to-place trên ảnh preview:**
- Bấm "📍 Chọn vị trí" ở một overlay → ảnh preview chuyển sang trạng thái "đang chọn vị trí" (con trỏ crosshair, toast "Click vào ảnh để đặt vị trí cho [label]").
- Click vào ảnh preview → `x% = (clickX / imageWidth) * 100`, tương tự `y%` → ghi vào overlay đó.
- Sau khi đặt, hiện một nhãn nhỏ đè lên ảnh preview (`position: absolute` div, không vẽ vào canvas thật) tại đúng vị trí, để admin thấy ngay overlay sẽ nằm ở đâu.
- Click lại để đặt vị trí mới. Kéo-thả để tinh chỉnh vị trí là cải tiến ngoài phạm vi bản này (click-to-set là đủ cho bản đầu).

**State mới trong `admin-app.js`:** `this.state.pendingOverlays` (mảng overlay đang soạn), `this.state.placingOverlayIndex` (overlay nào đang chờ click đặt vị trí). Submit form gửi `pendingOverlays` làm `textOverlays` lên API.

## 5. UI công khai — form nhập động cho user cuối

**[FE/js/core/public-app.js](../../../FE/js/core/public-app.js) Step 3** (nhập thông tin trước khi ghép ảnh): lặp trực tiếp qua `template.textOverlays` (không còn tra `COMPONENT_DEFS`):

```js
template.textOverlays.forEach(overlay => {
  const label = lang === 'vi' ? overlay.label : overlay.labelEn;
  if (overlay.type === 'select') {
    // render <select> với overlay.options
  } else {
    // render <input type="text"> với placeholder = overlay.placeholder
  }
});
```

Giá trị user nhập gom vào `overlayValues = { [overlay.key]: giá_trị }` — gửi lên `POST /api/campaigns/:slug/generate` (đổi tên field từ `componentValues` cứng sang `overlayValues` động, endpoint đã có sẵn từ trước, chỉ đổi nguồn dữ liệu).

**Preview trực tiếp:** gọi `AvatarComposer` (đã cập nhật ở mục 3) với `template.textOverlays` + `overlayValues` hiện tại — user thấy chữ xuất hiện đúng vị trí ngay khi gõ.

**Dọn dẹp:** xoá `componentRegistry`, `getComponentDef`, `componentLabel` khỏi `constants.js`; bỏ mọi chỗ import các hàm này trong `i18n.js`/`admin-app.js`/`public-app.js`.

## 6. Ràng buộc

- `escapeXml()` bắt buộc trên mọi giá trị overlay chèn vào SVG server-side — chống injection từ input người dùng cuối (kế thừa nguyên tắc "server không tin dữ liệu client" đã áp dụng cho ảnh, giờ áp dụng cho text).
- Server luôn tự lấy `textOverlays` từ DB theo Template thuộc đúng Campaign trong URL (không đổi so với thiết kế hiện có) — không tin danh sách overlay do client gửi lên.
- Với `type: "select"`, giá trị gửi lên phải khớp `options[]` — không chỉ khớp key.
- Không cần migration data cũ — xoá và seed lại theo format mới.
- Không làm overlay dạng ảnh/icon trong bản này.

## 7. Ngoài phạm vi (chưa làm ở bản này)

- Overlay dạng ảnh/icon (badge, logo phòng ban).
- Kéo-thả để tinh chỉnh vị trí overlay trên preview (chỉ có click-to-set).
- Copy/duplicate cấu hình overlay từ Template có sẵn sang Template mới.
- Font tuỳ chỉnh (font-family) — dùng font mặc định của SVG/canvas.
