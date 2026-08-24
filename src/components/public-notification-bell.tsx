"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePublicLang, type PublicDictKey } from "@/lib/public-i18n";

interface PublicNotificationItem {
  id: string;
  message: string;
  type: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30000;
const SEEN_STORAGE_KEY = "afp_public_seen_notifications";
const MAX_SEEN_IDS = 200;

function iconForType(type: string) {
  if (type === "campaign-create") return { Icon: Plus, className: "bg-blue-600/10 text-blue-600" };
  if (type === "campaign-delete") return { Icon: Trash2, className: "bg-red-600/10 text-red-600" };
  return { Icon: Pencil, className: "bg-orange-600/10 text-orange-600" };
}

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    const trimmed = Array.from(ids).slice(-MAX_SEEN_IDS);
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage unavailable — read state just won't persist across reloads
  }
}

function formatRelativeTime(iso: string, t: (key: PublicDictKey) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("notifJustNow");
  if (min < 60) return `${min} ${t("notifMinAgo")}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${t("notifHourAgo")}`;
  return new Date(iso).toLocaleString();
}

export function PublicNotificationBell() {
  const { t } = usePublicLang();
  const [items, setItems] = useState<PublicNotificationItem[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => (typeof window !== "undefined" ? loadSeenIds() : new Set()));
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch("/api/notifications")
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

  const unreadCount = items.filter(i => !seenIds.has(i.id)).length;
  const hasItems = items.length > 0;

  function markAllRead() {
    const next = new Set(seenIds);
    items.forEach(i => next.add(i.id));
    saveSeenIds(next);
    setSeenIds(next);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t("notifTitle")}
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
            <span className="text-xs font-bold text-muted-foreground">{t("notifTitle")}</span>
            {hasItems && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-primary hover:underline">
                {t("notifMarkAllRead")}
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-auto">
            {!hasItems && (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t("notifEmpty")}</div>
            )}
            {items.map(item => {
              const { Icon, className } = iconForType(item.type);
              return (
                <div
                  key={item.id}
                  className={cn("flex items-start gap-2 rounded-lg px-2 py-2 text-sm", !seenIds.has(item.id) && "bg-muted/50")}
                >
                  <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", className)}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="flex-1">
                    <div>{item.message}</div>
                    <div className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt, t)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
