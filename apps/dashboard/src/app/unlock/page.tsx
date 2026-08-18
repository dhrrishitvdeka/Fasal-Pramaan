"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function UnlockForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Unlock failed");
        return;
      }
      try {
        localStorage.setItem("fp_site_gate_v1", "ok");
      } catch {
        // ignore
      }
      const rawNext = search.get("next") || "/";
      const next =
        rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
          ? rawNext
          : "/";
      router.replace(next);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)]">
      <div className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-lg items-baseline justify-between">
          <div>
            <div className="text-sm tracking-tight text-[var(--ink)]">Fasal-Pramaan</div>
            <div className="text-xs text-slate-500">Restricted preview</div>
          </div>
          <div className="text-xs text-slate-400">फसल प्रमाण</div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="fp-panel w-full max-w-sm p-4 sm:p-6">
          <h1 className="text-base font-semibold text-slate-900">Enter access password</h1>
          <p className="mt-1 text-xs text-slate-500">
            This site is locked so hosted API quota is not used by casual visitors.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700" htmlFor="site-password">
                Master password
              </label>
              <input
                id="site-password"
                type="password"
                autoComplete="current-password"
                className="fp-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error && (
              <p className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting} className="fp-btn-primary w-full">
              {submitting ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function UnlockPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <UnlockForm />
    </Suspense>
  );
}
