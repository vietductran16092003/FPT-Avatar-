/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminCampaignsPage from "../../../src/app/admin/campaigns/page";
import { AdminLangProvider } from "../../../src/lib/admin-i18n";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <AdminLangProvider>
      <AdminCampaignsPage />
    </AdminLangProvider>,
  );
}

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

    renderPage();
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    (global.fetch as any).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/admin/campaigns/fpt38", expect.objectContaining({ method: "DELETE" }));
  });

  it("calls the DELETE endpoint when the admin confirms", async () => {
    mockCampaignsFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/admin/campaigns/fpt38", expect.objectContaining({ method: "DELETE" })));
  });
});

describe("AdminCampaignsPage create errors", () => {
  it("shows the server's duplicate-slug message when creation fails with a conflict", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Campaign slug "fpt38" already exists' }) });

    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Campaign mới" })).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "+ Campaign mới" }));
    await userEvent.type(screen.getByLabelText("Slug"), "fpt38");
    await userEvent.type(screen.getByLabelText("Tiêu đề (VI)"), "T");
    await userEvent.type(screen.getByLabelText("Ngày bắt đầu"), "2026-08-20");
    await userEvent.type(screen.getByLabelText("Ngày kết thúc"), "2026-08-28");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain('Campaign slug "fpt38" already exists'));
  });
});

describe("AdminCampaignsPage status pill", () => {
  it("cycles active to archived when the pill is clicked", async () => {
    mockCampaignsFetch();

    renderPage();
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByText("Hoạt động"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/campaigns/fpt38",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      }),
    ));
  });

  it("cycles archived to draft when the pill is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ slug: "fpt38", status: "archived", language: "vi", startDate: "2026-08-13", endDate: "2026-09-13", displayConfig: { title: "FPT 38" }, _count: { templates: 1 } }],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByText("Lưu trữ"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/campaigns/fpt38",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      }),
    ));
  });

  it("cycles draft to active when the pill is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ slug: "fpt38", status: "draft", language: "vi", startDate: "2026-08-13", endDate: "2026-09-13", displayConfig: { title: "FPT 38" }, _count: { templates: 1 } }],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByText("Nháp"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/campaigns/fpt38",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      }),
    ));
  });

  it("shows an error and does not reload when the PATCH fails", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ slug: "fpt38", status: "active", language: "vi", startDate: "2026-08-13", endDate: "2026-09-13", displayConfig: { title: "FPT 38" }, _count: { templates: 1 } }],
      })
      .mockResolvedValueOnce({ ok: false });

    renderPage();
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByText("Hoạt động"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});

describe("AdminCampaignsPage merged frames section", () => {
  function mockCampaignAndTemplatesFetch() {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/admin/campaigns" && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ slug: "fpt38", status: "active", language: "vi", startDate: "2026-08-13", endDate: "2026-09-13", displayConfig: { title: "FPT 38" }, _count: { templates: 1 } }],
        });
      }
      if (url === "/api/admin/campaigns/fpt38") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            slug: "fpt38",
            templates: [{ id: "t1", name: "Khung cam chuẩn", overlayConfig: { photoArea: { x: 18, y: 14, w: 64, h: 64 } } }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as unknown as typeof fetch;
  }

  it("shows the frames grid for an existing campaign being edited, not for a brand-new one", async () => {
    mockCampaignAndTemplatesFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Sửa" }));
    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());

    await userEvent.click(screen.getAllByRole("button", { name: "Đóng" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "+ Campaign mới" }));
    expect(screen.getByText("Lưu Campaign này trước để bắt đầu thêm khung ảnh.")).toBeTruthy();
    expect(screen.queryByText("Khung cam chuẩn")).toBeNull();
  });

  it("deletes a frame via the merged section using the existing template DELETE endpoint", async () => {
    mockCampaignAndTemplatesFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByText("FPT 38")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Sửa" }));
    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Xóa khung" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/campaigns/fpt38/templates/t1",
      expect.objectContaining({ method: "DELETE" }),
    ));
  });
});
