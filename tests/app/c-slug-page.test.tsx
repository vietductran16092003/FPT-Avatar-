/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../src/lib/session", () => ({ getCurrentUser: vi.fn() }));
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

import CampaignPage from "../../src/app/(public)/c/[slug]/page";
import { getCurrentUser } from "../../src/lib/session";

beforeEach(() => {
  (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
  redirectMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CampaignPage", () => {
  it("shows a friendly message instead of the compositor when the campaign has no templates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slug: "empty-campaign", templates: [] }),
    });

    render(await CampaignPage({ params: { slug: "empty-campaign" } }));

    expect(screen.getByText("Chiến dịch này chưa có khung ảnh nào. Vui lòng quay lại sau.")).toBeTruthy();
  });

  it("renders the avatar creator when the campaign has templates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "fpt38",
        templates: [{ id: "t1", name: "Khung cam", frameImageUrl: "http://storage/frames/x.png", overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }],
      }),
    });

    render(await CampaignPage({ params: { slug: "fpt38" } }));

    expect(screen.queryAllByRole("button", { name: "TẢI ẢNH" })).toBeTruthy();
  });

  it("shows the campaign's display title as a heading above the tool", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "fpt38",
        displayConfig: { title: "Khung Avatar Chào mừng sinh nhật FPT lần thứ 38" },
        templates: [{ id: "t1", name: "Khung cam", frameImageUrl: "http://storage/frames/x.png", overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }],
      }),
    });

    render(await CampaignPage({ params: { slug: "fpt38" } }));

    expect(screen.getByRole("heading", { name: "Khung Avatar Chào mừng sinh nhật FPT lần thứ 38" })).toBeTruthy();
  });

  it("renders the avatar creator (no redirect) even when signed out", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: "fpt38",
        templates: [{ id: "t1", name: "Khung cam", frameImageUrl: "http://storage/frames/x.png", overlayConfig: { photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] } }],
      }),
    });

    render(await CampaignPage({ params: { slug: "fpt38" } }));

    expect(screen.queryAllByRole("button", { name: "TẢI ẢNH" })).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
