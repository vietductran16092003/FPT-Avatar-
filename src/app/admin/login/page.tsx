"use client";

import Image from "next/image";
import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";

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

function DevLoginForm() {
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    signIn("dev-login", { email, callbackUrl: "/admin/campaigns" });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <p className="text-[12.5px] text-muted-foreground">Dev login (chỉ có ở local, bỏ qua Azure AD)</p>
      <input
        type="email"
        required
        placeholder="ban@fpt.com.vn"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
      >
        Đăng nhập dev
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  const devLoginEnabled = process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === "true";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 text-center shadow-lg">
        <div className="mx-auto mb-5 flex h-14 w-[88px] items-center justify-center rounded-xl border border-border bg-white p-1.5">
          <Image
            src="/fpt-logo.webp"
            alt="FPT"
            width={76}
            height={44}
            className="h-full w-full object-contain"
          />
        </div>
        <h1 className="mb-2 text-[22px] font-extrabold tracking-tight">
          Avatar Frame Platform
        </h1>
        <p className="mb-7 text-[14.5px] text-muted-foreground">
          Đăng nhập bằng tài khoản FPT để quản trị.
        </p>
        <button
          type="button"
          onClick={() => signIn("azure-ad", { callbackUrl: "/admin/campaigns" })}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-5 py-3.5 text-[15px] font-bold text-background transition-opacity hover:opacity-90"
        >
          <MicrosoftLogo />
          Đăng nhập với tài khoản FPT
        </button>
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          Chỉ dành cho nhân viên FPT · Xác thực qua Azure AD
        </p>
        {devLoginEnabled && <DevLoginForm />}
      </div>
    </div>
  );
}
