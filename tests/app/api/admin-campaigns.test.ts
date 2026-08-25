import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../../src/lib/server/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/server/prisma", () => ({
  prisma: {
    campaign: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("../../../src/lib/server/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "../../../src/app/api/admin/campaigns/route";
import { PATCH, DELETE } from "../../../src/app/api/admin/campaigns/[slug]/route";
import { prisma } from "../../../src/lib/server/prisma";
import { requireAdmin } from "../../../src/lib/server/require-admin";
import { createNotification } from "../../../src/lib/server/notifications";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("mock", { code, clientVersion: "5.22.0" });
}

describe("admin campaigns API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAdmin as any).mockResolvedValue({ ok: true, userId: "admin1" });
  });

  it("GET lists all campaigns regardless of status", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([{ slug: "fpt38" }]);
    const res = await GET();
    expect((await res.json())).toHaveLength(1);
  });

  it("POST creates a campaign with displayConfig", async () => {
    (prisma.campaign.create as any).mockResolvedValue({ slug: "new-campaign" });
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "new-campaign", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "T" } }),
    }));
    expect(res.status).toBe(200);
    expect(prisma.campaign.create).toHaveBeenCalled();
  });

  it("POST returns 409 when the slug already exists", async () => {
    (prisma.campaign.create as any).mockRejectedValue(prismaError("P2002"));
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "fpt38", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "T" } }),
    }));
    expect(res.status).toBe(409);
  });

  it("PATCH rejects when requireAdmin fails", async () => {
    (requireAdmin as any).mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: "{}" }), { params: { slug: "fpt38" } });
    expect(res.status).toBe(401);
  });

  it("DELETE removes the campaign by slug", async () => {
    (prisma.campaign.delete as any).mockResolvedValue({ slug: "fpt38" });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38" } });
    expect(res.status).toBe(200);
    expect(prisma.campaign.delete).toHaveBeenCalledWith({ where: { slug: "fpt38" } });
  });

  it("DELETE returns 404 when the campaign does not exist", async () => {
    (prisma.campaign.delete as any).mockRejectedValue(prismaError("P2025"));
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "nope" } });
    expect(res.status).toBe(404);
  });

  it("DELETE returns 409 when the campaign still has generated avatars (foreign key restrict)", async () => {
    (prisma.campaign.delete as any).mockRejectedValue(prismaError("P2003"));
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38" } });
    expect(res.status).toBe(409);
  });

  it("POST notifies with the campaign title after creating", async () => {
    (prisma.campaign.create as any).mockResolvedValue({ slug: "techweek-2026", displayConfig: { title: "Tech Week 2026" } });

    await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "techweek-2026", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "Tech Week 2026" } }),
    }));

    expect(createNotification).toHaveBeenCalledWith('Đã tạo campaign mới "Tech Week 2026".', "campaign-create");
  });

  it("POST does not notify when the slug already exists", async () => {
    (prisma.campaign.create as any).mockRejectedValue(prismaError("P2002"));

    await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "fpt38", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "T" } }),
    }));

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("PATCH notifies with the campaign title after updating", async () => {
    (prisma.campaign.update as any).mockResolvedValue({ slug: "fpt38", displayConfig: { title: "FPT 38" } });

    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ status: "active" }) }), { params: { slug: "fpt38" } });

    expect(createNotification).toHaveBeenCalledWith('Đã cập nhật campaign "FPT 38".', "campaign-update");
  });

  it("DELETE notifies with the campaign title after deleting", async () => {
    (prisma.campaign.delete as any).mockResolvedValue({ slug: "fpt38", displayConfig: { title: "FPT 38" } });

    await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "fpt38" } });

    expect(createNotification).toHaveBeenCalledWith('Đã xoá campaign "FPT 38".', "campaign-delete");
  });

  it("DELETE does not notify when the campaign does not exist", async () => {
    (prisma.campaign.delete as any).mockRejectedValue(prismaError("P2025"));

    await DELETE(new Request("http://x", { method: "DELETE" }), { params: { slug: "nope" } });

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("POST rejects a slug that is not lowercase kebab-case", async () => {
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ slug: "Tech Week!", startDate: "2026-01-01", endDate: "2026-02-01", language: "vi", displayConfig: { title: "T" } }),
    }));

    expect(res.status).toBe(400);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it("PATCH ignores fields outside the whitelist, such as slug", async () => {
    (prisma.campaign.update as any).mockResolvedValue({ slug: "fpt38", displayConfig: { title: "FPT 38" } });

    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ status: "active", slug: "hacked-slug" }) }), { params: { slug: "fpt38" } });

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { slug: "fpt38" },
      data: { status: "active" },
    });
  });
});
