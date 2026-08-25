import { signIn } from "next-auth/react";

// Two fixed accounts for local dev without real Azure AD credentials: one
// mock "user" for the public dashboard/avatar tool, one mock "admin" for
// the admin dashboard — kept distinct so each login button lands in the
// area it's actually meant to unlock (see auth-options.ts for how the
// admin one is granted role "admin").
export const MOCK_USER_EMAIL = "user@fpt.com.vn";
export const MOCK_ADMIN_EMAIL = "admin@fpt.com.vn";

// Reuses the same public flag the old dev-login form used to decide whether
// a non-Azure local login path is available (see NEXT_PUBLIC_DEV_LOGIN_ENABLED
// in .env.example) instead of a second flag, so there is one source of truth
// to flip back off once real Azure AD credentials are configured.
export function isMockFptLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === "true";
}

// The public "Đăng nhập với tài khoản FPT" button: real Azure AD sign-in,
// or — only when Azure AD isn't configured locally — the fixed mock user
// via the dev-login CredentialsProvider (see auth-options.ts), so the rest
// of the app can be built and tested before IT provisions real Azure AD credentials.
export function signInAsMockUser(callbackUrl: string) {
  if (isMockFptLoginEnabled()) {
    return signIn("dev-login", { email: MOCK_USER_EMAIL, callbackUrl });
  }
  return signIn("azure-ad", { callbackUrl });
}

// Same idea as signInAsMockUser, but for the admin login page — signs in as
// the fixed mock ADMIN account instead, so admin-only screens can be tested
// locally too.
export function signInAsMockAdmin(callbackUrl: string) {
  if (isMockFptLoginEnabled()) {
    return signIn("dev-login", { email: MOCK_ADMIN_EMAIL, callbackUrl });
  }
  return signIn("azure-ad", { callbackUrl });
}
