import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../../src/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin1" }),
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    notification: { findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  },
}));

import { GET, DELETE as DELETE_ALL } from "../../../src/app/api/admin/notifications/route";
import { PATCH } from "../../../src/app/api/admin/notifications/mark-all-read/route";
import { DELETE as DELETE_ONE } from "../../../src/app/api/admin/notifications/[id]/route";
import { prisma } from "../../../src/lib/prisma";
import { requireAdmin } from "../../../src/lib/require-admin";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("mock", { code, clientVersion: "5.22.0" });
}

describe("admin notifications API", () => {
  it("GET returns the 50 most recent notifications", async () => {
    (prisma.notification.findMany as any).mockResolvedValue([
      { id: "n1", message: "m", type: "campaign-create", read: false, createdAt: new Date() },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" }, take: 50 });
  });

  it("GET rejects when requireAdmin fails", async () => {
    (requireAdmin as any).mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("DELETE (collection) clears every notification", async () => {
    const res = await DELETE_ALL();

    expect(res.status).toBe(200);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({});
  });

  it("PATCH mark-all-read sets read true on every notification", async () => {
    const res = await PATCH();

    expect(res.status).toBe(200);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ data: { read: true } });
  });

  it("DELETE /[id] removes the notification by id", async () => {
    (prisma.notification.delete as any).mockResolvedValue({ id: "n1" });

    const res = await DELETE_ONE(new Request("http://x", { method: "DELETE" }), { params: { id: "n1" } });

    expect(res.status).toBe(200);
    expect(prisma.notification.delete).toHaveBeenCalledWith({ where: { id: "n1" } });
  });

  it("DELETE /[id] returns 404 when the notification does not exist", async () => {
    (prisma.notification.delete as any).mockRejectedValue(prismaError("P2025"));

    const res = await DELETE_ONE(new Request("http://x", { method: "DELETE" }), { params: { id: "nope" } });

    expect(res.status).toBe(404);
  });
});
