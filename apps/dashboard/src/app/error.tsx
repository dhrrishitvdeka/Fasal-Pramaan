"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-8">
      <div className="fp-panel w-full max-w-md p-6 text-center sm:p-8" role="alert">
        <AlertTriangle className="mx-auto h-8 w-8 opacity-60" strokeWidth={1.5} aria-hidden />
        <h2 className="mt-3 text-base font-semibold text-[var(--ink)]">Something went wrong</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">कुछ ग़लत हो गया। कृपया पुनः प्रयास करें।</p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-muted)]">
          The page hit an unexpected error. Your data is safe — try again or return to the overview.
          <br />
          पृष्ठ में अप्रत्याशित त्रुटि आई। आपका डेटा सुरक्षित है।
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-[var(--ink-muted)]">ref: {error.digest}</p>
        ) : null}
        <button type="button" onClick={reset} className="fp-btn-primary mt-5 w-full sm:w-auto">
          Try again · पुनः प्रयास करें
        </button>
      </div>
    </div>
  );
}
