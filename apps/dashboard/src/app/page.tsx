"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listClaims, type Submission } from "@/lib/api";
import { LANDING_ACTIONS } from "@/lib/landing-actions";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useLanguage } from "@/lib/LanguageContext";

const STEPS = [
  {
    n: "1",
    enTitle: "Capture",
    hiTitle: "कैप्चर",
    en: "Five field angles with device GPS when the browser can provide it.",
    hi: "पाँच खेत कोण, जब ब्राउज़र दे तो उपकरण GPS के साथ।",
  },
  {
    n: "2",
    enTitle: "Score",
    hiTitle: "स्कोर",
    en: "Coverage, lighting, GPS, and SHA-256 are scored only from what was measured.",
    hi: "कवरेज, रोशनी, GPS और SHA-256 केवल मापे गए संकेत से।",
  },
  {
    n: "3",
    enTitle: "Review",
    hiTitle: "समीक्षा",
    en: "An officer accepts, corrects, requests specific angles, or sends the case to the field.",
    hi: "अधिकारी स्वीकार, सुधार, विशिष्ट कोण, या क्षेत्र निरीक्षण तय करता है।",
  },
  {
    n: "4",
    enTitle: "Recapture",
    hiTitle: "पुनः कैप्चर",
    en: "The farmer retakes only the angles that were asked for. Status stays on the same record.",
    hi: "किसान केवल माँगे गए कोण दोहराता है। स्थिति उसी रिकॉर्ड पर रहती है।",
  },
];

export default function HomePage() {
  const { lang } = useLanguage();
  const [claims, setClaims] = useState<Submission[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listClaims()
      .then((items) => {
        if (!cancelled) setClaims(items.slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setClaims([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
      <p className="fp-kicker">Fasal-Pramaan · फसल प्रमाण</p>
      <h1 className="mt-4 text-[2rem] leading-[1.2] tracking-tight text-[var(--ink)] sm:text-[2.75rem]">
        {lang === "hi"
          ? "फसल का साक्ष्य। सहायक आकलन। मानवीय निर्णय।"
          : "Crop evidence. Assistive screening. Human decision."}
      </h1>
      <p className="mt-5 max-w-xl text-base text-[var(--ink-muted)]">
        {lang === "hi"
          ? "किसान पाँच कोण जमा करते हैं। समीक्षक वास्तविक दावों की जाँच करते हैं।"
          : "Farmers submit five angles. Reviewers inspect the real record."}
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        {LANDING_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={action.href === "/farmer" ? "fp-btn-primary" : "fp-btn-secondary"}
          >
            {lang === "hi" ? action.hi : action.en}
          </Link>
        ))}
      </div>

      <ol className="mt-20 space-y-0 border-t border-[var(--line)]">
        {STEPS.map((step) => (
          <li key={step.n} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-[var(--line)] py-5">
            <span className="fp-ui pt-0.5 text-sm tabular-nums text-[var(--ink-muted)]">{step.n}</span>
            <div>
              <h2 className="fp-ui text-sm font-semibold text-[var(--ink)]">
                {lang === "hi" ? step.hiTitle : step.enTitle}
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{lang === "hi" ? step.hi : step.en}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="fp-page-title">{lang === "hi" ? "हाल के दावे" : "Recent claims"}</h2>
            <p className="fp-page-sub">
              {isSupabaseConfigured()
                ? lang === "hi"
                  ? "डेटाबेस में दर्ज वास्तविक दावे।"
                  : "Records from the configured database."
                : lang === "hi"
                  ? "Supabase कॉन्फ़िगर नहीं है।"
                  : "Supabase is not configured."}
            </p>
          </div>
          <Link href="/review" className="fp-link fp-ui text-sm">
            {lang === "hi" ? "कतार" : "Queue"}
          </Link>
        </div>

        {!loaded ? (
          <p className="mt-6 text-sm text-[var(--ink-muted)]">
            {lang === "hi" ? "लोड हो रहा है…" : "Loading…"}
          </p>
        ) : claims.length === 0 ? (
          <p className="mt-6 border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--ink-muted)]">
            {lang === "hi"
              ? "अभी कोई दावा नहीं है। किसान पोर्टल से साक्ष्य जमा करें।"
              : "No claims yet. Submit evidence from the Farmer Portal."}
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto border border-[var(--line)] bg-[var(--surface)]">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{lang === "hi" ? "स्थिति" : "Status"}</th>
                  <th>{lang === "hi" ? "फसल" : "Crop"}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id}>
                    <td className="font-mono text-xs">{claim.id.slice(0, 12)}</td>
                    <td className="capitalize">{claim.status.replaceAll("_", " ")}</td>
                    <td>{claim.latest_prediction?.predicted_crop || "—"}</td>
                    <td className="text-right">
                      <Link href={`/review/${claim.id}`} className="fp-link">
                        {lang === "hi" ? "खोलें" : "Open"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
