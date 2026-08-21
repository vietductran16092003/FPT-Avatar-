import { getBaseUrl } from "@/lib/base-url";

export interface Campaign {
  slug: string;
  displayConfig: { title: string; description: string; ctaLabel: string; badge?: string };
  language: "vi" | "en";
}

export async function fetchActiveCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${getBaseUrl()}/api/campaigns`, { cache: "no-store" });
  return res.json();
}
