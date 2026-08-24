/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicNotificationBell } from "../../src/components/public-notification-bell";
import { PublicLangProvider } from "../../src/lib/public-i18n";

function renderBell() {
  return render(
    <PublicLangProvider>
      <PublicNotificationBell />
    </PublicLangProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PublicNotificationBell", () => {
  it("fetches from /api/notifications (not the admin endpoint)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    renderBell();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/notifications"));
  });

  it("shows an unread badge for notifications not yet in the local seen list", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "n1", message: "Đã tạo campaign mới \"FPT 38\".", type: "campaign-create", read: false, createdAt: new Date().toISOString() }],
    });
    renderBell();
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
  });

  it("marking all read stores seen ids in localStorage and clears the badge, without calling any other endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "n1", message: "Đã tạo campaign mới \"FPT 38\".", type: "campaign-create", read: false, createdAt: new Date().toISOString() }],
    });
    renderBell();
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Thông báo" }));
    await userEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc" }));

    expect(JSON.parse(localStorage.getItem("afp_public_seen_notifications") ?? "[]")).toContain("n1");
    expect(screen.queryByText("1")).toBeNull();
    // Only ever the one GET call — never a mark-all-read or DELETE call.
    expect((global.fetch as any).mock.calls.every((c: any[]) => c[0] === "/api/notifications" && (!c[1] || c[1].method === undefined))).toBe(true);
  });

  it("does not render a delete-all button", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: "Thông báo" }));
    expect(screen.queryByRole("button", { name: /xoá tất cả/i })).toBeNull();
  });
});
