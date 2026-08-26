"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminLang } from "@/lib/admin-i18n";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useAdminLang();

  const NAV_ITEMS = [
    { id: "campaigns", label: t("adminCampaigns"), href: "/admin/campaigns" },
    { id: "analytics", label: t("adminAnalytics"), href: "/admin/analytics" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex items-center gap-2 border-b border-border bg-card px-6 py-3">
        <Link
          href="/"
          className="mr-2 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("adminBackToPublic")}
        </Link>
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                active
                  ? "bg-[#FDE9D6] text-[#C25A00]"
                  : "text-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
