import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getBaseUrl } from "@/lib/base-url";
import type { DisplayConfigLike } from "@/lib/localized-content";
import { AvatarCreator, type Template } from "./avatar-creator";

async function fetchCampaign(slug: string): Promise<{ templates: Template[]; displayConfig: DisplayConfigLike } | null> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function CampaignPage({ params }: { params: { slug: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/?callbackUrl=${encodeURIComponent(`/c/${params.slug}`)}`);
  }

  const campaign = await fetchCampaign(params.slug);

  if (!campaign) {
    return <p>Không tìm thấy chiến dịch này.</p>;
  }

  if (campaign.templates.length === 0) {
    return <p>Chiến dịch này chưa có khung ảnh nào. Vui lòng quay lại sau.</p>;
  }

  return <AvatarCreator slug={params.slug} templates={campaign.templates} displayConfig={campaign.displayConfig} />;
}
