"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";
import { NotificationBell } from "@/components/notification-bell";

export function AdminHeader() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-7 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-[50px] items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1">
          <Image
            src="/fpt-logo.webp"
            alt="FPT"
            width={42}
            height={24}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="text-[15px] font-bold">
          Avatar Frame Platform{" "}
          <span className="font-medium text-muted-foreground">· Admin</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
