"use client";

import Link from "next/link";
import { CANONICAL_ANGLES, getFarmerT } from "@/lib/farmerI18n";
import { useFarmerData } from "@/lib/farmerStore";

export default function FarmerHelpPage() {
  const { lang } = useFarmerData();
  const t = getFarmerT(lang);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">{t.helpTitle}</h1>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">{t.helpSub}</p>
      </div>
      <ol className="space-y-3">
        {CANONICAL_ANGLES.map((angle, index) => (
          <li key={angle.id} className="fp-panel p-3 sm:p-5">
            <div className="text-xs font-mono text-slate-500">{index + 1} / 5</div>
            <h2 className="mt-1 text-sm font-bold text-slate-900">
              {lang === "hi" ? angle.nameHi : angle.name}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {lang === "hi" ? angle.instructionsHi : angle.instructions}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
              {(lang === "hi" ? angle.tipsHi : angle.tips).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <Link href="/farmer/capture" className="fp-btn-primary">
        {t.quickActionNewClaim}
      </Link>
    </div>
  );
}
