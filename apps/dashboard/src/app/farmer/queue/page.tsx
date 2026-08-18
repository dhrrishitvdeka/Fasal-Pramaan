"use client";

import Link from "next/link";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";

export default function FarmerQueuePage() {
  const { lang, loadClaimDraft } = useFarmerData();
  const t = getFarmerT(lang);
  const draft = loadClaimDraft();
  const imageCount = draft?.images?.length ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">{t.queueTitle}</h1>
      {!draft ? (
        <p className="text-sm text-slate-600">{t.queueEmpty}</p>
      ) : (
        <div className="fp-panel space-y-2 p-3 sm:p-5">
          <div className="text-sm font-bold">
            {lang === "hi" ? draft.plotNameHi || draft.plotName : draft.plotName || t.draftsQueue}
          </div>
          <p className="text-xs text-slate-600">
            {imageCount} {lang === "hi" ? "कोण सहेजे" : "angles saved"}
          </p>
          {draft.farmerObservations ? (
            <p className="text-xs text-slate-600">{draft.farmerObservations}</p>
          ) : null}
          <Link href="/farmer/capture" className="fp-btn-primary text-xs">
            {t.resumeDraft}
          </Link>
        </div>
      )}
    </div>
  );
}
