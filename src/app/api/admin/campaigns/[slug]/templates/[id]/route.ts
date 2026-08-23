import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStorage } from "@/lib/storage";

const MAX_FRAME_IMAGE_BYTES = 5 * 1024 * 1024;

export async function PATCH(req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const form = await req.formData();

  const name = form.get("name");
  const overlayConfigRaw = form.get("overlayConfig");
  const frameImage = form.get("frameImage");

  const data: Prisma.TemplateUpdateManyMutationInput = {};
  if (typeof name === "string") data.name = name;

  if (typeof overlayConfigRaw === "string") {
    try {
      const parsed = JSON.parse(overlayConfigRaw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Invalid overlayConfig JSON" }, { status: 400 });
      }
      data.overlayConfig = parsed;
    } catch {
      return NextResponse.json({ error: "Invalid overlayConfig JSON" }, { status: 400 });
    }
  }

  if (frameImage instanceof File) {
    if (frameImage.size > MAX_FRAME_IMAGE_BYTES) {
      return NextResponse.json({ error: "Frame image exceeds 5MB" }, { status: 400 });
    }
    const storage = getStorage();
    const frameImageKey = `frames/${params.slug}-${Date.now()}.png`;
    await storage.upload(frameImageKey, Buffer.from(await frameImage.arrayBuffer()), "image/png");
    data.frameImageKey = frameImageKey;
  }

  const result = await prisma.template.updateMany({
    where: { id: params.id, campaign: { slug: params.slug } },
    data,
  });
  if (result.count === 0) {
    return NextResponse.json({ error: `Template "${params.id}" not found in campaign "${params.slug}"` }, { status: 404 });
  }
  const template = await prisma.template.findUnique({ where: { id: params.id } });
  return NextResponse.json(template);
}

export async function DELETE(_req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const template = await prisma.template.findFirst({
    where: { id: params.id, campaign: { slug: params.slug } },
  });
  if (!template) {
    return NextResponse.json({ error: `Template "${params.id}" not found in campaign "${params.slug}"` }, { status: 404 });
  }

  try {
    const deleted = await prisma.template.delete({ where: { id: params.id } });
    return NextResponse.json(deleted);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: `Template "${params.id}" still has generated avatars and cannot be deleted` },
        { status: 409 },
      );
    }
    throw err;
  }
}
