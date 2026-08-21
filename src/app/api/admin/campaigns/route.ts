import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { createNotification } from "@/lib/notifications";

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
