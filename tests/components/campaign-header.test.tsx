/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignHeader } from "../../src/app/(public)/c/[slug]/campaign-header";
import { PublicLangProvider } from "../../src/lib/public-i18n";

const signOutMock = vi.fn();
let sessionValue: { data: { user: { name?: string; email?: string; role?: string } } | null } = {
  data: { user: { name: "Nguyen Van A", role: "user" } },
};

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  useSession: () => sessionValue,
}));

// CampaignHeader reads the route's [slug] param via next/navigation's
// useParams() to build the signed-out login link's callbackUrl — outside a
// real Next.js router (as in this unit test) that hook has no route to read
// from, so it must be mocked to return the slug this suite tests against.
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "fpt38" }),
}));

beforeEach(() => {
  sessionValue = { data: { user: { name: "Nguyen Van A", role: "user" } } };
});

afterEach(() => {
  cleanup();
  signOutMock.mockClear();
});

function renderHeader() {
  return render(
    <PublicLangProvider>
      <CampaignHeader />
    </PublicLangProvider>,
  );
}

describe("CampaignHeader", () => {
  it("shows a 'Đăng nhập' link when no one is signed in", () => {
    sessionValue = { data: null };
    renderHeader();
    const loginLink = screen.getByText("Đăng nhập");
    expect(loginLink.getAttribute("href")).toBe("/admin/login?callbackUrl=%2Fc%2Ffpt38");
  });

  it("shows the avatar initial linking to /tai-khoan when signed in", () => {
    renderHeader();
    const nameEl = screen.getByText("N");
    expect(nameEl.closest("a")?.getAttribute("href")).toBe("/tai-khoan");
  });

  it("renders a logout button that calls signOut", async () => {
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
