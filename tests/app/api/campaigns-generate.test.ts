import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    template: { findFirst: vi.fn() },
    campaign: { findUniqueOrThrow: vi.fn() },
    generatedAvatar: { create: vi.fn() },
  },
}));
vi.mock("../../../src/lib/storage", () => ({
  getStorage: () => ({
    upload: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: (key: string) => `http://storage/${key}`,
    delete: vi.fn(),
  }),
}));
vi.mock("../../../src/lib/compositing/server-compositor", () => ({
  compositeAvatar: vi.fn().mockResolvedValue(Buffer.from("png-bytes")),
}));

import { POST } from "../../../src/app/api/campaigns/[slug]/generate/route";
import { prisma } from "../../../src/lib/prisma";

const overlays = [
  { key: "joinYear", label: "L", labelEn: "L", type: "select", options: ["2021"], x: 10, y: 10, fontSize: 10, color: "#fff" },
];

function multipartRequest(overlayValues: object, templateId = "tpl1") {
  const form = new FormData();
  form.set("templateId", templateId);
  form.set("overlayValues", JSON.stringify(overlayValues));
  form.set("photo", new Blob([Buffer.from("photo-bytes")], { type: "image/png" }), "photo.png");
  return new Request("http://x/api/campaigns/fpt38/generate", { method: "POST", body: form });
}

describe("POST /api/campaigns/:slug/generate", () => {
  it("re-composites server-side and stores the result, ignoring any client-sent layout", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.campaign.findUniqueOrThrow as any).mockResolvedValue({ id: "c1", slug: "fpt38" });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });

    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resultUrl).toMatch(/^http:\/\/storage\//);
    expect(prisma.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tpl1", campaign: { slug: "fpt38" } },
    });
  });

  it("rejects overlayValues with a key not declared on the template", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });

    const res = await POST(multipartRequest({ notARealKey: "x" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("returns 404 when the template does not belong to the campaign in the URL", async () => {
    (prisma.template.findFirst as any).mockResolvedValue(null);

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(404);
  });
});
