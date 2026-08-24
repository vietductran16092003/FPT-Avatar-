import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStorage } from "@/lib/storage";

const MAX_FRAME_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const name = form.get("name") as string;
  const frameImage = form.get("frameImage");
  const overlayConfigRaw = form.get("overlayConfig");

  if (typeof overlayConfigRaw !== "string") {
    return NextResponse.json({ error: "Missing overlayConfig" }, { status: 400 });
  }

  let overlayConfig: Prisma.InputJsonValue;
  try {
    const parsed = JSON.parse(overlayConfigRaw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid overlayConfig JSON" }, { status: 400 });
    }
    overlayConfig = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid overlayConfig JSON" }, { status: 400 });
  }

  if (!(frameImage instanceof File) || frameImage.size > MAX_FRAME_IMAGE_BYTES) {
    return NextResponse.json({ error: "Frame image missing or exceeds 5MB" }, { status: 400 });
  }

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
