/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signInMock = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signInMock(...args) }));

import { LoginGate } from "../../src/app/(public)/login-gate";
import { MOCK_USER_EMAIL } from "../../src/lib/mock-fpt-auth";

const ORIGINAL_MOCK_FLAG = process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;
});

afterEach(() => {
  cleanup();
  signInMock.mockClear();
  if (ORIGINAL_MOCK_FLAG === undefined) delete process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED;
  else process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = ORIGINAL_MOCK_FLAG;
});

describe("LoginGate", () => {
  it("signs in with Azure AD using the given callback URL by default", async () => {
    render(<LoginGate callbackUrl="/c/fpt38" />);

    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập với tài khoản FPT/ }));

    expect(signInMock).toHaveBeenCalledWith("azure-ad", { callbackUrl: "/c/fpt38" });
  });

  it("signs in as the fixed mock USER account when mock login is enabled", async () => {
    process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED = "true";
    render(<LoginGate callbackUrl="/c/fpt38" />);

    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập với tài khoản FPT/ }));

    expect(signInMock).toHaveBeenCalledWith("dev-login", { email: MOCK_USER_EMAIL, callbackUrl: "/c/fpt38" });
  });
});
