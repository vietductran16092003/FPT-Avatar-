/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminCampaignsPage from "../../../src/app/admin/campaigns/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockCampaignsFetch() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ slug: "fpt38", status: "active", language: "vi", startDate: "2026-08-13", endDate: "2026-09-13", displayConfig: { title: "FPT 38" }, _count: { templates: 1 } }],
  });
}

describe("AdminCampaignsPage delete confirmation", () => {
  it("does not call the DELETE endpoint when the admin cancels the confirm dialog", async () => {
    mockCampaignsFetch();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<AdminCampaignsPage />);
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    (global.fetch as any).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/admin/campaigns/fpt38", expect.objectContaining({ method: "DELETE" }));
  });

  it("calls the DELETE endpoint when the admin confirms", async () => {
    mockCampaignsFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminCampaignsPage />);
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/admin/campaigns/fpt38", expect.objectContaining({ method: "DELETE" })));
  });
});

describe("AdminCampaignsPage status pill", () => {
  it("PATCHes the opposite status when the pill is clicked", async () => {
    mockCampaignsFetch();

    render(<AdminCampaignsPage />);
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByText("Hoạt động"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/campaigns/fpt38",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      }),
    ));
  });
});
