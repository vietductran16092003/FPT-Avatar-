import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStorage } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaign = await prisma.campaign.findUnique({
    where: { slug: params.slug },
    include: { templates: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: `Campaign "${params.slug}" not found` }, { status: 404 });
  }

  const storage = getStorage();
  const templates = campaign.templates.map(t => ({
    ...t,
    frameImageUrl: storage.getPublicUrl(t.frameImageKey),
  }));

  return NextResponse.json({ ...campaign, templates });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const campaign = await prisma.campaign.update({ where: { slug: params.slug }, data: body });
  return NextResponse.json(campaign);
}

export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const campaign = await prisma.campaign.delete({ where: { slug: params.slug } });
    return NextResponse.json(campaign);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: `Campaign "${params.slug}" not found` }, { status: 404 });
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: `Campaign "${params.slug}" still has generated avatars and cannot be deleted` },
          { status: 409 },
        );
      }
    }
    throw err;
  }
}
