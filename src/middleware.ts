import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/admin/login" },
});

// /admin/login itself must never be matched here, or an unauthenticated
// visitor gets redirected to the sign-in page in an infinite loop.
//
// The public home (/) and campaign pages (/c/[slug]) are intentionally NOT
// matched here: withAuth only supports one shared `pages.signIn` target for
// everything it protects, which would bounce anonymous visitors to the
// admin-branded /admin/login. Those routes instead check the session
// themselves (see (public)/page.tsx and (public)/c/[slug]/page.tsx) so they
// can render their own FPT-branded login prompt instead of redirecting there.
export const config = { matcher: ["/admin/((?!login).*)"] };
