import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireAdmin } from "@/lib/server/require-admin";
import { createNotification } from "@/lib/server/notifications";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const campaigns = await prisma.campaign.findMany({
    include: { _count: { select: { templates: true } } },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();

  if (typeof body.slug !== "string" || !SLUG_PATTERN.test(body.slug)) {
    return NextResponse.json({ error: "Slug must be lowercase kebab-case (e.g. techweek-2026)" }, { status: 400 });
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        slug: body.slug,
        status: body.status ?? "draft",
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        language: body.language ?? "vi",
        displayConfig: body.displayConfig,
      },
    });
    const title = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
    createNotification(`Đã tạo campaign mới "${title}".`, "campaign-create").catch(err => console.error("notification failed", err));
    return NextResponse.json(campaign);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `Campaign slug "${body.slug}" already exists` }, { status: 409 });
    }
    throw err;
  }
}
