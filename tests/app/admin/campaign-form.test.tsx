/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignForm } from "../../../src/app/admin/campaigns/campaign-form";

afterEach(() => {
  cleanup();
});

describe("CampaignForm", () => {
  it("submits slug, dates, language and displayConfig title entered by the admin", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề"), "Ngày hội Công nghệ FPT 2026");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      slug: "techweek-2026",
      startDate: "2026-08-20",
      endDate: "2026-08-28",
      displayConfig: expect.objectContaining({ title: "Ngày hội Công nghệ FPT 2026" }),
    }));
  });

  it("does not submit when a required field is missing", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("defaults status to draft when creating a new campaign", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề"), "T");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }));
  });

  it("pre-fills from initial and submits under the Cập nhật label when editing", async () => {
    const onSubmit = vi.fn();
    render(
      <CampaignForm
        onSubmit={onSubmit}
        initial={{
          slug: "fpt38",
          status: "active",
          startDate: "2026-08-13",
          endDate: "2026-09-13",
          language: "vi",
          displayConfig: { title: "FPT tròn 38 tuổi", description: "", ctaLabel: "Tạo avatar ngay" },
        }}
      />,
    );

    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("fpt38");
    await userEvent.click(screen.getByRole("button", { name: "Cập nhật" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ slug: "fpt38", status: "active" }));
  });
});
