/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "../../src/components/notification-bell";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockNotificationsFetch(items: any[] = []) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => items });
}

describe("NotificationBell", () => {
  it("shows the unread count badge from the fetched list", async () => {
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-create", read: false, createdAt: "2026-08-22T00:00:00.000Z" },
      { id: "n2", message: "B", type: "campaign-create", read: true, createdAt: "2026-08-22T00:00:00.000Z" },
    ]);

    render(<NotificationBell />);

    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
  });

  it("opens the dropdown and lists the fetched notifications", async () => {
    mockNotificationsFetch([
      { id: "n1", message: 'Đã tạo campaign mới "FPT 38".', type: "campaign-create", read: false, createdAt: "2026-08-22T00:00:00.000Z" },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await userEvent.click(screen.getByLabelText("Thông báo"));

    expect(screen.getByText('Đã tạo campaign mới "FPT 38".')).toBeTruthy();
  });

  it("marks all as read and clears the badge", async () => {
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-create", read: false, createdAt: "2026-08-22T00:00:00.000Z" },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "n1", message: "A", type: "campaign-create", read: true, createdAt: "2026-08-22T00:00:00.000Z" }] });

    await userEvent.click(screen.getByText("Đánh dấu đã đọc"));

    await waitFor(() => expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/admin/notifications/mark-all-read", { method: "PATCH" }));
    await waitFor(() => expect(screen.queryByText("1")).toBeNull());
  });

  it("deletes a single notification", async () => {
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-create", read: false, createdAt: "2026-08-22T00:00:00.000Z" },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    await userEvent.click(screen.getByLabelText("Xoá thông báo"));

    await waitFor(() => expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/admin/notifications/n1", { method: "DELETE" }));
  });

  it("polls every 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockNotificationsFetch([]);

    render(<NotificationBell />);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30000);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
