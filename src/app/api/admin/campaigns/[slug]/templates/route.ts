import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStorage } from "@/lib/storage";

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const name = form.get("name") as string;
  const overlayConfig = JSON.parse(form.get("overlayConfig") as string);
  const frameImage = form.get("frameImage") as File;

  let campaign;
  try {
    campaign = await prisma.campaign.findUniqueOrThrow({ where: { slug: params.slug } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: `Campaign "${params.slug}" not found` }, { status: 404 });
    }
    throw err;
  }

  const storage = getStorage();
  const frameImageKey = `frames/${params.slug}-${Date.now()}.png`;
  await storage.upload(frameImageKey, Buffer.from(await frameImage.arrayBuffer()), "image/png");

  const template = await prisma.template.create({
    data: { campaignId: campaign.id, name, frameImageKey, overlayConfig },
  });

  return NextResponse.json(template);
}
