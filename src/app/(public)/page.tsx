import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { fetchActiveCampaigns } from "@/app/campaigns-client";
import { CampaignCards } from "./campaign-cards";
import { LoginGate } from "./login-gate";

export const metadata: Metadata = {
  title: "Avatar sự kiện FPT",
  description: "Tạo avatar cá nhân theo khung ảnh của các chiến dịch sự kiện FPT đang diễn ra.",
};

export default async function HomePage({ searchParams }: { searchParams?: { callbackUrl?: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return <LoginGate callbackUrl={searchParams?.callbackUrl ?? "/"} />;
  }

  const campaigns = await fetchActiveCampaigns();
  return <CampaignCards campaigns={campaigns} />;
}
