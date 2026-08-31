"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { Trash2 } from "lucide-react";

export default function FarmerQueuePage() {
  const { lang, loadClaimDraft, clearClaimDraft } = useFarmerData();
  const t = getFarmerT(lang);
  const [draft, setDraft] = useState(() => loadClaimDraft());
  const imageCount = draft?.images?.length ?? 0;

  const handleDiscard = () => {
    clearClaimDraft();
    setDraft(null);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">{t.queueTitle}</h1>
      {!draft ? (
        <p className="text-sm text-slate-600">{t.queueEmpty}</p>
      ) : (
        <div className="fp-panel space-y-3 p-3 sm:p-5">
          <div className="text-sm font-bold">
            {lang === "hi" ? draft.plotNameHi || draft.plotName : draft.plotName || t.draftsQueue}
          </div>
          <p className="text-xs text-slate-600">
            {imageCount} {lang === "hi" ? "कोण सहेजे" : "angles saved"}
          </p>
          {draft.farmerObservations ? (
            <p className="text-xs text-slate-600">{draft.farmerObservations}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link href="/farmer/capture" className="fp-btn-primary text-xs">
              {t.resumeDraft}
            </Link>
            <button
              type="button"
              onClick={handleDiscard}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{lang === "hi" ? "ड्राफ्ट हटाएं" : "Discard draft"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
