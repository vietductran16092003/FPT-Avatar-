/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CampaignHeader } from "../../src/app/(public)/c/[slug]/campaign-header";
import { PublicLangProvider } from "../../src/lib/public-i18n";

afterEach(() => {
  cleanup();
});

function renderHeader() {
  return render(
    <PublicLangProvider>
      <CampaignHeader />
    </PublicLangProvider>,
  );
}

describe("CampaignHeader", () => {
  it("renders a back link to the home page, with the FPT logo/badge baked into the header's background image", () => {
    renderHeader();
    const backLink = screen.getByLabelText("Về trang chủ");
    expect(backLink.tagName).toBe("A");
    expect(backLink.getAttribute("href")).toBe("/");
    expect(backLink.closest("header")?.style.backgroundImage).toContain("Frame 2.png");
  });

  it("shows no login, logout, or avatar controls — this header is session-free", () => {
    renderHeader();
    expect(screen.queryByText("Đăng nhập")).toBeNull();
    expect(screen.queryByText("Đăng xuất")).toBeNull();
    expect(screen.queryByRole("link", { name: /tai-khoan/i })).toBeNull();
  });

  it("still shows the language toggle", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /Tiếng Việt/ })).toBeTruthy();
  });
});
