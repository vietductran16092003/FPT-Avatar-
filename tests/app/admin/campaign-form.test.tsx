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
    await userEvent.type(screen.getByLabelText("Tiêu đề (VI)"), "Ngày hội Công nghệ FPT 2026");
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
    await userEvent.type(screen.getByLabelText("Tiêu đề (VI)"), "T");
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

  it("submits Badge, Mô tả and Nhãn CTA entered by the admin", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề (VI)"), "T");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.type(screen.getByLabelText("Badge"), "38");
    await userEvent.type(screen.getByLabelText("Mô tả (VI)"), "Tạo avatar kỷ niệm");
    await userEvent.clear(screen.getByLabelText("Nhãn nút CTA (VI)"));
    await userEvent.type(screen.getByLabelText("Nhãn nút CTA (VI)"), "Bắt đầu ngay");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      displayConfig: expect.objectContaining({ badge: "38", description: "Tạo avatar kỷ niệm", ctaLabel: "Bắt đầu ngay" }),
    }));
  });

  it("submits archived status when selected from the status dropdown", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề (VI)"), "T");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.click(screen.getByLabelText("Trạng thái"));
    await userEvent.click(screen.getByText("Lưu trữ"));
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
  });

  it("rejects a slug that is not lowercase kebab-case", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "Tech Week 2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề (VI)"), "T");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("chữ thường, số và dấu gạch ngang");
  });

  it("pre-fills Badge, Mô tả and Nhãn CTA from initial when editing", async () => {
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
          displayConfig: { title: "FPT tròn 38 tuổi", description: "Mô tả cũ", ctaLabel: "CTA cũ", badge: "38" },
        }}
      />,
    );

    expect((screen.getByLabelText("Badge") as HTMLInputElement).value).toBe("38");
    expect((screen.getByLabelText("Mô tả (VI)") as HTMLTextAreaElement).value).toBe("Mô tả cũ");
    expect((screen.getByLabelText("Nhãn nút CTA (VI)") as HTMLInputElement).value).toBe("CTA cũ");
  });

  it("displays the selected status and language labels, not their raw values", () => {
    render(
      <CampaignForm
        onSubmit={vi.fn()}
        initial={{
          slug: "fpt38",
          status: "archived",
          startDate: "2026-08-13",
          endDate: "2026-09-13",
          language: "en",
          displayConfig: { title: "T", description: "", ctaLabel: "CTA" },
        }}
      />,
    );

    expect(screen.getByText("Lưu trữ")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
  });

  it("submits titleEn, descriptionEn and ctaEn entered by the admin", async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Slug"), "techweek-2026");
    await userEvent.type(screen.getByLabelText("Tiêu đề (VI)"), "Ngày hội Công nghệ");
    await userEvent.type(screen.getByLabelText("Tiêu đề (EN)"), "Tech Day");
    await userEvent.type(screen.getByLabelText("Mô tả (EN)"), "An event for FPT staff");
    await userEvent.type(screen.getByLabelText("Nhãn nút CTA (EN)"), "Start now");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      displayConfig: expect.objectContaining({
        titleEn: "Tech Day",
        descriptionEn: "An event for FPT staff",
        ctaEn: "Start now",
      }),
    }));
  });

  it("pre-fills titleEn, descriptionEn and ctaEn from initial when editing", async () => {
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
          displayConfig: {
            title: "FPT tròn 38 tuổi",
            titleEn: "FPT turns 38",
            description: "",
            descriptionEn: "Sample",
            ctaLabel: "Tạo avatar ngay",
            ctaEn: "Create now",
          },
        }}
      />,
    );

    expect((screen.getByLabelText("Tiêu đề (EN)") as HTMLInputElement).value).toBe("FPT turns 38");
    expect((screen.getByLabelText("Mô tả (EN)") as HTMLTextAreaElement).value).toBe("Sample");
    expect((screen.getByLabelText("Nhãn nút CTA (EN)") as HTMLInputElement).value).toBe("Create now");
  });
});
