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
});
