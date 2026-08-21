import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

// Exported separately (not just inline in the [...nextauth] route) so
// getServerSession() in session.ts can be called with the exact same
// options object — calling getServerSession() with no argument silently
// fails to read the session in the App Router with NextAuth v4.
export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
    // Dev-only bypass for local testing while the Azure AD infra gate
    // (spec §10) is unconfirmed — no password check, just an email. Never
    // registered in production so it can't become a real auth bypass.
    ...(process.env.NODE_ENV !== "production"
      ? [
          CredentialsProvider({
            id: "dev-login",
            name: "Dev login",
            credentials: { email: { label: "Email", type: "text" } },
            async authorize(credentials) {
              if (!credentials?.email) return null;
              return { id: credentials.email, email: credentials.email, name: credentials.email };
            },
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/admin/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      // First login creates the User with role "user" (or "admin" for the
      // dev-login bypass, so a local tester can reach /admin without a
      // manual DB edit). Admin role is otherwise granted by hand directly
      // in the DB and must never be overwritten here on subsequent logins
      // (spec §5, §9) — upsert only touches name/email, never role.
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name ?? undefined },
        create: { email: user.email, name: user.name ?? undefined, role: account?.provider === "dev-login" ? "admin" : "user" },
      });
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
        (session.user as any).id = dbUser?.id;
        (session.user as any).role = dbUser?.role ?? "user";
      }
      return session;
    },
  },
};
