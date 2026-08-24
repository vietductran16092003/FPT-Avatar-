import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaigns = await prisma.campaign.findMany({
    select: { slug: true, status: true, displayConfig: true, _count: { select: { avatars: true } } },
  });

  const campaignRows = campaigns
    .map(c => ({
      slug: c.slug,
      title: (c.displayConfig as { title?: string })?.title || c.slug,
      count: c._count.avatars,
      status: c.status,
    }))
    .sort((a, b) => b.count - a.count);

  const since = new Date(Date.now() - 6 * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);

  const rawByDay = await prisma.generatedAvatar.groupBy({
    by: ["createdAt"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const row of rawByDay) {
    const key = dayKey(new Date(row.createdAt));
    counts.set(key, (counts.get(key) ?? 0) + row._count._all);
  }

  const byDay: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    const key = dayKey(d);
    byDay.push({ day: key, count: counts.get(key) ?? 0 });
  }

  return NextResponse.json({ campaigns: campaignRows, byDay });
}
