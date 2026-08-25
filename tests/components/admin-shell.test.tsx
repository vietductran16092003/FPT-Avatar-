/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/campaigns" }));

import { AdminShell } from "../../src/components/admin-shell";
import { AdminLangProvider } from "../../src/lib/admin-i18n";

afterEach(() => cleanup());

describe("AdminShell", () => {
  it("renders VI nav labels by default and marks the active item", () => {
    render(
      <AdminLangProvider>
        <AdminShell>content</AdminShell>
      </AdminLangProvider>,
    );
    const active = screen.getByText("Campaigns");
    expect(active.className).toContain("bg-[#FDE9D6]");
    expect(screen.getByText("Số liệu tải ảnh")).toBeTruthy();
  });

  it("renders a link back to the public site", () => {
    render(
      <AdminLangProvider>
        <AdminShell>content</AdminShell>
      </AdminLangProvider>,
    );
    const backLink = screen.getByText("Về trang public").closest("a");
    expect(backLink?.getAttribute("href")).toBe("/");
  });
});
