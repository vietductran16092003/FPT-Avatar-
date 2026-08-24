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
let sessionValue: { data: { user: { name?: string; email?: string } } | null } = {
  data: { user: { name: "Nguyen Van A" } },
};

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  useSession: () => sessionValue,
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  sessionValue = { data: { user: { name: "Nguyen Van A" } } };
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

  it("renders an avatar badge with the signed-in user's initial", () => {
    renderHeader();
    expect(screen.getByText("N")).toBeTruthy();
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
});
