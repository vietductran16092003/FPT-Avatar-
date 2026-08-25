"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { PublicLangProvider } from "@/lib/public-i18n";
import { PublicHeader } from "@/components/public-header";
import { GoogleAnalytics } from "@/components/google-analytics";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The avatar tool (/c/[slug]) renders its own FPT-branded header (see
  // c/[slug]/layout.tsx) that matches the campaign's Figma design — skip the
  // generic dashboard header there instead of stacking both.
  const isCampaignRoute = pathname?.startsWith("/c/");

  return (
    <SessionProvider>
      <PublicLangProvider>
        <GoogleAnalytics />
        <div className="flex min-h-screen flex-col" style={{ "--primary": "#FF5A01" } as React.CSSProperties}>
          {!isCampaignRoute && <PublicHeader />}
          <main className="flex-1">{children}</main>
        </div>
      </PublicLangProvider>
    </SessionProvider>
  );
}
