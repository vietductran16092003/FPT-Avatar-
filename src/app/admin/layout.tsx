"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";
import { AdminHeader } from "@/components/admin-header";
import { AdminShell } from "@/components/admin-shell";
import { AdminLangProvider } from "@/lib/admin-i18n";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The login page renders its own full-page shell (no header/sidebar —
  // there's nothing to navigate to before the visitor is signed in).
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <SessionProvider>
      <AdminLangProvider>
        <AdminGate>{children}</AdminGate>
      </AdminLangProvider>
    </SessionProvider>
  );
}

// Middleware already guarantees a signed-in session reaches here (it gates
// every /admin/* route except /admin/login) but not the ROLE — a "user"
// account can still hold a valid session. Without this, that account would
// land on a half-rendered admin page whose data calls all 403 instead of
// being sent somewhere that makes sense for them.
function AdminGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isNonAdmin = status === "authenticated" && role !== "admin";

  useEffect(() => {
    if (isNonAdmin) router.replace("/");
  }, [isNonAdmin, router]);

  if (status === "loading" || isNonAdmin) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
