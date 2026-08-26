import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/admin/login" },
});

// /admin/login itself must never be matched here, or an unauthenticated
// visitor gets redirected to the sign-in page in an infinite loop.
//
// The public home (/) and campaign pages (/c/[slug]) are intentionally NOT
// matched here: they are fully public routes with no login requirement at
// all. Anonymous visitors can use them directly; signing in is optional and
// offered via a header link, not enforced as a gate. Only /admin routes
// require authentication, so this matcher is scoped to those.
export const config = { matcher: ["/admin/((?!login).*)"] };
