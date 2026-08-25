import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AccountHistory, type AccountHistoryEntry } from "./account-history";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/admin/login?callbackUrl=${encodeURIComponent("/tai-khoan")}`);
  }

  const avatars = await prisma.generatedAvatar.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { template: true, campaign: true },
  });

  const entries: AccountHistoryEntry[] = avatars.map(a => {
    const displayConfig = a.campaign.displayConfig as { title?: string; titleEn?: string };
    return {
      id: a.id,
      frameName: a.template.name,
      campaignTitle: displayConfig?.title ?? a.campaign.slug,
      campaignTitleEn: displayConfig?.titleEn,
      createdAt: a.createdAt.toISOString(),
    };
  });

  return <AccountHistory entries={entries} />;
}
