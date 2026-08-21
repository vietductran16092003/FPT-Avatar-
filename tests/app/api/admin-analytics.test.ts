import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: { campaign: { findMany: vi.fn() } },
}));

import { GET } from "../../../src/app/api/admin/analytics/route";
import { prisma } from "../../../src/lib/prisma";
import { requireAdmin } from "../../../src/lib/require-admin";

describe("GET /api/admin/analytics", () => {
  it("returns each campaign's generated-avatar count, sorted descending", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      { slug: "fpt38", displayConfig: { title: "FPT tròn 38 tuổi" }, _count: { avatars: 5 } },
      { slug: "techweek-2026", displayConfig: { title: "Tech Week" }, _count: { avatars: 12 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual([
      { slug: "techweek-2026", title: "Tech Week", count: 12 },
      { slug: "fpt38", title: "FPT tròn 38 tuổi", count: 5 },
    ]);
    expect(prisma.campaign.findMany).toHaveBeenCalledWith({
      select: { slug: true, displayConfig: true, _count: { select: { avatars: true } } },
    });
  });

  it("falls back to the slug when displayConfig has no title", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      { slug: "no-title-campaign", displayConfig: {}, _count: { avatars: 0 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual([{ slug: "no-title-campaign", title: "no-title-campaign", count: 0 }]);
  });

  it("returns 401 when requireAdmin fails", async () => {
    (requireAdmin as any).mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
