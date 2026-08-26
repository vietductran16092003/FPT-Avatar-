/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

let pathnameValue = "/admin/campaigns";
let sessionValue: { data: { user: { name?: string; role?: string } } | null; status: string } = {
  data: { user: { name: "Admin User", role: "admin" } },
  status: "authenticated",
};
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameValue,
  useRouter: () => ({ replace: replaceMock }),
}));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => sessionValue,
  signOut: vi.fn(),
}));

import AdminLayout from "../../src/app/admin/layout";

beforeEach(() => {
  pathnameValue = "/admin/campaigns";
  sessionValue = { data: { user: { name: "Admin User", role: "admin" } }, status: "authenticated" };
  replaceMock.mockClear();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

afterEach(() => {
  cleanup();
});

describe("AdminLayout", () => {
  it("renders /admin/login children directly without checking the session at all", () => {
    pathnameValue = "/admin/login";
    sessionValue = { data: null, status: "unauthenticated" };

    render(<AdminLayout>login form</AdminLayout>);

    expect(screen.getByText("login form")).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("renders the admin shell for a signed-in admin", () => {
    render(<AdminLayout>campaigns content</AdminLayout>);

    expect(screen.getByText("campaigns content")).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects a signed-in non-admin user away from admin pages instead of rendering them", () => {
    sessionValue = { data: { user: { name: "Regular User", role: "user" } }, status: "authenticated" };

    render(<AdminLayout>campaigns content</AdminLayout>);

    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(screen.queryByText("campaigns content")).toBeNull();
  });

  it("does not redirect while the session is still loading", () => {
    sessionValue = { data: null, status: "loading" };

    render(<AdminLayout>campaigns content</AdminLayout>);

    expect(replaceMock).not.toHaveBeenCalled();
  });
});
