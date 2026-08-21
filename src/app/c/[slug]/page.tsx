import { getBaseUrl } from "@/lib/base-url";
import { CampaignCompositor, type Template } from "./campaign-compositor";

async function fetchCampaign(slug: string): Promise<{ templates: Template[] } | null> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function CampaignPage({ params }: { params: { slug: string } }) {
  const campaign = await fetchCampaign(params.slug);

  if (!campaign) {
    return <p>Không tìm thấy chiến dịch này.</p>;
  }

  return <CampaignCompositor templates={campaign.templates} />;
}
