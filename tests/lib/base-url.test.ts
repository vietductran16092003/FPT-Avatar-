import { describe, it, expect } from "vitest";
import { getBaseUrl } from "../../src/lib/server/base-url";

describe("getBaseUrl", () => {
  it("returns an absolute origin for server-side calls (no window in this test environment)", () => {
    expect(getBaseUrl()).toBe(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000");
  });
});
