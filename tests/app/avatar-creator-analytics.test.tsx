/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicLangProvider } from "../../src/lib/public-i18n";
import { AvatarCreator, type Template } from "../../src/app/(public)/c/[slug]/avatar-creator";
import { trackEvent } from "../../src/lib/analytics/ga4-client";

vi.mock("../../src/lib/analytics/ga4-client", () => ({ trackEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const templates: Template[] = [
  {
    id: "t1",
    name: "Khung cam",
    frameImageUrl: "http://storage/frames/orange.png",
    overlayConfig: {
      photoArea: { x: 10, y: 10, w: 60, h: 60 },
      textOverlays: [
        { key: "unit", label: "Đơn vị", labelEn: "Unit", type: "select", options: ["FPT Software", "FPT Telecom"], x: 50, y: 70, fontSize: 20, color: "#fff" },
      ],
    },
  },
  {
    id: "t2",
    name: "Khung xanh",
    frameImageUrl: "http://storage/frames/blue.png",
    overlayConfig: { photoArea: { x: 10, y: 10, w: 60, h: 60 }, textOverlays: [] },
  },
];

function renderCreator() {
  return render(
    <PublicLangProvider>
      <AvatarCreator slug="fpt38" templates={templates} />
    </PublicLangProvider>,
  );
}

function getDownloadButton() {
  return screen.getAllByRole("button", { name: "TẢI ẢNH" })[0];
}

describe("AvatarCreator — GA4 event tracking", () => {
  it("fires campaign_view once on mount with the campaign slug", () => {
    renderCreator();
    expect(trackEvent).toHaveBeenCalledWith("campaign_view", { campaign_slug: "fpt38" });
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("fires template_select with the campaign slug and chosen template id", async () => {
    renderCreator();
    vi.clearAllMocks();

    await userEvent.click(screen.getByRole("button", { name: /Khung xanh/ }));

    expect(trackEvent).toHaveBeenCalledWith("template_select", { campaign_slug: "fpt38", template_id: "t2" });
  });

  it("fires avatar_download with campaign slug, template id, and every overlay field the user filled in", async () => {
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/campaigns/fpt38/generate") {
        return Promise.resolve({ ok: true, json: async () => ({ resultUrl: "http://storage/results/t1-123.png" }) });
      }
      return Promise.resolve({ blob: async () => new Blob(["png-bytes"], { type: "image/png" }) });
    }) as any;

    renderCreator();
    vi.clearAllMocks();

    const file = new File(["photo-bytes"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Telecom");

    await userEvent.click(getDownloadButton());

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("avatar_download", {
        campaign_slug: "fpt38",
        template_id: "t1",
        unit: "FPT Telecom",
      }),
    );
  });

  it("does not fire avatar_download when /generate fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });

    renderCreator();
    vi.clearAllMocks();

    const file = new File(["photo-bytes"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Telecom");

    await userEvent.click(getDownloadButton());

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(trackEvent).not.toHaveBeenCalledWith("avatar_download", expect.anything());
  });
});
