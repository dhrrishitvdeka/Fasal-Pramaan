"use client";

import {
  GEMINI_LIVE_INDIAN_LANGUAGES,
  parseAppLang,
  type AppLang,
} from "@/lib/live-indian-languages";
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
  return (
    <select
      id={id}
      aria-label="Language"
      value={selected}
      onChange={(event) => {
        const next = parseAppLang(event.target.value);
        if (next) onChange(next);
      }}
      className={clsx(
        "max-w-[11rem] border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--ink)]",
        className,
      )}
    >
      {GEMINI_LIVE_INDIAN_LANGUAGES.map((item) => (
        <option key={item.code} value={item.code}>
          {item.nativeLabel}
        </option>
      ))}
    </select>
  );
}
