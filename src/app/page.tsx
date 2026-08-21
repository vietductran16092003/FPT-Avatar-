import type { Metadata } from "next";
import Link from "next/link";
import { fetchActiveCampaigns } from "./campaigns-client";

export const metadata: Metadata = {
  title: "Avatar sự kiện FPT",
  description: "Tạo avatar cá nhân theo khung ảnh của các chiến dịch sự kiện FPT đang diễn ra.",
};

export default async function HomePage() {
  const campaigns = await fetchActiveCampaigns();

  if (campaigns.length === 0) {
    return <p>Hiện chưa có chiến dịch nào đang diễn ra.</p>;
  }

  return (
    <ul>
      {campaigns.map(c => (
        <li key={c.slug}>
          <Link href={`/c/${c.slug}`}>{c.displayConfig.title}</Link>
        </li>
      ))}
    </ul>
  );
}
