"use client";

import { useFarmerData } from "@/lib/farmerStore";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Fixed amber strip shown at the very top of the farmer portal while the
 * browser reports offline. Bilingual; reuses the shared online-status hook.
 *
 * Honest scope: captures are NOT queued across sessions. Draft claim state
 * lives in sessionStorage for this session only (see farmerStore.tsx); a
 * persistent IndexedDB outbox is future work. The service worker logs the
 * same caveat at install time.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { lang } = useFarmerData();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky inset-x-0 top-0 z-[60] bg-amber-400 px-3 py-1.5 text-center text-xs font-semibold text-slate-900 shadow-sm sm:text-sm"
    >
      {lang === "hi"
        ? "ऑफ़लाइन — दावा जमा नहीं होगा। प्रारूप इस सत्र में डिवाइस पर रह सकता है; कैप्चर कतार में नहीं जाते।"
        : "Offline — claims cannot be submitted. A draft may stay on this device for this session; captures are not queued."}
    </div>
  );
}
