// tests/components/public-header.test.tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PublicHeader } from "../../src/components/public-header";
import { PublicLangProvider } from "../../src/lib/public-i18n";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

afterEach(() => cleanup());

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

  it("does not render a logout button or any admin identity", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
  });

  it("renders the public notification bell", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Thông báo" })).toBeTruthy();
  });
});
