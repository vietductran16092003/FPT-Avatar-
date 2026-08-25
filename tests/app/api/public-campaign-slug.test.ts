/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
vi.mock("@/lib/server/prisma", () => ({
  prisma: { campaign: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));
vi.mock("@/lib/server/storage", () => ({
  getStorage: () => ({ getPublicUrl: (key: string) => `http://storage/${key}` }),
}));

import { GET } from "../../../src/app/api/campaigns/[slug]/route";

beforeEach(() => {
  findUniqueMock.mockReset();
});

describe("GET /api/campaigns/[slug]", () => {
  it("includes frameImageUrl for each template", async () => {
    findUniqueMock.mockResolvedValue({
      slug: "fpt38",
      status: "active",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      templates: [{ id: "t1", frameImageKey: "frames/fpt38-orange.png" }],
    });

    const res = await GET(new Request("http://x"), { params: { slug: "fpt38" } });
    const body = await res.json();

    expect(body.templates[0].frameImageUrl).toBe("http://storage/frames/fpt38-orange.png");
  });

  it("returns 404 when the campaign is not publicly visible", async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await GET(new Request("http://x"), { params: { slug: "nope" } });

    expect(res.status).toBe(404);
  });
});
