"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, ChevronDown } from "lucide-react";
import { usePublicLang, type PublicLang } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";

const LANG_LABELS: Record<PublicLang, string> = { vi: "Tiếng Việt", en: "English" };

export function CampaignHeader() {
  const { lang, setLang } = usePublicLang();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onOutsideClick, true);
    return () => document.removeEventListener("click", onOutsideClick, true);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-r from-[#FF6A00] via-[#FF5A01] to-[#E5450A] px-4 py-2.5 shadow-sm sm:px-8 sm:py-3.5">
      <div className="flex items-center gap-3">
        {/* Plain <img>, not next/image: Next's image optimizer refuses local
            SVGs unless images.dangerouslyAllowSVG is set app-wide, which is
            more blast radius than two small static logo files need. */}
        <img src="/header-fpt-logo.svg" alt="FPT" className="h-7 w-auto sm:h-9" />
        <img src="/header-fpt-38-badge.svg" alt="38 năm FPT" className="h-9 w-auto sm:h-11" />
      </div>

      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
        >
          <Globe className="size-4" />
          <span className="hidden sm:inline">{LANG_LABELS[lang]}</span>
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div role="listbox" className="absolute right-0 top-full z-30 mt-2 w-36 overflow-hidden rounded-xl border border-black/5 bg-white py-1 text-sm shadow-lg">
            {(["vi", "en"] as PublicLang[]).map(code => (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={lang === code}
                onClick={() => {
                  setLang(code);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center px-3.5 py-2 text-left font-semibold text-foreground hover:bg-muted",
                  lang === code && "text-primary",
                )}
              >
                {LANG_LABELS[code]}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
