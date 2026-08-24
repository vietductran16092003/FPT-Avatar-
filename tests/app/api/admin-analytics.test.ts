/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ ok: true }) }));

const findManyMock = vi.fn();
const groupByMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findMany: (...args: unknown[]) => findManyMock(...args) },
    generatedAvatar: { groupBy: (...args: unknown[]) => groupByMock(...args) },
  },
}));

import { GET } from "../../../src/app/api/admin/analytics/route";

beforeEach(() => {
  findManyMock.mockReset();
  groupByMock.mockReset();
});

describe("GET /api/admin/analytics", () => {
  it("returns campaigns and a 7-day byDay series", async () => {
    findManyMock.mockResolvedValue([
      { slug: "fpt38", status: "active", displayConfig: { title: "FPT 38" }, _count: { avatars: 5 } },
    ]);
    groupByMock.mockResolvedValue([
      { createdAt: new Date("2026-08-20T00:00:00.000Z"), _count: { _all: 3 } },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.campaigns[0]).toMatchObject({ slug: "fpt38", title: "FPT 38", count: 5, status: "active" });
    expect(Array.isArray(body.byDay)).toBe(true);
    expect(body.byDay).toHaveLength(7);
    expect(body.byDay.every((d: any) => typeof d.day === "string" && typeof d.count === "number")).toBe(true);
  });
});
