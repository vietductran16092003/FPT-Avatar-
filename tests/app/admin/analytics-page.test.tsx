/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import AdminAnalyticsPage from "../../../src/app/admin/analytics/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminAnalyticsPage", () => {
  it("fetches and renders one bar row per campaign with its download count", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { slug: "techweek-2026", title: "Tech Week", count: 12 },
        { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5 },
      ],
    });

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Tech Week")).toBeTruthy());
    expect(screen.getByText("FPT tròn 38 tuổi")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith("/api/admin/analytics");
  });

  it("shows an empty-state message when there are no campaigns yet", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy());
  });
});
