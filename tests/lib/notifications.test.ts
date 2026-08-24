import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    notification: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { createNotification } from "../../src/lib/notifications";
import { prisma } from "../../src/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.notification.findMany as any).mockResolvedValue([]);
});

describe("createNotification", () => {
  it("inserts a notification row with the given message and type", async () => {
    await createNotification('Đã tạo campaign mới "FPT 38".', "campaign-create");

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { message: 'Đã tạo campaign mới "FPT 38".', type: "campaign-create" },
    });
  });

  it("deletes notifications beyond the 50 newest", async () => {
    (prisma.notification.findMany as any).mockResolvedValue([{ id: "old1" }, { id: "old2" }]);

    await createNotification("msg", "campaign-create");

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      skip: 50,
      select: { id: true },
    });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["old1", "old2"] } },
    });
  });

  it("does not call deleteMany when there is nothing beyond 50", async () => {
    (prisma.notification.findMany as any).mockResolvedValue([]);

    await createNotification("msg", "campaign-create");

    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });
});
