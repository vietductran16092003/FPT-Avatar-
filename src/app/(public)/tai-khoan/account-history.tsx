"use client";

import { PublicLangProvider, usePublicLang } from "@/lib/public-i18n";

export interface AccountHistoryEntry {
  id: string;
  frameName: string;
  campaignTitle: string;
  campaignTitleEn?: string;
  createdAt: string;
}

function AccountHistoryInner({ entries }: { entries: AccountHistoryEntry[] }) {
  const { t, lang } = usePublicLang();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">{t("accountPageTitle")}</h1>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("accountEmpty")}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-left">
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("accountColFrame")}</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("accountColCampaign")}</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("accountColDate")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="px-4 py-3">{entry.frameName}</td>
                  <td className="px-4 py-3">{lang === "en" && entry.campaignTitleEn ? entry.campaignTitleEn : entry.campaignTitle}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString(lang === "en" ? "en-US" : "vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AccountHistory({ entries }: { entries: AccountHistoryEntry[] }) {
  return (
    <PublicLangProvider>
      <AccountHistoryInner entries={entries} />
    </PublicLangProvider>
  );
}
