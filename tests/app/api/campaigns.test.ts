import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: { campaign: { findMany: vi.fn() } },
}));

import { GET } from "../../../src/app/api/campaigns/route";
import { prisma } from "../../../src/lib/prisma";

describe("GET /api/campaigns", () => {
  it("returns every active campaign currently within its date range as an array", async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      { id: "1", slug: "fpt38", status: "active", _count: { templates: 1 } },
      { id: "2", slug: "techweek-2026", status: "active", _count: { templates: 2 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(prisma.campaign.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "active",
        startDate: expect.objectContaining({ lte: expect.any(Date) }),
        endDate: expect.objectContaining({ gte: expect.any(Date) }),
      }),
      include: { _count: { select: { templates: true } } },
    }));
  });
});
