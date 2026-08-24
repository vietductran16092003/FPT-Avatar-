/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import AdminAnalyticsPage from "../../../src/app/admin/analytics/page";
import { AdminLangProvider } from "../../../src/lib/admin-i18n";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <AdminLangProvider>
      <AdminAnalyticsPage />
    </AdminLangProvider>,
  );
}

function mockAnalyticsFetch(campaigns: any[], byDay: { day: string; count: number }[] = []) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ campaigns, byDay }),
  });
}

describe("AdminAnalyticsPage", () => {
  it("fetches and renders one bar row per campaign with its download count", async () => {
    mockAnalyticsFetch([
      { slug: "techweek-2026", title: "Tech Week", count: 12 },
      { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5 },
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Tech Week")).toBeTruthy());
    expect(screen.getByText("FPT tròn 38 tuổi")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith("/api/admin/analytics");
  });

  it("shows an empty-state message when there are no campaigns yet", async () => {
    mockAnalyticsFetch([]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Chưa có dữ liệu.")).toBeTruthy());
  });

  it("shows an error message when the fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

    renderPage();

    await waitFor(() => expect(screen.getByText("Không tải được dữ liệu. Vui lòng thử lại.")).toBeTruthy());
  });

  it("renders KPI cards for total downloads, active campaigns, and the top campaign", async () => {
    mockAnalyticsFetch([
      { slug: "techweek-2026", title: "Tech Week", count: 12, status: "draft" },
      { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5, status: "active" },
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("17")).toBeTruthy());
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Tech Week")).toBeTruthy();
  });

  it("renders a 7-day bar for each day returned by the API", async () => {
    const byDay = [
      { day: "2026-08-16", count: 1 },
      { day: "2026-08-17", count: 2 },
      { day: "2026-08-18", count: 0 },
      { day: "2026-08-19", count: 4 },
      { day: "2026-08-20", count: 3 },
      { day: "2026-08-21", count: 5 },
      { day: "2026-08-22", count: 2 },
    ];
    mockAnalyticsFetch([{ slug: "fpt38", title: "FPT 38", count: 17, status: "active" }], byDay);

    renderPage();

    await waitFor(() => expect(screen.getByText("Lượt tải theo ngày (7 ngày gần nhất)")).toBeTruthy());
    expect(screen.getAllByTestId("day-chart-col")).toHaveLength(7);
  });

  it("renders the by-unit placeholder chart with its disclaimer note", async () => {
    mockAnalyticsFetch([{ slug: "fpt38", title: "FPT 38", count: 17, status: "active" }]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Lượt tải theo đơn vị")).toBeTruthy());
    expect(screen.getByText("(số liệu minh hoạ — chưa kết nối dữ liệu thật)")).toBeTruthy();
  });
});
