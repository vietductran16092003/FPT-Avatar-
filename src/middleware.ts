import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/admin/login" },
});

// Only the protected admin pages run through this gate — /admin/login
// itself must never be matched here, or an unauthenticated visitor gets
// redirected to the sign-in page in an infinite loop.
export const config = { matcher: ["/admin/campaigns/:path*"] };
