/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../src/lib/server/session", () => ({ getCurrentUser: vi.fn() }));
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("../../src/lib/server/prisma", () => ({
  prisma: { generatedAvatar: { findMany: vi.fn() } },
}));

import AccountPage from "../../src/app/(public)/tai-khoan/page";
import { getCurrentUser } from "../../src/lib/server/session";
import { prisma } from "../../src/lib/server/prisma";

beforeEach(() => {
  redirectMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AccountPage", () => {
  it("redirects to login with a callbackUrl when signed out", async () => {
    (getCurrentUser as any).mockResolvedValue(null);

    await expect(AccountPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/admin/login?callbackUrl=%2Ftai-khoan");
    expect(prisma.generatedAvatar.findMany).not.toHaveBeenCalled();
  });

  it("shows an empty-state message when the user has no downloads", async () => {
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (prisma.generatedAvatar.findMany as any).mockResolvedValue([]);

    render(await AccountPage());

    expect(screen.getByText("Bạn chưa tải ảnh nào.")).toBeTruthy();
  });

  it("lists each download newest-first with frame name, campaign title, and date", async () => {
    (getCurrentUser as any).mockResolvedValue({ id: "u1", role: "user" });
    (prisma.generatedAvatar.findMany as any).mockResolvedValue([
      {
        id: "ga1",
        createdAt: new Date("2026-08-24T10:00:00.000Z"),
        template: { name: "Khung cam chuẩn" },
        campaign: { displayConfig: { title: "FPT tròn 38 tuổi" } },
      },
    ]);

    render(await AccountPage());

    expect(prisma.generatedAvatar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(screen.getByText("Khung cam chuẩn")).toBeTruthy();
    expect(screen.getByText("FPT tròn 38 tuổi")).toBeTruthy();
  });
});
