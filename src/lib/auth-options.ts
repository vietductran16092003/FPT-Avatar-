import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
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
  ],
  pages: {
    signIn: "/admin/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // First login creates the User with role "user". Admin role is
      // granted by hand directly in the DB and must never be overwritten
      // here on subsequent logins (spec §5, §9) — upsert only touches
      // name/email, never role.
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name ?? undefined },
        create: { email: user.email, name: user.name ?? undefined, role: "user" },
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
