import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaigns = await prisma.campaign.findMany({
    select: { slug: true, status: true, displayConfig: true, _count: { select: { avatars: true } } },
  });

  const result = campaigns
    .map(c => ({
      slug: c.slug,
      title: (c.displayConfig as { title?: string })?.title || c.slug,
      count: c._count.avatars,
      status: c.status,
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json(result);
}
