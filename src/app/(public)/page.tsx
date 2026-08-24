import type { Metadata } from "next";
import { fetchActiveCampaigns } from "@/app/campaigns-client";
import { CampaignCards } from "./campaign-cards";

export const metadata: Metadata = {
  title: "Avatar sự kiện FPT",
  description: "Tạo avatar cá nhân theo khung ảnh của các chiến dịch sự kiện FPT đang diễn ra.",
};

export default async function HomePage() {
  const campaigns = await fetchActiveCampaigns();
  return <CampaignCards campaigns={campaigns} />;
}
