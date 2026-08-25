import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { getStorage } from "@/lib/server/storage";
import { isCampaignPubliclyVisible } from "@/lib/server/campaign-visibility";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: params.slug },
    include: { templates: true },
  });

  if (!campaign || !isCampaignPubliclyVisible(campaign)) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const storage = getStorage();
  const templates = campaign.templates.map(t => ({
    ...t,
    frameImageUrl: storage.getPublicUrl(t.frameImageKey),
  }));

  return NextResponse.json({ ...campaign, templates });
}
