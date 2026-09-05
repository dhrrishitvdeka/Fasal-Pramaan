"use client";

import {
  GEMINI_LIVE_INDIAN_LANGUAGES,
  parseAppLang,
  type AppLang,
} from "@/lib/live-indian-languages";
import { Globe } from "lucide-react";
import clsx from "clsx";

export function LanguageSelect({
  value,
  onChange,
  className,
  id,
}: {
  value: AppLang;
  onChange: (lang: AppLang) => void;
  className?: string;
  id?: string;
}) {
  const selected = parseAppLang(value) ?? "en";
  const currentLang = GEMINI_LIVE_INDIAN_LANGUAGES.find((l) => l.code === selected);

  return (
    <div className={clsx("relative inline-flex items-center rounded-md focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-1", className)}>
      {/* Visual representation: Globe icon on mobile, Globe + Text on desktop */}
      <div className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-1 text-xs font-medium text-[var(--ink)] shadow-2xs transition-colors hover:border-[var(--ink-muted)] hover:bg-[var(--canvas)] sm:min-h-0 sm:min-w-0 sm:gap-1.5 sm:px-2">
        <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
        <span className="hidden sm:inline text-xs font-medium">
          {currentLang?.nativeLabel || selected.toUpperCase()}
        </span>
        <span className="inline text-[11px] font-semibold text-[var(--ink-muted)] sm:hidden uppercase">
          {selected}
        </span>
      </div>

      {/* Accessible native select overlay for tap/click */}
      <select
        id={id}
        aria-label="Language selection"
        value={selected}
        onChange={(event) => {
          const next = parseAppLang(event.target.value);
          if (next) onChange(next);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {GEMINI_LIVE_INDIAN_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
