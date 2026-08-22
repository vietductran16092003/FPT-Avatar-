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

  it("hides the mark-all-read and clear-all buttons and shows the demo-matching empty copy when there are no notifications", async () => {
    mockNotificationsFetch([]);

    render(<NotificationBell />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    expect(screen.getByText("Chưa có thông báo nào.")).toBeTruthy();
    expect(screen.queryByText("Đánh dấu đã đọc")).toBeNull();
    expect(screen.queryByText("Xoá tất cả")).toBeNull();
  });

  it("shows a relative time for a recently created notification", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-create", read: false, createdAt: fiveMinutesAgo },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    expect(screen.getByText("5 phút trước")).toBeTruthy();
  });

  it("renders a distinct type icon alongside the delete icon for each notification", async () => {
    mockNotificationsFetch([
      { id: "n1", message: "A", type: "campaign-delete", read: false, createdAt: new Date().toISOString() },
    ]);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    await userEvent.click(screen.getByLabelText("Thông báo"));

    const deleteButton = screen.getByLabelText("Xoá thông báo");
    const row = deleteButton.parentElement!;
    expect(row.querySelectorAll("svg").length).toBe(2);
  });
});
