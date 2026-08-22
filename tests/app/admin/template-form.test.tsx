/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateForm } from "../../../src/app/admin/campaigns/[slug]/templates/template-form";

afterEach(() => {
  cleanup();
});

describe("TemplateForm", () => {
  it("submits name, frame image, photoArea and a manually added text overlay", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);

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
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("pre-fills from initial and submits without requiring a new frame image", async () => {
    const onSubmit = vi.fn();
    render(
      <TemplateForm
        onSubmit={onSubmit}
        initial={{
          name: "Khung cam chuẩn",
          overlayConfig: {
            photoArea: { x: 18, y: 14, w: 64, h: 64 },
            textOverlays: [{ key: "joinYear", label: "Năm gia nhập", labelEn: "Join year", type: "select", options: ["2020"], x: 50, y: 85, fontSize: 24, color: "#ffffff" }],
          },
        }}
      />,
    );

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
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Tên khung"), "Khung to");

    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Ảnh khung (PNG)"), oversized);

    expect(screen.getByRole("alert").textContent).toMatch(/5MB/);

    await userEvent.click(screen.getByRole("button", { name: "Lưu khung" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears a previously staged valid file when a later oversized file is rejected", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);

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
    render(<TemplateForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Thêm trường overlay" }));

    expect(screen.getByText("Tự do")).toBeTruthy();
  });
});
