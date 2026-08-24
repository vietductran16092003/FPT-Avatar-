import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    campaign: { findUnique: vi.fn() },
  },
}));
vi.mock("../../../src/lib/storage", () => ({
  getStorage: () => ({
    getPublicUrl: (key: string) => `http://storage/${key}`,
  }),
}));

import { GET } from "../../../src/app/api/admin/campaigns/[slug]/route";
import { prisma } from "../../../src/lib/prisma";
import { requireAdmin } from "../../../src/lib/require-admin";

describe("GET /api/admin/campaigns/:slug", () => {
  it("returns the campaign with its templates", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ slug: "fpt38", templates: [{ id: "t1", name: "Khung cam" }] });

    const res = await GET(new Request("http://x"), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(body.templates).toHaveLength(1);
    expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
      where: { slug: "fpt38" },
      include: { templates: true },
    });
  });

  it("returns 404 when the campaign does not exist", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue(null);

    const res = await GET(new Request("http://x"), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });

  it("rejects when requireAdmin fails", async () => {
    (requireAdmin as any).mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });

    const res = await GET(new Request("http://x"), { params: { slug: "fpt38" } });

    expect(res.status).toBe(401);
  });

  it("adds a computed frameImageUrl to each template", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({
      slug: "fpt38",
      templates: [{ id: "t1", name: "Khung cam", frameImageKey: "frames/fpt38-orange.png" }],
    });

    const res = await GET(new Request("http://x"), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(body.templates[0].frameImageUrl).toBe("http://storage/frames/fpt38-orange.png");
    expect(body.templates[0].name).toBe("Khung cam"); // existing fields still present
  });
});
