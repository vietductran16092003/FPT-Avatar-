import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAdmin } from "@/lib/server/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(notifications);
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await prisma.notification.deleteMany({});
  return NextResponse.json({ ok: true });
}
