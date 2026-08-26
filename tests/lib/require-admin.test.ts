import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/server/session", () => ({ getCurrentUser: vi.fn() }));

import { requireAdmin } from "../../src/lib/server/require-admin";
import { getCurrentUser } from "../../src/lib/server/session";

describe("requireAdmin", () => {
  it("allows a user whose role is admin", async () => {
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "admin" });
    const result = await requireAdmin();
    expect(result.ok).toBe(true);
  });

  it("rejects a non-admin user with 403", async () => {
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects an unauthenticated request with 401", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
