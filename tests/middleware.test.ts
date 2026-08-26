import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth/middleware", () => ({
  withAuth: vi.fn(() => vi.fn()),
}));

import { config } from "../src/middleware";

describe("middleware config", () => {
  it("does not gate the public home and campaign pages (they check session themselves)", () => {
    expect(config.matcher).not.toContain("/");
    expect(config.matcher).not.toContain("/c/:path*");
  });

  it("still gates admin pages except /admin/login", () => {
    expect(config.matcher).toContain("/admin/((?!login).*)");
  });
});
