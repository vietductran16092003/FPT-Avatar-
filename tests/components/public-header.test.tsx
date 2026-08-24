// tests/components/public-header.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicHeader } from "../../src/components/public-header";
import { PublicLangProvider } from "../../src/lib/public-i18n";

const signOutMock = vi.fn();
let sessionValue: { data: { user: { name?: string; email?: string; role?: string } } | null } = {
  data: { user: { name: "Nguyen Van A", role: "user" } },
};

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  useSession: () => sessionValue,
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  sessionValue = { data: { user: { name: "Nguyen Van A", role: "user" } } };
});

afterEach(() => {
  cleanup();
  signOutMock.mockClear();
});

function renderHeader() {
  return render(
    <PublicLangProvider>
      <PublicHeader />
    </PublicLangProvider>,
  );
}

describe("PublicHeader", () => {
  it("renders the app name and a VI/EN lang toggle defaulting to vi active", () => {
    renderHeader();
    expect(screen.getByText("Avatar Frame Platform")).toBeTruthy();
    const viBtn = screen.getByRole("button", { name: "VI" });
    expect(viBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders an avatar badge with the signed-in user's initial and full name", () => {
    renderHeader();
    expect(screen.getByText("N")).toBeTruthy();
    expect(screen.getByText("Nguyen Van A")).toBeTruthy();
  });

  it("renders a logout button that calls signOut with the login callback URL", async () => {
    renderHeader();

    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/admin/login" });
  });

  it("renders the public notification bell", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Thông báo" })).toBeTruthy();
  });

  it("does not show the admin panel link for a regular (non-admin) user", () => {
    renderHeader();
    expect(screen.queryByText("Trang quản trị")).toBeNull();
  });

  it("shows an admin panel link pointing to /admin/campaigns when the signed-in user is an admin", () => {
    sessionValue = { data: { user: { name: "Nguyen Van A", role: "admin" } } };
    renderHeader();
    const link = screen.getByText("Trang quản trị");
    expect(link.getAttribute("href")).toBe("/admin/campaigns");
  });
});
