import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PUBLIC_NOTIFICATION_TYPES = ["campaign-create", "campaign-update", "campaign-delete"] as const;

export async function GET() {
  const notifications = await prisma.notification.findMany({
    where: { type: { in: [...PUBLIC_NOTIFICATION_TYPES] } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(notifications);
}
