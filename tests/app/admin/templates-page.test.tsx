/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useParams: () => ({ slug: "fpt38" }) }));

import AdminTemplatesPage from "../../../src/app/admin/campaigns/[slug]/templates/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockTemplatesFetch() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      templates: [{ id: "t1", name: "Khung cam chuẩn", overlayConfig: { photoArea: { x: 18, y: 14, w: 64, h: 64 } } }],
    }),
  });
}

describe("AdminTemplatesPage delete confirmation", () => {
  it("does not call the DELETE endpoint when the admin cancels the confirm dialog", async () => {
    mockTemplatesFetch();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<AdminTemplatesPage />);
    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());

    (global.fetch as any).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/admin/campaigns/fpt38/templates/t1", expect.objectContaining({ method: "DELETE" }));
  });

  it("calls the DELETE endpoint when the admin confirms", async () => {
    mockTemplatesFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminTemplatesPage />);
    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/admin/campaigns/fpt38/templates/t1", expect.objectContaining({ method: "DELETE" })));
  });
});

describe("AdminTemplatesPage template thumbnail", () => {
  it("renders the real frame image when frameImageUrl is present", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templates: [{ id: "t1", name: "Khung cam chuẩn", frameImageUrl: "http://storage/frames/fpt38-orange.png", overlayConfig: { photoArea: { x: 18, y: 14, w: 64, h: 64 } } }],
      }),
    });

    render(<AdminTemplatesPage />);

    const img = await screen.findByRole("img", { name: "Khung cam chuẩn" });
    expect(img.getAttribute("src")).toBe("http://storage/frames/fpt38-orange.png");
  });

  it("falls back to the gradient placeholder when frameImageUrl is absent", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templates: [{ id: "t1", name: "Khung cam chuẩn", overlayConfig: { photoArea: { x: 18, y: 14, w: 64, h: 64 } } }],
      }),
    });

    render(<AdminTemplatesPage />);

    await waitFor(() => expect(screen.getByText("Khung cam chuẩn")).toBeTruthy());
    expect(screen.queryByRole("img", { name: "Khung cam chuẩn" })).toBeNull();
  });
});
