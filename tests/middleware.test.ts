import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth/middleware", () => ({
  withAuth: vi.fn(() => vi.fn()),
}));

import { config } from "../src/middleware";

describe("middleware config", () => {
  it("gates the public home and campaign pages", () => {
    expect(config.matcher).toContain("/");
    expect(config.matcher).toContain("/c/:path*");
  });

  it("still gates admin pages except /admin/login", () => {
    expect(config.matcher).toContain("/admin/((?!login).*)");
  });
});
