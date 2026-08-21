"use client";

import { usePathname } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { AdminShell } from "@/components/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The login page renders its own full-page shell (no header/sidebar —
  // there's nothing to navigate to before the visitor is signed in).
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
