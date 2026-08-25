import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const signInMock = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signInMock(...args) }));

import { signInAsMockUser, signInAsMockAdmin, isMockFptLoginEnabled, MOCK_USER_EMAIL, MOCK_ADMIN_EMAIL } from "../../src/lib/mock-fpt-auth";

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;
});

afterEach(() => {
  signInMock.mockClear();
  if (ORIGINAL_FLAG === undefined) delete process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;
  else process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = ORIGINAL_FLAG;
});

describe("isMockFptLoginEnabled", () => {
  it("is false when the flag is unset", () => {
    expect(isMockFptLoginEnabled()).toBe(false);
  });

  it("is true only when the flag is exactly \"true\"", () => {
    process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = "true";
    expect(isMockFptLoginEnabled()).toBe(true);

    process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = "1";
    expect(isMockFptLoginEnabled()).toBe(false);
  });
});

describe("signInAsMockUser", () => {
  it("signs in with Azure AD when mock login is disabled", () => {
    signInAsMockUser("/c/fpt38");
    expect(signInMock).toHaveBeenCalledWith("azure-ad", { callbackUrl: "/c/fpt38" });
  });

  it("signs in as the fixed mock USER account when mock login is enabled", () => {
    process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = "true";
    signInAsMockUser("/c/fpt38");
    expect(signInMock).toHaveBeenCalledWith("dev-login", { email: MOCK_USER_EMAIL, callbackUrl: "/c/fpt38" });
  });
});

describe("signInAsMockAdmin", () => {
  it("signs in with Azure AD when mock login is disabled", () => {
    signInAsMockAdmin("/admin/campaigns");
    expect(signInMock).toHaveBeenCalledWith("azure-ad", { callbackUrl: "/admin/campaigns" });
  });

  it("signs in as the fixed mock ADMIN account when mock login is enabled", () => {
    process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = "true";
    signInAsMockAdmin("/admin/campaigns");
    expect(signInMock).toHaveBeenCalledWith("dev-login", { email: MOCK_ADMIN_EMAIL, callbackUrl: "/admin/campaigns" });
  });
});

describe("mock account identities", () => {
  it("uses two distinct fixed emails for the user and admin mock accounts", () => {
    expect(MOCK_USER_EMAIL).not.toBe(MOCK_ADMIN_EMAIL);
  });
});
