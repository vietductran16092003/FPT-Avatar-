"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Globe, ChevronDown, ArrowLeft } from "lucide-react";
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
    <header
      className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-cover bg-center px-4 py-2.5 shadow-sm sm:px-8 sm:py-3.5"
      style={{ backgroundImage: "url('/Frame 2.png')" }}
    >
      <Link
        href="/"
        aria-label="Về trang chủ"
        className="flex size-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
      >
        <ArrowLeft className="size-5" />
      </Link>

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
