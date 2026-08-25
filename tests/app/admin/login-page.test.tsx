/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signInMock = vi.fn();
let searchParamsValue = "";

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

import AdminLoginPage from "../../../src/app/admin/login/page";
import { MOCK_ADMIN_EMAIL } from "../../../src/lib/mock-fpt-auth";

const ORIGINAL_MOCK_FLAG = process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;

beforeEach(() => {
  searchParamsValue = "";
  delete process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;
});

afterEach(() => {
  cleanup();
  signInMock.mockClear();
  if (ORIGINAL_MOCK_FLAG === undefined) delete process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;
  else process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = ORIGINAL_MOCK_FLAG;
});

describe("AdminLoginPage", () => {
  it("shows a single FPT login button and no separate dev-login form", () => {
    render(<AdminLoginPage />);
    expect(screen.getByRole("button", { name: /Đăng nhập với tài khoản FPT/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText("ban@fpt.com.vn")).toBeNull();
  });

  it("uses the callbackUrl from the query string for the Azure AD button", async () => {
    searchParamsValue = "callbackUrl=%2Fc%2Ffpt38";
    render(<AdminLoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập với tài khoản FPT/ }));

    expect(signInMock).toHaveBeenCalledWith("azure-ad", { callbackUrl: "/c/fpt38" });
  });

  it("defaults to /admin/campaigns when there is no callbackUrl", async () => {
    render(<AdminLoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập với tài khoản FPT/ }));

    expect(signInMock).toHaveBeenCalledWith("azure-ad", { callbackUrl: "/admin/campaigns" });
  });

  it("signs in as the fixed mock ADMIN account instead of Azure AD when mock login is enabled", async () => {
    process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = "true";
    render(<AdminLoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập với tài khoản FPT/ }));

    expect(signInMock).toHaveBeenCalledWith("dev-login", { email: MOCK_ADMIN_EMAIL, callbackUrl: "/admin/campaigns" });
  });
});
