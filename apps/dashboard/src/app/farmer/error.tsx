"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";
import { useFarmerData } from "@/lib/farmerStore";

export default function FarmerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { lang } = useFarmerData();

  useEffect(() => {
    console.error("Farmer portal error boundary caught error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-12 px-4 text-center">
      <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 sm:p-8 shadow-xs">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
          {lang === "hi" ? "कुछ गड़बड़ हो गई" : "Something went wrong"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {lang === "hi"
            ? "पेज लोड करने में समस्या आई। आप दोबारा प्रयास कर सकते हैं या मुख्य पृष्ठ पर जा सकते हैं।"
            : "An unexpected error occurred while loading this page. You can retry or return to the farmer home."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{lang === "hi" ? "फिर से कोशिश करें" : "Try again"}</span>
          </button>
          <Link
            href="/farmer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Home className="h-4 w-4 text-slate-500" />
            <span>{lang === "hi" ? "होम पेज" : "Farmer Home"}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
