import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { compositeAvatar } from "@/lib/compositing/server-compositor";
import { validateOverlayValues } from "@/lib/compositing/validate-overlay-values";

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const form = await req.formData();
  const templateId = form.get("templateId") as string;
  const overlayValues = JSON.parse(form.get("overlayValues") as string) as Record<string, string>;
  const photoFile = form.get("photo") as File;

  // Template, frame, and overlayConfig always come from the DB, scoped to
  // the campaign in the URL — the client cannot point this route at a
  // template belonging to a different campaign, nor supply its own layout.
  const template = await prisma.template.findFirst({
    where: { id: templateId, campaign: { slug: params.slug } },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const overlayConfig = template.overlayConfig as {
    photoArea: { x: number; y: number; w: number; h: number };
    textOverlays: Parameters<typeof validateOverlayValues>[0];
  };

  const validation = validateOverlayValues(overlayConfig.textOverlays, overlayValues);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const storage = getStorage();
  const frameBuffer = Buffer.from(await (await fetch(storage.getPublicUrl(template.frameImageKey))).arrayBuffer());
  const photoBuffer = Buffer.from(await photoFile.arrayBuffer());

  const resultBuffer = await compositeAvatar(
    frameBuffer,
    photoBuffer,
    overlayConfig.photoArea,
    overlayConfig.textOverlays,
    overlayValues,
  );

  const resultKey = `results/${template.id}-${Date.now()}.png`;
  await storage.upload(resultKey, resultBuffer, "image/png");

  await prisma.generatedAvatar.create({
    data: {
      campaignId: (await prisma.campaign.findUniqueOrThrow({ where: { slug: params.slug } })).id,
      templateId: template.id,
      overlayValues,
      resultImageKey: resultKey,
    },
  });

  return NextResponse.json({ resultUrl: storage.getPublicUrl(resultKey) });
}
