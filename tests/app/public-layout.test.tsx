/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

let pathnameValue = "/";

vi.mock("next/navigation", () => ({ usePathname: () => pathnameValue }));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({ data: null }),
  signOut: vi.fn(),
}));

import PublicLayout from "../../src/app/(public)/layout";

afterEach(() => {
  cleanup();
});

describe("PublicLayout", () => {
  it("shows the generic dashboard header on the public home", () => {
    pathnameValue = "/";
    render(<PublicLayout>content</PublicLayout>);
    expect(screen.getByText("Avatar Frame Platform")).toBeTruthy();
  });

  it("hides the generic dashboard header on the avatar tool route (it renders its own)", () => {
    pathnameValue = "/c/fpt38";
    render(<PublicLayout>content</PublicLayout>);
    expect(screen.queryByText("Avatar Frame Platform")).toBeNull();
  });
});
