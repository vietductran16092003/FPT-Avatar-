import { CampaignHeader } from "./campaign-header";

export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <CampaignHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
