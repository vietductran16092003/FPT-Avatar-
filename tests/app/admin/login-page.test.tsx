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

beforeEach(() => {
  searchParamsValue = "";
});

afterEach(() => {
  cleanup();
  signInMock.mockClear();
});

describe("AdminLoginPage", () => {
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
});
