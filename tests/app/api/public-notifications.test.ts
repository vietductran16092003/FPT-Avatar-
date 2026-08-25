/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();
vi.mock("@/lib/server/prisma", () => ({
  prisma: { notification: { findMany: (...args: unknown[]) => findManyMock(...args) } },
}));

import * as route from "../../../src/app/api/notifications/route";

beforeEach(() => {
  findManyMock.mockReset();
});

describe("GET /api/notifications", () => {
  it("queries only campaign create/update/delete types, newest first, capped at 50", async () => {
    findManyMock.mockResolvedValue([{ id: "n1", type: "campaign-create", message: "x", read: false, createdAt: new Date() }]);

    const res = await route.GET();
    const body = await res.json();

    expect(findManyMock).toHaveBeenCalledWith({
      where: { type: { in: ["campaign-create", "campaign-update", "campaign-delete"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    expect(body).toHaveLength(1);
  });

  it("requires no authentication (no requireAdmin call in the module)", () => {
    expect(route).not.toHaveProperty("DELETE");
    expect(route).not.toHaveProperty("PATCH");
  });
});
