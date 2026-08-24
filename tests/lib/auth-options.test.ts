import { describe, it, expect, afterEach } from "vitest";
import { isDevLoginAdminEmail } from "../../src/lib/auth-options";

const ORIGINAL_ENV = process.env.DEV_LOGIN_ADMIN_EMAILS;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.DEV_LOGIN_ADMIN_EMAILS;
  else process.env.DEV_LOGIN_ADMIN_EMAILS = ORIGINAL_ENV;
});

describe("isDevLoginAdminEmail", () => {
  it("returns false for any email when the allowlist is unset", () => {
    delete process.env.DEV_LOGIN_ADMIN_EMAILS;
    expect(isDevLoginAdminEmail("anyone@fpt.com.vn")).toBe(false);
  });

  it("returns false for an email not on the allowlist", () => {
    process.env.DEV_LOGIN_ADMIN_EMAILS = "admin@fpt.com.vn";
    expect(isDevLoginAdminEmail("someone-else@fpt.com.vn")).toBe(false);
  });

  it("returns true for an email on the allowlist", () => {
    process.env.DEV_LOGIN_ADMIN_EMAILS = "admin@fpt.com.vn";
    expect(isDevLoginAdminEmail("admin@fpt.com.vn")).toBe(true);
  });

  it("matches case-insensitively", () => {
    process.env.DEV_LOGIN_ADMIN_EMAILS = "Admin@FPT.com.vn";
    expect(isDevLoginAdminEmail("admin@fpt.com.vn")).toBe(true);
  });

  it("supports multiple comma-separated emails with surrounding whitespace", () => {
    process.env.DEV_LOGIN_ADMIN_EMAILS = "a@fpt.com.vn, b@fpt.com.vn ,c@fpt.com.vn";
    expect(isDevLoginAdminEmail("b@fpt.com.vn")).toBe(true);
    expect(isDevLoginAdminEmail("d@fpt.com.vn")).toBe(false);
  });
});
