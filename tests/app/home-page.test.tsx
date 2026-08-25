/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("../../src/lib/session", () => ({ getCurrentUser: vi.fn() }));

import HomePage from "../../src/app/(public)/page";
import { getCurrentUser } from "../../src/lib/session";

beforeEach(() => {
  localStorage.clear();
  (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
});

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

    expect(screen.getByRole("link").getAttribute("href")).toBe("/c/fpt38");
  });

  it("shows the English title/description/CTA when the saved public language is en", async () => {
    localStorage.setItem("afp_public_lang", "en");
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "fpt38", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi",
        displayConfig: {
          title: "FPT tròn 38 tuổi", titleEn: "FPT turns 38",
          description: "Mô tả", descriptionEn: "Description",
          ctaLabel: "Tạo avatar ngay", ctaEn: "Create now",
        },
        _count: { templates: 1 },
      }],
    });

    render(await HomePage());

    await waitFor(() => expect(screen.getByText("FPT turns 38")).toBeTruthy());
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Create now")).toBeTruthy();
  });

  it("shows the campaign dashboard (not a login prompt) even when signed out", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        slug: "fpt38", status: "active", startDate: "2026-01-01", endDate: "2026-12-31",
        language: "vi", displayConfig: { title: "FPT 38", description: "", ctaLabel: "Tạo avatar ngay" },
        _count: { templates: 1 },
      }],
    });

    render(await HomePage());

    expect(screen.getByRole("link").getAttribute("href")).toBe("/c/fpt38");
    expect(screen.queryByRole("button", { name: "Đăng nhập với tài khoản FPT" })).toBeNull();
  });
});
