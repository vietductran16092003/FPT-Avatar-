import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/lib/prisma", () => ({
  prisma: { campaign: { findUnique: vi.fn() } },
}));

import { GET } from "../../../src/app/api/campaigns/[slug]/route";
import { prisma } from "../../../src/lib/prisma";

describe("GET /api/campaigns/:slug", () => {
  it("returns the campaign with its templates when found and active", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "1", slug: "fpt38", status: "active", startDate: new Date("2020-01-01"), endDate: new Date("2099-01-01"), templates: [] });

    const res = await GET(new Request("http://x/api/campaigns/fpt38"), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(body.slug).toBe("fpt38");
    expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
      where: { slug: "fpt38" },
      include: { templates: true },
    });
  });

  it("returns 404 when the campaign does not exist", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue(null);

    const res = await GET(new Request("http://x/api/campaigns/nope"), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the campaign exists but is not active (draft)", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "1", slug: "secret-draft", status: "draft", startDate: new Date("2020-01-01"), endDate: new Date("2099-01-01"), templates: [] });

    const res = await GET(new Request("http://x/api/campaigns/secret-draft"), { params: { slug: "secret-draft" } });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the campaign exists but is archived", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({ id: "1", slug: "old-one", status: "archived", startDate: new Date("2020-01-01"), endDate: new Date("2099-01-01"), templates: [] });

    const res = await GET(new Request("http://x/api/campaigns/old-one"), { params: { slug: "old-one" } });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the campaign is active but before its startDate", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({
      id: "1", slug: "future-campaign", status: "active",
      startDate: new Date("2099-01-01"), endDate: new Date("2099-06-01"), templates: [],
    });

    const res = await GET(new Request("http://x/api/campaigns/future-campaign"), { params: { slug: "future-campaign" } });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the campaign is active but after its endDate", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValue({
      id: "1", slug: "past-campaign", status: "active",
      startDate: new Date("2020-01-01"), endDate: new Date("2020-06-01"), templates: [],
    });

    const res = await GET(new Request("http://x/api/campaigns/past-campaign"), { params: { slug: "past-campaign" } });

    expect(res.status).toBe(404);
  });
});
