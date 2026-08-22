import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { compositeAvatar } from "@/lib/compositing/server-compositor";
import { validateOverlayValues } from "@/lib/compositing/validate-overlay-values";
import { createNotification } from "@/lib/notifications";
import { isCampaignPubliclyVisible } from "@/lib/campaign-visibility";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const form = await req.formData();
  const templateId = form.get("templateId") as string;
  const photoFile = form.get("photo");
  const overlayValuesRaw = form.get("overlayValues");

  if (typeof overlayValuesRaw !== "string") {
    return NextResponse.json({ error: "Missing overlayValues" }, { status: 400 });
  }

  let overlayValues: Record<string, string>;
  try {
    const parsed = JSON.parse(overlayValuesRaw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid overlayValues JSON" }, { status: 400 });
    }
    overlayValues = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid overlayValues JSON" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { slug: params.slug } });
  if (!campaign || !isCampaignPubliclyVisible(campaign)) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (!(photoFile instanceof File) || photoFile.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo file missing or exceeds 10MB" }, { status: 400 });
  }

  // Template, frame, and overlayConfig always come from the DB, scoped to
  // the campaign in the URL — the client cannot point this route at a
  // template belonging to a different campaign, nor supply its own layout.
  const template = await prisma.template.findFirst({
    where: { id: templateId, campaign: { slug: params.slug } },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const overlayConfig = template.overlayConfig as unknown as {
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
      campaignId: campaign.id,
      templateId: template.id,
      overlayValues,
      resultImageKey: resultKey,
    },
  });

  const campaignTitle = (campaign.displayConfig as { title?: string })?.title ?? campaign.slug;
  createNotification(`Có lượt tải avatar mới: ${campaignTitle} – ${template.name}.`, "download").catch(err => console.error("notification failed", err));

  return NextResponse.json({ resultUrl: storage.getPublicUrl(resultKey) });
}
