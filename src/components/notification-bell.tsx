"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X, Plus, Trash2, Download, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30000;

function iconForType(type: string) {
  if (type === "download") return { Icon: Download, className: "bg-emerald-600/10 text-emerald-600" };
  if (type === "campaign-create") return { Icon: Plus, className: "bg-blue-600/10 text-blue-600" };
  if (type === "campaign-delete") return { Icon: Trash2, className: "bg-red-600/10 text-red-600" };
  return { Icon: Pencil, className: "bg-orange-600/10 text-orange-600" };
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  return new Date(iso).toLocaleString("vi-VN");
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch("/api/admin/notifications")
      .then(res => (res.ok ? res.json() : []))
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleOutsideClick, true);
    return () => document.removeEventListener("click", handleOutsideClick, true);
  }, []);

  const unreadCount = items.filter(i => !i.read).length;
  const hasItems = items.length > 0;

  async function markAllRead() {
    await fetch("/api/admin/notifications/mark-all-read", { method: "PATCH" });
    load();
  }

  async function deleteOne(id: string) {
    await fetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
    load();
  }

  async function clearAll() {
    await fetch("/api/admin/notifications", { method: "DELETE" });
    load();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Thông báo"
        className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-border bg-card p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-bold text-muted-foreground">Thông báo</span>
            {hasItems && (
              <div className="flex gap-2">
                <button type="button" onClick={markAllRead} className="text-xs font-semibold text-primary hover:underline">
                  Đánh dấu đã đọc
                </button>
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-destructive hover:underline">
                  Xoá tất cả
                </button>
              </div>
            )}
          </div>
          <div className="max-h-80 overflow-auto">
            {!hasItems && (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">Chưa có thông báo nào.</div>
            )}
            {items.map(item => {
              const { Icon, className } = iconForType(item.type);
              return (
                <div
                  key={item.id}
                  className={cn("flex items-start gap-2 rounded-lg px-2 py-2 text-sm", !item.read && "bg-muted/50")}
                >
                  <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", className)}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="flex-1">
                    <div>{item.message}</div>
                    <div className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</div>
                  </div>
                  <button type="button" onClick={() => deleteOne(item.id)} aria-label="Xoá thông báo" className="text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
