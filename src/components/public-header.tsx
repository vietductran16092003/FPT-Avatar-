// src/components/public-header.tsx
"use client";

import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { usePublicLang, type PublicLang } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";
import { PublicNotificationBell } from "@/components/public-notification-bell";

function LangToggle() {
  const { lang, setLang } = usePublicLang();
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-border bg-muted p-0.5" role="group" aria-label="VI/EN">
      {(["vi", "en"] as PublicLang[]).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={cn(
            "rounded-full px-3 py-1 text-[12.5px] font-bold uppercase transition-colors",
            lang === code ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
          )}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function AvatarBadge() {
  const { data: session } = useSession();
  const name = session?.user?.name || session?.user?.email || "?";
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="flex size-[30px] items-center justify-center rounded-full bg-[#FDE6D2] text-[12px] font-bold text-[#C25A00]">
      {initial}
    </div>
  );
}

export function PublicHeader() {
  const { t } = usePublicLang();

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
        <div className="text-[15px] font-bold">Avatar Frame Platform</div>
      </div>
      <div className="flex items-center gap-3">
        <LangToggle />
        <PublicNotificationBell />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {t("logout")}
        </button>
        <AvatarBadge />
      </div>
    </header>
  );
}
