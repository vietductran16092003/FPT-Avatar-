import { CampaignHeader } from "./campaign-header";

export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col bg-white bg-cover bg-top bg-no-repeat"
      style={{ backgroundImage: "url(/campaign-page-bg.png)" }}
    >
      <CampaignHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
