import type { Metadata } from "next";
import Link from "next/link";
import { fetchActiveCampaigns } from "@/app/campaigns-client";

export const metadata: Metadata = {
  title: "Avatar sự kiện FPT",
  description: "Tạo avatar cá nhân theo khung ảnh của các chiến dịch sự kiện FPT đang diễn ra.",
};

export default async function HomePage() {
  const campaigns = await fetchActiveCampaigns();

  if (campaigns.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center p-6 text-center text-muted-foreground">
        Hiện chưa có chiến dịch nào đang diễn ra.
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map(c => {
        const notReady = c._count.templates === 0;
        const cardClassName = "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md";
        const cardBody = (
          <>
            <div className="relative aspect-video bg-gradient-to-br from-primary/25 via-primary/10 to-secondary/15">
              <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-[11.5px] font-bold text-emerald-700 shadow-sm">
                Đang diễn ra
              </span>
              {c.displayConfig.badge && (
                <span className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-[11.5px] font-bold text-primary-foreground shadow-sm">
                  {c.displayConfig.badge}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-5">
              <div className="text-lg font-bold">{c.displayConfig.title}</div>
              <div className="flex-1 text-[13.5px] leading-relaxed text-muted-foreground">
                {c.displayConfig.description}
              </div>
              <div className="tabular-nums text-xs text-muted-foreground">
                {c.startDate.slice(0, 10)} – {c.endDate.slice(0, 10)}
              </div>
              {notReady && (
                <div className="text-xs italic text-muted-foreground">Chưa có khung ảnh, vui lòng quay lại sau.</div>
              )}
              <span
                className={
                  notReady
                    ? "mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background opacity-50"
                    : "mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity group-hover:opacity-90"
                }
              >
                {c.displayConfig.ctaLabel}
              </span>
            </div>
          </>
        );

        if (notReady) {
          return (
            <div key={c.slug} className={cardClassName}>
              {cardBody}
            </div>
          );
        }

        return (
          <Link key={c.slug} href={`/c/${c.slug}`} className={cardClassName}>
            {cardBody}
          </Link>
        );
      })}
    </div>
  );
}
