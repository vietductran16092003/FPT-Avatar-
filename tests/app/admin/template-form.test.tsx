/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateForm } from "../../../src/app/admin/campaigns/template-form";
import { AdminLangProvider } from "../../../src/lib/admin-i18n";

afterEach(() => {
  cleanup();
});

function renderTemplateForm(props: Parameters<typeof TemplateForm>[0]) {
  return render(
    <AdminLangProvider>
      <TemplateForm {...props} />
    </AdminLangProvider>,
  );
}

describe("TemplateForm", () => {
  it("submits name, frame image, photoArea and a manually added text overlay", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung cam chuẩn");

    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    await userEvent.click(screen.getByRole("button", { name: "Thêm trường overlay" }));
    await userEvent.type(screen.getByLabelText("Khóa (key)"), "joinYear");
    await userEvent.type(screen.getByLabelText("Nhãn tiếng Việt"), "Năm gia nhập");

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "Khung cam chuẩn",
      frameImage: file,
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([
          expect.objectContaining({ key: "joinYear", label: "Năm gia nhập" }),
        ]),
      }),
    }));
  });

  it("shows a validation error when name or frame image is missing", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("pre-fills from initial and submits without requiring a new frame image", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({
      onSubmit,
      initial: {
        name: "Khung cam chuẩn",
        overlayConfig: {
          photoArea: { x: 18, y: 14, w: 64, h: 64 },
          textOverlays: [{ key: "joinYear", label: "Năm gia nhập", labelEn: "Join year", type: "select", options: ["2020"], x: 50, y: 85, fontSize: 24, color: "#ffffff" }],
        },
      },
    });

    expect((screen.getByLabelText("Tên khung") as HTMLInputElement).value).toBe("Khung cam chuẩn");
    await userEvent.click(screen.getByRole("button", { name: "Cập nhật khung" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "Khung cam chuẩn",
      frameImage: null,
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([expect.objectContaining({ key: "joinYear" })]),
      }),
    }));
  });

  it("rejects a frame image over 5MB with a visible error and does not stage it", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung to");

    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), oversized);

    expect(screen.getByRole("alert").textContent).toMatch(/5MB/);

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears a previously staged valid file when a later oversized file is rejected", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung to");

    const valid = new File(["ok"], "small.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), valid);

    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), oversized);

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("displays the selected overlay type label, not its raw value", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.click(screen.getByRole("button", { name: "Thêm trường overlay" }));

    expect(screen.getByText("Tự do")).toBeTruthy();
  });

  it("adds a text overlay with default position when a text preset checkbox is ticked", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung preset");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    await userEvent.click(screen.getByLabelText("Câu châm ngôn"));
    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([
          expect.objectContaining({ key: "slogan", type: "text", label: "Câu châm ngôn" }),
        ]),
      }),
    }));
  });

  it("adds a select overlay with year options when the join-year preset is ticked", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung preset");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    await userEvent.click(screen.getByLabelText("Năm gia nhập FPT"));
    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    const currentYear = String(new Date().getFullYear());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([
          expect.objectContaining({ key: "joinYear", type: "select", options: expect.arrayContaining([currentYear, "1988"]) }),
        ]),
      }),
    }));
  });

  it("removes an untouched preset overlay immediately when its checkbox is unticked", async () => {
    const onSubmit = vi.fn();
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung preset");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    const checkbox = screen.getByLabelText("Chữ ký / Tên hiển thị");
    await userEvent.click(checkbox);
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.not.arrayContaining([expect.objectContaining({ key: "signature" })]),
      }),
    }));
  });

  it("asks for confirmation before removing a preset overlay the admin has edited, and keeps it if cancelled", async () => {
    const onSubmit = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTemplateForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung preset");
    const file = new File(["frame-bytes"], "frame.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), file);

    const checkbox = screen.getByLabelText("Câu châm ngôn");
    await userEvent.click(checkbox);
    // Edit the auto-added overlay's font size so it no longer matches the preset default.
    const fontSizeInputs = screen.getAllByLabelText("Cỡ chữ");
    await userEvent.clear(fontSizeInputs[0]);
    await userEvent.type(fontSizeInputs[0], "40");

    await userEvent.click(checkbox);
    expect(window.confirm).toHaveBeenCalled();
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      overlayConfig: expect.objectContaining({
        textOverlays: expect.arrayContaining([expect.objectContaining({ key: "slogan", fontSize: 40 })]),
      }),
    }));
  });

  it("pre-checks a preset checkbox when initial overlays already contain a matching key", () => {
    renderTemplateForm({
      onSubmit: vi.fn(),
      initial: {
        name: "Khung có sẵn",
        overlayConfig: {
          photoArea: { x: 20, y: 20, w: 60, h: 60 },
          textOverlays: [{ key: "unit", label: "Đơn vị công tác", labelEn: "Business unit", type: "select", options: ["FPT Software"], x: 50, y: 50, fontSize: 20, color: "#ffffff" }],
        },
      },
    });

    expect((screen.getByLabelText("Đơn vị công tác") as HTMLInputElement).checked).toBe(true);
  });
});
