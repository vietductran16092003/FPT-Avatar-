import { AdminHeader } from "@/components/admin-header";
import { AdminShell } from "@/components/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
