import { prisma } from "@/lib/server/prisma";

const MAX_NOTIFICATIONS = 50;

export async function createNotification(message: string, type: string): Promise<void> {
  await prisma.notification.create({ data: { message, type } });

  const excess = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    skip: MAX_NOTIFICATIONS,
    select: { id: true },
  });

  if (excess.length > 0) {
    await prisma.notification.deleteMany({ where: { id: { in: excess.map(n => n.id) } } });
  }
}
