/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  useSession: () => ({ data: { user: { name: "Test Admin" } } }),
}));

import { AdminHeader } from "../../src/components/admin-header";
import { AdminLangProvider } from "../../src/lib/admin-i18n";

function renderHeader() {
  return render(
    <AdminLangProvider>
      <AdminHeader />
    </AdminLangProvider>,
  );
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

afterEach(() => {
  cleanup();
  signOutMock.mockClear();
});

describe("AdminHeader", () => {
  it("renders a logout button that calls signOut with the login callback URL", async () => {
    renderHeader();

    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/admin/login" });
  });

  it("renders the notification bell", () => {
    renderHeader();

    expect(screen.getByLabelText("Thông báo")).toBeTruthy();
  });

  it("shows a VI/EN language toggle defaulting to vi active", () => {
    renderHeader();
    const viBtn = screen.getByRole("button", { name: "VI" });
    expect(viBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches the logout label to English when EN is selected", async () => {
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  });
});
