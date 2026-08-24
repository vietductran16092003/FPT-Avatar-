import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/admin/login" },
});

// /admin/login itself must never be matched here, or an unauthenticated
// visitor gets redirected to the sign-in page in an infinite loop. The
// public home and campaign pages are gated the same way: any signed-in
// user (any role) may view them — role checks stay out of this layer.
export const config = { matcher: ["/", "/c/:path*", "/admin/((?!login).*)"] };
