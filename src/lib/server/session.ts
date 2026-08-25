import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { prisma } from "./prisma";

export async function getCurrentUser(): Promise<{ id: string; role: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!dbUser) return null;

  return { id: dbUser.id, role: dbUser.role };
}
