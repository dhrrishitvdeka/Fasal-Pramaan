"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { logoutSession } from "@/lib/api";

export default function FarmerProfilePage() {
  const router = useRouter();
  const { lang, farmerProfile, plots, claims, milestones } = useFarmerData();
  const t = getFarmerT(lang);
  const openStages = milestones.filter((item) => !item.completed).length;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">{t.profileTitle}</h1>
      <div className="fp-panel space-y-2 p-3 sm:p-5">
        <div className="text-base font-bold">
          {lang === "hi" ? farmerProfile.nameHi || farmerProfile.name : farmerProfile.name}
        </div>
        <dl className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{t.kisanId}</dt>
            <dd>{farmerProfile.kisanId || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{lang === "hi" ? "फ़ोन" : "Phone"}</dt>
            <dd>{farmerProfile.phone || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">{lang === "hi" ? "पता" : "Address"}</dt>
            <dd>{[farmerProfile.village, farmerProfile.district, farmerProfile.state].filter(Boolean).join(", ") || "—"}</dd>
          </div>
        </dl>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="fp-panel p-3 text-center">
          <div className="text-lg font-bold">{plots.length}</div>
          <div className="text-[11px] text-slate-500">{t.statPlots}</div>
        </div>
        <div className="fp-panel p-3 text-center">
          <div className="text-lg font-bold">{claims.length}</div>
          <div className="text-[11px] text-slate-500">{t.statClaims}</div>
        </div>
        <div className="fp-panel p-3 text-center">
          <div className="text-lg font-bold">{openStages}</div>
          <div className="text-[11px] text-slate-500">{t.reminders}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/farmer/help" className="fp-btn-secondary text-xs">
          {t.help}
        </Link>
        <Link href="/farmer/queue" className="fp-btn-secondary text-xs">
          {t.draftsQueue}
        </Link>
        <button
          type="button"
          className="fp-btn-secondary text-xs"
          onClick={async () => {
            await logoutSession();
            router.push("/login?next=/farmer");
          }}
        >
          {t.signOut}
        </button>
      </div>
    </div>
  );
}
