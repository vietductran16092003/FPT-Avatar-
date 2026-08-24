import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("../../src/lib/auth-options", () => ({ authOptions: {} }));
vi.mock("../../src/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { getCurrentUser } from "../../src/lib/session";
import { getServerSession } from "next-auth";
import { prisma } from "../../src/lib/prisma";

describe("getCurrentUser", () => {
  it("returns id and role from the DB user matching the session email", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "a@fpt.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "admin" });

    const user = await getCurrentUser();

    expect(user).toEqual({ id: "u1", role: "admin" });
  });

  it("returns null when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it("returns null when the session has no matching DB user", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "ghost@fpt.com" } });
    (prisma.user.findUnique as any).mockResolvedValue(null);
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });
});
