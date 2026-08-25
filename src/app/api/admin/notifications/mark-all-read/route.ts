import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAdmin } from "@/lib/server/require-admin";

export async function PATCH() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await prisma.notification.updateMany({ data: { read: true } });
  return NextResponse.json({ ok: true });
}
