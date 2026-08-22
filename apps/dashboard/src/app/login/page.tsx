"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, logoutSession, setSessionTokens } from "@/lib/api";
import { apiFetch } from "@/lib/auth-headers";
import { LoginForm, loginSchema } from "@/lib/schemas";
import { canAccessReviewerPortal } from "@/lib/review-access";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

function LoginFormView() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const nextPath = safeNext(search.get("next"));
  const commandCentreLogin = Boolean(nextPath && !nextPath.startsWith("/farmer"));

  useEffect(() => {
    let cancelled = false;
    async function bounceExistingReviewer() {
      if (!isSupabaseConfigured()) return;
      const meRes = await apiFetch("/api/me");
      if (!meRes.ok || cancelled) return;
      const me = (await meRes.json().catch(() => ({}))) as { roles?: string[] };
      if (cancelled) return;
      if (canAccessReviewerPortal(me.roles)) {
        router.replace(nextPath && !nextPath.startsWith("/farmer") ? nextPath : "/overview");
      }
    }
    void bounceExistingReviewer();
    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginForm) {
    setError(null);
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setError("Supabase is not configured.");
          return;
        }
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (authError) {
          setError(authError.message || "Sign-in failed.");
          return;
        }
        const meRes = await apiFetch("/api/me");
        const me = (await meRes.json().catch(() => ({}))) as { role?: string };
        if (!meRes.ok) {
          setError("Signed in, but the server could not resolve your role.");
          return;
        }
        const next = safeNext(search.get("next"));
        if (me.role === "farmer") {
          router.push(next?.startsWith("/farmer") ? next : "/farmer");
          return;
        }
        router.push(next && !next.startsWith("/farmer") ? next : "/overview");
        return;
      }

      // Local / Offline demo mode authentication (when Supabase is not connected)
      const email = data.email.trim().toLowerCase();
      const isReviewer =
        email.includes("reviewer") ||
        email.includes("admin") ||
        email === "reviewer@fasalpramaan.local";
      const role = isReviewer ? "reviewer" : "farmer";
      const roles = isReviewer ? ["reviewer", "administrator"] : ["farmer"];

      setSessionTokens(`demo-jwt-${role}-${Date.now()}`, `demo-refresh-${Date.now()}`);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("fp_demo_user", JSON.stringify({ email, role, roles }));
      }

      const next = safeNext(search.get("next"));
      if (role === "farmer") {
        router.push(next?.startsWith("/farmer") ? next : "/farmer");
        return;
      }
      router.push(next && !next.startsWith("/farmer") ? next : "/overview");
      return;
    } catch {
      setError("Sign-in failed. Check credentials and network connectivity.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)]">
      <div className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-lg items-baseline justify-between">
          <div>
            <div className="text-sm tracking-tight text-[var(--ink)]">Fasal-Pramaan</div>
            <div className="text-xs text-slate-500">
              {commandCentreLogin ? "Reviewer Command Centre · sign in required" : "Official access"}
            </div>
          </div>
          <div className="text-xs text-slate-400">फसल प्रमाण</div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="fp-panel w-full max-w-sm p-4 sm:p-6">
          <h1 className="text-base font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-xs text-slate-500">
            {commandCentreLogin
              ? "This area is for reviewer accounts only. A farmer login cannot open the Command Centre."
              : "Reviewers land on the command centre; farmers land on the capture portal."}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div>
              <label className="block text-xs font-medium text-slate-700" htmlFor="email">
                Official email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className="fp-input"
                {...register("email")}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-slate-800" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="fp-input"
                {...register("password")}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-slate-800" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>
            {error && (
              <p
                className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                role="alert"
              >
                {error}
              </p>
            )}
            <button type="submit" disabled={isSubmitting} className="fp-btn-primary w-full">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">Local demo accounts:</p>
            <p>• <strong>Reviewer:</strong> reviewer@fasalpramaan.local / Demo@12345</p>
            <p>• <strong>Farmer:</strong> farmer@fasalpramaan.local / Demo@12345</p>
          </div>

          <div className="mt-4 flex gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
            <Link href="/privacy" className="underline-offset-2 hover:text-slate-600 hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="underline-offset-2 hover:text-slate-600 hover:underline">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <LoginFormView />
    </Suspense>
  );
}
