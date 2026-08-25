import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    template: { findFirst: vi.fn() },
    campaign: { findUnique: vi.fn() },
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
vi.mock("../../../src/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { POST } from "../../../src/app/api/campaigns/[slug]/generate/route";
import { prisma } from "../../../src/lib/prisma";
import { createNotification } from "../../../src/lib/notifications";
import { compositeAvatar } from "../../../src/lib/compositing/server-compositor";
import { getCurrentUser } from "../../../src/lib/session";

const overlays = [
  { key: "joinYear", label: "L", labelEn: "L", type: "select", options: ["2021"], x: 10, y: 10, fontSize: 10, color: "#fff" },
];

function multipartRequest(
  overlayValues: object | string,
  templateId = "tpl1",
  photoBytes: BlobPart = Buffer.from("photo-bytes"),
  language?: string,
  transform?: object | string,
) {
  const form = new FormData();
  form.set("templateId", templateId);
  form.set("overlayValues", typeof overlayValues === "string" ? overlayValues : JSON.stringify(overlayValues));
  form.set("photo", new Blob([photoBytes], { type: "image/png" }), "photo.png");
  if (language) form.set("language", language);
  if (transform !== undefined) form.set("transform", typeof transform === "string" ? transform : JSON.stringify(transform));
  return new Request("http://x/api/campaigns/fpt38/generate", { method: "POST", body: form });
}

describe("POST /api/campaigns/:slug/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (compositeAvatar as any).mockResolvedValue(Buffer.from("png-bytes"));
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "c1", slug: "fpt38", status: "active", startDate: new Date("2020-01-01"), endDate: new Date("2099-01-01"), displayConfig: { title: "FPT tròn 38 tuổi" } });
  });

  it("re-composites server-side and stores the result, ignoring any client-sent layout", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
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

  it("notifies admins after a successful avatar generation", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(createNotification).toHaveBeenCalledWith(
      "Có lượt tải avatar mới: FPT tròn 38 tuổi – Khung cam chuẩn.",
      "download",
    );
  });

  it("does not notify when the template does not belong to the campaign", async () => {
    (prisma.template.findFirst as any).mockResolvedValue(null);

    await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign does not exist", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue(null);

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the campaign is not active (draft)", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "c1", slug: "fpt38", status: "draft", startDate: new Date("2020-01-01"), endDate: new Date("2099-01-01"), displayConfig: {} });

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(404);
    expect(prisma.template.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign is active but outside its date range", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "c1", slug: "fpt38", status: "active", startDate: new Date("2099-01-01"), endDate: new Date("2099-06-01"), displayConfig: {} });

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(404);
    expect(prisma.template.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when the photo exceeds 10MB", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });

    const oversizedPhoto = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await POST(multipartRequest({ joinYear: "2021" }, "tpl1", oversizedPhoto), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("returns 400 when overlayValues is not valid JSON", async () => {
    const res = await POST(multipartRequest("{not-json"), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("returns 400 when overlayValues is missing entirely", async () => {
    const form = new FormData();
    form.set("templateId", "tpl1");
    form.set("photo", new Blob([Buffer.from("photo-bytes")], { type: "image/png" }), "photo.png");
    const req = new Request("http://x/api/campaigns/fpt38/generate", { method: "POST", body: form });

    const res = await POST(req, { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("returns 400 when overlayValues parses to a non-object (null)", async () => {
    const res = await POST(multipartRequest("null"), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("returns 400 when photo is not a file", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    const form = new FormData();
    form.set("templateId", "tpl1");
    form.set("overlayValues", JSON.stringify({ joinYear: "2021" }));
    form.set("photo", "not-a-file");
    const req = new Request("http://x/api/campaigns/fpt38/generate", { method: "POST", body: form });

    const res = await POST(req, { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no signed-in session", async () => {
    (getCurrentUser as any).mockResolvedValue(null);

    const res = await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(401);
    expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
  });

  it("stamps the signed-in user's id onto the created GeneratedAvatar", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(prisma.generatedAvatar.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1" }),
    });
  });

  it("defaults language to vi when the client sends none", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(prisma.generatedAvatar.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ language: "vi" }),
    });
    expect(compositeAvatar).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), "vi",
      { scale: 1, ox: 0, oy: 0 },
    );
  });

  it("stores and composites with language=en when the client requests English", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }, "tpl1", Buffer.from("photo-bytes"), "en"), { params: { slug: "fpt38" } });

    expect(prisma.generatedAvatar.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ language: "en" }),
    });
    expect(compositeAvatar).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), "en",
      { scale: 1, ox: 0, oy: 0 },
    );
  });

  it("forwards a well-formed transform to compositeAvatar", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }, "tpl1", Buffer.from("photo-bytes"), undefined, { scale: 2, ox: 0.2, oy: -0.1 }), { params: { slug: "fpt38" } });

    expect(compositeAvatar).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), "vi",
      { scale: 2, ox: 0.2, oy: -0.1 },
    );
  });

  it("clamps an out-of-range transform instead of passing it through raw", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }, "tpl1", Buffer.from("photo-bytes"), undefined, { scale: 999, ox: -9, oy: 9 }), { params: { slug: "fpt38" } });

    expect(compositeAvatar).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), "vi",
      { scale: 3, ox: -0.45, oy: 0.45 },
    );
  });

  it("falls back to the identity transform when none is sent", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }), { params: { slug: "fpt38" } });

    expect(compositeAvatar).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), "vi",
      { scale: 1, ox: 0, oy: 0 },
    );
  });

  it("falls back to the identity transform when transform is malformed JSON", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({
      id: "tpl1",
      name: "Khung cam chuẩn",
      frameImageKey: "frames/tpl1.png",
      overlayConfig: { photoArea: { x: 0, y: 0, w: 50, h: 50 }, textOverlays: overlays },
    });
    (prisma.generatedAvatar.create as any).mockResolvedValue({ id: "ga1" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("frame-bytes") });

    await POST(multipartRequest({ joinYear: "2021" }, "tpl1", Buffer.from("photo-bytes"), undefined, "{not-json"), { params: { slug: "fpt38" } });

    expect(compositeAvatar).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), "vi",
      { scale: 1, ox: 0, oy: 0 },
    );
  });
});
