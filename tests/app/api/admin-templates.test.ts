import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../../src/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    campaign: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1" }) },
    template: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("../../../src/lib/storage", () => ({
  getStorage: () => ({ upload: vi.fn().mockResolvedValue(undefined), getPublicUrl: (k: string) => `http://s/${k}`, delete: vi.fn() }),
}));

import { POST } from "../../../src/app/api/admin/campaigns/[slug]/templates/route";
import { PATCH, DELETE } from "../../../src/app/api/admin/campaigns/[slug]/templates/[id]/route";
import { prisma } from "../../../src/lib/prisma";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("mock", { code, clientVersion: "5.22.0" });
}

function templateForm() {
  const form = new FormData();
  form.set("name", "Khung cam chuẩn");
  form.set("overlayConfig", JSON.stringify({ photoArea: { x: 10, y: 10, w: 50, h: 50 }, textOverlays: [] }));
  form.set("frameImage", new Blob([Buffer.from("png")], { type: "image/png" }), "frame.png");
  return form;
}

describe("admin templates API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST uploads the frame image and creates a Template scoped to the campaign", async () => {
    (prisma.template.create as any).mockResolvedValue({ id: "t1", name: "Khung cam chuẩn" });

    const res = await POST(new Request("http://x", { method: "POST", body: templateForm() }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(200);
    expect(prisma.template.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ campaignId: "c1", name: "Khung cam chuẩn" }),
    }));
  });

  it("POST returns 404 when the campaign slug does not exist", async () => {
    (prisma.campaign.findUniqueOrThrow as any).mockRejectedValueOnce(prismaError("P2025"));

    const res = await POST(new Request("http://x", { method: "POST", body: templateForm() }), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });

  it("PATCH updates an existing template's overlayConfig", async () => {
    (prisma.template.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.template.findUnique as any).mockResolvedValue({ id: "t1" });

    const form = new FormData();
    form.set("overlayConfig", JSON.stringify({ photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] }));

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: form }),
      { params: { slug: "fpt38", id: "t1" } },
    );

    expect(res.status).toBe(200);
    expect(prisma.template.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "t1", campaign: { slug: "fpt38" } },
    }));
  });

  it("PATCH returns 404 when the template does not belong to the campaign", async () => {
    (prisma.template.updateMany as any).mockResolvedValue({ count: 0 });

    const form = new FormData();
    form.set("overlayConfig", JSON.stringify({ photoArea: { x: 0, y: 0, w: 10, h: 10 }, textOverlays: [] }));

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: form }),
      { params: { slug: "fpt38", id: "nope" } },
    );

    expect(res.status).toBe(404);
  });

  it("PATCH uploads a replacement frame image and updates frameImageKey", async () => {
    (prisma.template.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.template.findUnique as any).mockResolvedValue({ id: "t1" });

    const form = new FormData();
    form.set("name", "Khung cam chuẩn");
    form.set("frameImage", new Blob([Buffer.from("png")], { type: "image/png" }), "new-frame.png");

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: form }),
      { params: { slug: "fpt38", id: "t1" } },
    );

    expect(res.status).toBe(200);
    expect(prisma.template.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", campaign: { slug: "fpt38" } },
      data: expect.objectContaining({ name: "Khung cam chuẩn", frameImageKey: expect.stringMatching(/^frames\/fpt38-\d+\.png$/) }),
    });
  });

  it("PATCH leaves frameImageKey untouched when no replacement image is sent", async () => {
    (prisma.template.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.template.findUnique as any).mockResolvedValue({ id: "t1" });

    const form = new FormData();
    form.set("name", "Tên mới");

    await PATCH(
      new Request("http://x", { method: "PATCH", body: form }),
      { params: { slug: "fpt38", id: "t1" } },
    );

    expect(prisma.template.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", campaign: { slug: "fpt38" } },
      data: { name: "Tên mới" },
    });
  });

  it("PATCH returns 400 when the replacement frame image exceeds 5MB", async () => {
    const form = new FormData();
    form.set("frameImage", new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }), "big.png");

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: form }),
      { params: { slug: "fpt38", id: "t1" } },
    );

    expect(res.status).toBe(400);
    expect(prisma.template.updateMany).not.toHaveBeenCalled();
  });

  it("DELETE removes a template by id", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({ id: "t1" });
    (prisma.template.delete as any).mockResolvedValue({ id: "t1" });

    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38", id: "t1" } });

    expect(res.status).toBe(200);
    expect(prisma.template.findFirst).toHaveBeenCalledWith({ where: { id: "t1", campaign: { slug: "fpt38" } } });
    expect(prisma.template.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });

  it("DELETE returns 404 when the template does not exist", async () => {
    (prisma.template.findFirst as any).mockResolvedValue(null);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38", id: "nope" } });
    expect(res.status).toBe(404);
  });

  it("DELETE returns 409 when the template still has generated avatars", async () => {
    (prisma.template.findFirst as any).mockResolvedValue({ id: "t1" });
    (prisma.template.delete as any).mockRejectedValue(prismaError("P2003"));
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38", id: "t1" } });
    expect(res.status).toBe(409);
  });

  it("POST returns 400 when the frame image exceeds 5MB", async () => {
    const form = new FormData();
    form.set("name", "Khung to");
    form.set("overlayConfig", JSON.stringify({ photoArea: { x: 10, y: 10, w: 50, h: 50 }, textOverlays: [] }));
    form.set("frameImage", new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }), "big.png");

    const res = await POST(new Request("http://x", { method: "POST", body: form }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
    expect(prisma.template.create).not.toHaveBeenCalled();
  });

  it("POST returns 400 when overlayConfig is not valid JSON", async () => {
    const form = new FormData();
    form.set("name", "Khung to");
    form.set("overlayConfig", "{not-json");
    form.set("frameImage", new Blob([Buffer.from("png")], { type: "image/png" }), "frame.png");

    const res = await POST(new Request("http://x", { method: "POST", body: form }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("POST returns 400 when overlayConfig is missing entirely", async () => {
    const form = new FormData();
    form.set("name", "Khung to");
    form.set("frameImage", new Blob([Buffer.from("png")], { type: "image/png" }), "frame.png");

    const res = await POST(new Request("http://x", { method: "POST", body: form }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("POST returns 400 when overlayConfig parses to a non-object (null)", async () => {
    const form = new FormData();
    form.set("name", "Khung to");
    form.set("overlayConfig", "null");
    form.set("frameImage", new Blob([Buffer.from("png")], { type: "image/png" }), "frame.png");

    const res = await POST(new Request("http://x", { method: "POST", body: form }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("POST returns 400 when frameImage is not a file", async () => {
    const form = new FormData();
    form.set("name", "Khung to");
    form.set("overlayConfig", JSON.stringify({ photoArea: { x: 10, y: 10, w: 50, h: 50 }, textOverlays: [] }));
    form.set("frameImage", "not-a-file");

    const res = await POST(new Request("http://x", { method: "POST", body: form }), { params: { slug: "fpt38" } });

    expect(res.status).toBe(400);
  });

  it("PATCH ignores fields outside the whitelist, such as campaignId", async () => {
    (prisma.template.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.template.findUnique as any).mockResolvedValue({ id: "t1" });

    const form = new FormData();
    form.set("name", "Tên mới");
    form.set("campaignId", "other-campaign-id");

    await PATCH(
      new Request("http://x", { method: "PATCH", body: form }),
      { params: { slug: "fpt38", id: "t1" } },
    );

    expect(prisma.template.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", campaign: { slug: "fpt38" } },
      data: { name: "Tên mới" },
    });
  });
});
