import { PublicLangProvider } from "@/lib/public-i18n";
import { PublicHeader } from "@/components/public-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicLangProvider>
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1">{children}</main>
      </div>
    </PublicLangProvider>
  );
}
