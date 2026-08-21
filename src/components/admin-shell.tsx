"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "campaigns", label: "Campaign", href: "/admin/campaigns" },
  { id: "analytics", label: "Thống kê", href: "/admin/analytics" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid flex-1 grid-cols-[220px_1fr]">
      <nav className="border-r border-border bg-card p-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
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
