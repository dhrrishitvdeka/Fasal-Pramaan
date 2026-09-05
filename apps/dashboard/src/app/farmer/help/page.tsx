"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFarmerData } from "@/lib/farmerStore";
import { getHelpI18n } from "@/lib/help-i18n";
import {
  Camera,
  Bot,
  FileText,
  ChevronDown,
  Search,
  HelpCircle,
} from "lucide-react";
import clsx from "clsx";

export default function FarmerHelpPage() {
  const { lang } = useFarmerData();
  const t = getHelpI18n(lang);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [query, setQuery] = useState("");

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return t.faqs;
    return t.faqs.filter(
      (faq) => faq.q.toLowerCase().includes(q) || faq.a.toLowerCase().includes(q),
    );
  }, [t.faqs, query]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Slim header */}
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
          <HelpCircle className="h-3.5 w-3.5 text-emerald-700" />
          <span>{lang === "hi" ? "सहायता केंद्र" : "Help Centre"}</span>
        </div>
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          {t.title}
        </h1>
        <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
          {t.subtitle}
        </p>
      </div>

      {/* FAQ search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpenFaqIndex(0);
          }}
          placeholder={lang === "hi" ? "प्रश्न खोजें…" : "Search questions…"}
          aria-label={lang === "hi" ? "प्रश्न खोजें" : "Search questions"}
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-xs outline-none placeholder:text-slate-400 focus:border-emerald-600"
        />
      </div>

      {/* FAQ accordion */}
      <section className="space-y-2" aria-label={t.faqTitle}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-slate-900 sm:text-base">{t.faqTitle}</h2>
          <span className="font-mono text-[11px] text-slate-500">
            {filteredFaqs.length}/{t.faqs.length}
          </span>
        </div>

        {filteredFaqs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs sm:text-sm text-slate-500">
            {lang === "hi"
              ? "कोई प्रश्न नहीं मिला। दूसरे शब्दों से खोजें।"
              : "No matching questions. Try different keywords."}
          </div>
        ) : (
          filteredFaqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={`${idx}-${faq.q.slice(0, 24)}`}
                className={clsx(
                  "overflow-hidden rounded-xl border bg-white transition-colors",
                  isOpen ? "border-emerald-700/40 shadow-xs" : "border-slate-200",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  <span>{faq.q}</span>
                  <span
                    className={clsx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isOpen
                        ? "border-emerald-700 bg-emerald-800 text-white"
                        : "border-slate-200 text-slate-400",
                    )}
                  >
                    <ChevronDown
                      className={clsx("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")}
                    />
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs sm:text-sm leading-relaxed text-slate-600">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Quiet footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        <p className="text-xs text-[var(--ink-muted)]">
          {lang === "hi" ? "फिर भी मदद चाहिए?" : "Still need help?"}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <Link
            href="/farmer/saathi"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <Bot className="h-3.5 w-3.5" />
            <span>{t.talkToSaathiBtn}</span>
          </Link>
          <Link
            href="/farmer/claims"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{t.viewClaimsBtn}</span>
          </Link>
          <Link
            href="/farmer/capture"
            className="fp-btn-primary min-h-11 rounded-lg px-4 py-2 text-xs"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>{t.startClaimBtn}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
