/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOutMock(...args) }));

import { AdminHeader } from "../../src/components/admin-header";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

afterEach(() => {
  cleanup();
  signOutMock.mockClear();
});

describe("AdminHeader", () => {
  it("renders a logout button that calls signOut with the login callback URL", async () => {
    render(<AdminHeader />);

    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/admin/login" });
  });

  it("renders the notification bell", () => {
    render(<AdminHeader />);

    expect(screen.getByLabelText("Thông báo")).toBeTruthy();
  });
});
