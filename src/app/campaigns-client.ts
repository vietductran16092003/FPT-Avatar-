import { getBaseUrl } from "@/lib/base-url";

export interface Campaign {
  slug: string;
  status: string;
  startDate: string;
  endDate: string;
  displayConfig: {
    title: string;
    titleEn?: string;
    description: string;
    descriptionEn?: string;
    ctaLabel: string;
    ctaEn?: string;
    badge?: string;
  };
  language: "vi" | "en";
  _count: { templates: number };
}

export async function fetchActiveCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns`, { cache: "no-store" });
  return res.json();
}
