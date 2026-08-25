"use client";

import Image from "next/image";
import { PublicLangProvider, usePublicLang } from "@/lib/public-i18n";
import { signInAsMockUser } from "@/lib/mock-fpt-auth";

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <rect width="8" height="8" x="0" y="0" fill="#F25022" />
      <rect width="8" height="8" x="10" y="0" fill="#7FBA00" />
      <rect width="8" height="8" x="0" y="10" fill="#00A4EF" />
      <rect width="8" height="8" x="10" y="10" fill="#FFB900" />
    </svg>
  );
}

function LoginGateInner({ callbackUrl }: { callbackUrl: string }) {
  const { t } = usePublicLang();
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-[88px] items-center justify-center rounded-xl border border-border bg-white p-1.5">
          <Image src="/fpt-logo.webp" alt="FPT" width={76} height={44} className="h-full w-full object-contain" />
        </div>
        <h1 className="mb-2 text-[22px] font-extrabold tracking-tight">{t("loginTitle")}</h1>
        <p className="mb-7 text-[14.5px] text-muted-foreground">{t("loginSubtitle")}</p>
        <button
          type="button"
          onClick={() => signInAsMockUser(callbackUrl)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 text-[15px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <MicrosoftLogo />
          {t("loginButton")}
        </button>
        <p className="mt-4 text-[12.5px] text-muted-foreground">{t("loginHint")}</p>
      </div>
    </div>
  );
}

export function LoginGate({ callbackUrl }: { callbackUrl: string }) {
  return (
    <PublicLangProvider>
      <LoginGateInner callbackUrl={callbackUrl} />
    </PublicLangProvider>
  );
}
