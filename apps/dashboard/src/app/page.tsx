"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Shield,
  Camera,
  FileCheck2,
  Sparkles,
  ArrowRight,
  Cpu,
} from "lucide-react";
import { listClaims, type Submission } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useLanguage } from "@/lib/LanguageContext";

export default function HomePage() {
  const { lang, t } = useLanguage();
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
    <div className="space-y-16 pb-20">
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 border-b border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/30 via-slate-900/0 to-transparent pointer-events-none" />

        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-6 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Fasal-Pramaan · Crop Evidence Portal</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl max-w-4xl mx-auto leading-tight">
            {lang === "hi" ? (
              <>
                पारदर्शी फसल साक्ष्य। <span className="text-emerald-400">सहायक AI आकलन।</span> मानवीय निर्णय।
              </>
            ) : (
              <>
                Verifiable Crop Evidence. <span className="text-emerald-400">Assistive AI.</span> Human Review.
              </>
            )}
          </h1>

          <p className="mt-6 max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed">
            {lang === "hi"
              ? "किसान 5-कोण साक्ष्य कैप्चर करते हैं। समीक्षक वास्तविक दावों की जाँच करते हैं। कोई नकली मेट्रिक या डेमो केस नहीं।"
              : "Farmers capture 5-angle evidence. Reviewers inspect real claims. No fabricated metrics or canned demo cases."}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/farmer"
              className="flex items-center gap-2.5 rounded-lg bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 transition active:scale-98"
            >
              <span className="text-lg">🌾</span>
              <span>{lang === "hi" ? "किसान पोर्टल" : "Farmer Portal"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/overview"
              className="flex items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-800/90 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-slate-700 hover:border-slate-600 transition active:scale-98"
            >
              <span className="text-lg">🔍</span>
              <span>{lang === "hi" ? "समीक्षक केंद्र" : "Reviewer Centre"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
            <Cpu className="h-3.5 w-3.5" />
            <span>How it works</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t("architectureTitle")}</h2>
          <p className="mt-2 text-sm text-slate-400">{t("architectureSub")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-bold mb-4">
              01
            </div>
            <h3 className="text-base font-semibold text-white">5-Angle Capture</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Farmers capture wide, left, mid-canopy, right, and close-up frames with device GPS when available.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-emerald-400" />
              <span>Real camera or file upload</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 font-bold mb-4">
              02
            </div>
            <h3 className="text-base font-semibold text-white">Evidence Preview</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Coverage, quality, GPS context, and SHA-256 integrity are scored only from measured signals.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-sky-400" />
              <span>No invented hashes or GPS</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 font-bold mb-4">
              03
            </div>
            <h3 className="text-base font-semibold text-white">Reviewer Queue</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Officers accept, correct, request specific recapture angles, or send a case to field inspection.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <FileCheck2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Actions write an audit row</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 font-bold mb-4">
              04
            </div>
            <h3 className="text-base font-semibold text-white">Farmer Recapture</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Requested angles appear on the farmer claim so only the missing or rejected views are retaken.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Status stays in the database</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 border-b border-slate-800 pb-5">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {lang === "hi" ? "हाल के दावे" : "Recent claims"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {isSupabaseConfigured()
                ? lang === "hi"
                  ? "डेटाबेस में दर्ज वास्तविक दावे।"
                  : "Live records from the configured database."
                : lang === "hi"
                  ? "Supabase कॉन्फ़िगर नहीं है — दावे खाली रहेंगे जब तक किसान इस सत्र में जमा न करे।"
                  : "Supabase is not configured — the queue stays empty until a real backend is connected."}
            </p>
          </div>
          <Link href="/review" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            {lang === "hi" ? "समीक्षा कतार खोलें →" : "Open review queue →"}
          </Link>
        </div>

        {!loaded ? (
          <p className="text-sm text-slate-500">Loading claims…</p>
        ) : claims.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
            <p className="text-sm font-semibold text-slate-200">
              {lang === "hi" ? "अभी कोई दावा नहीं है" : "No claims yet"}
            </p>
            <p className="mt-2 text-xs text-slate-500 max-w-lg mx-auto">
              {lang === "hi"
                ? "किसान पोर्टल से 5-कोण साक्ष्य जमा करें। समीक्षक कतार उन्हीं रिकॉर्ड को दिखाएगी।"
                : "Submit 5-angle evidence from the Farmer Portal. The reviewer queue will list those records."}
            </p>
            <Link
              href="/farmer/capture"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <Camera className="h-3.5 w-3.5" />
              {lang === "hi" ? "साक्ष्य कैप्चर खोलें" : "Open capture studio"}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80">
            <table className="min-w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Crop</th>
                  <th className="px-4 py-3">Evidence</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id} className="border-b border-slate-800/80 last:border-0">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-200">{claim.id.slice(0, 12)}</td>
                    <td className="px-4 py-3 capitalize">{claim.status.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3">{claim.latest_prediction?.predicted_crop || "—"}</td>
                    <td className="px-4 py-3">
                      {claim.latest_evaluation?.confidence.final != null
                        ? `${claim.latest_evaluation.confidence.final}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/review/${claim.id}`} className="text-emerald-400 hover:text-emerald-300 font-semibold">
                        Review
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
