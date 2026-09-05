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
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="fp-btn-primary w-full sm:w-auto"
          >
            Try again · पुनः प्रयास करें
          </button>
          <a
            href="/overview"
            className="fp-btn-secondary w-full sm:w-auto text-xs inline-flex items-center justify-center"
          >
            Return to overview
          </a>
        </div>
      </div>
    </div>
  );
}
