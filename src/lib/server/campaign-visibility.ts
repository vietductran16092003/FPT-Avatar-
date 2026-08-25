export function isCampaignPubliclyVisible(
  campaign: { status: string; startDate: Date; endDate: Date },
  now: Date = new Date(),
): boolean {
  return campaign.status === "active" && campaign.startDate <= now && campaign.endDate >= now;
}
