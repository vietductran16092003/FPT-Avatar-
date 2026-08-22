/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import HomePage from "../../src/app/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HomePage", () => {
  it("shows a disabled hint instead of a link for a campaign with no templates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "empty-campaign", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi", displayConfig: { title: "Chưa có khung", description: "", ctaLabel: "Tạo avatar ngay" },
        _count: { templates: 0 },
      }],
    });

    render(await HomePage());

    expect(screen.getByText("Chưa có khung ảnh, vui lòng quay lại sau.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links to the campaign detail page when templates exist", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "fpt38", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi", displayConfig: { title: "FPT 38", description: "", ctaLabel: "Tạo avatar ngay" },
        _count: { templates: 1 },
      }],
    });

    render(await HomePage());

    expect(screen.getByRole("link")).toHaveAttribute("href", "/c/fpt38");
  });
});
