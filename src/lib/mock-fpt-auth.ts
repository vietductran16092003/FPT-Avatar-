import { signIn } from "next-auth/react";

// One fixed mock account for local dev without real Azure AD credentials —
// used by the admin login page's "Đăng nhập với tài khoản FPT" button (see
// auth-options.ts for how this email is granted role "admin").
export const MOCK_ADMIN_EMAIL = "admin@fpt.com.vn";

// Reuses the same public flag the old dev-login form used to decide whether
// a non-Azure local login path is available (see NEXT_PUBLIC_DEV_LOGIN_ENABLED
// in .env.example) instead of a second flag, so there is one source of truth
// to flip back off once real Azure AD credentials are configured.
export function isMockFptLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === "true";
}

// Same idea as before, but for the admin login page — signs in as the fixed
// mock ADMIN account instead, so admin-only screens can be tested locally.
export function signInAsMockAdmin(callbackUrl: string) {
  if (isMockFptLoginEnabled()) {
    return signIn("dev-login", { email: MOCK_ADMIN_EMAIL, callbackUrl });
  }
  return signIn("azure-ad", { callbackUrl });
}
