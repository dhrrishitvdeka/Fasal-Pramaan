"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/auth-headers";
import { LoginForm, loginSchema, SignupForm, signupSchema } from "@/lib/schemas";
import { canAccessReviewerPortal } from "@/lib/review-access";
import { isSupabaseConfigured } from "@/lib/supabase";
import { clearRoleCache } from "@/lib/use-require-role";
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
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const nextPath = safeNext(search.get("next"));
  const commandCentreLogin = Boolean(nextPath && !nextPath.startsWith("/farmer"));

  useEffect(() => {
    const err = search.get("error");
    if (err === "exchange_failed" || err === "missing_code") {
      setError("Email confirmation failed. Request a new link from sign-in.");
    }
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    async function bounceExisting() {
      if (!isSupabaseConfigured()) return;
      const meRes = await apiFetch("/api/me");
      if (!meRes.ok || cancelled) return;
      const me = (await meRes.json().catch(() => ({}))) as { role?: string; roles?: string[] };
      if (cancelled) return;
      const next = safeNext(search.get("next"));
      if (me.role === "farmer") {
        router.replace(next?.startsWith("/farmer") ? next : "/farmer");
        return;
      }
      if (canAccessReviewerPortal(me.roles)) {
        router.replace(next && !next.startsWith("/farmer") ? next : "/overview");
      }
    }
    void bounceExisting();
    return () => {
      cancelled = true;
    };
  }, [nextPath, router, search]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const signupForm = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", fullName: "" },
  });

  async function onSignIn(data: LoginForm) {
    setError(null);
    setInfo(null);
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; role?: string };
    if (!res.ok) {
      setError(body.error || "Sign-in failed.");
      return;
    }
    clearRoleCache();
    const next = safeNext(search.get("next"));
    if (body.role === "farmer") {
      router.push(next?.startsWith("/farmer") ? next : "/farmer");
      return;
    }
    router.push(next && !next.startsWith("/farmer") ? next : "/overview");
  }

  async function onSignUp(data: SignupForm) {
    setError(null);
    setInfo(null);
    const res = await apiFetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      needsConfirmation?: boolean;
      message?: string;
    };
    if (!res.ok) {
      setError(body.error || "Could not create the account.");
      return;
    }
    if (body.needsConfirmation) {
      setInfo(body.message || "Check your email for a confirmation link.");
      setMode("signin");
      return;
    }
    clearRoleCache();
    router.push("/farmer");
  }

  async function onForgot(email: string) {
    setError(null);
    setInfo(null);
    const res = await apiFetch("/api/auth/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      setError(body.error || "Could not send the reset email.");
      return;
    }
    setInfo(body.message || "If an account exists, a reset link has been sent.");
    setMode("signin");
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
          <h1 className="text-base font-semibold text-slate-900">
            {mode === "signup" ? "Create farmer account" : mode === "forgot" ? "Reset password" : "Sign in"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {mode === "signup"
              ? "Farmers can self-register. Reviewer accounts are issued by administrators."
              : commandCentreLogin
                ? "This area is for reviewer accounts only. A farmer login cannot open the Command Centre."
                : "Reviewers land on the command centre; farmers land on the capture portal."}
          </p>

          {mode === "signin" && (
            <form onSubmit={loginForm.handleSubmit(onSignIn)} className="mt-6 space-y-4" noValidate>
              <div>
                <label className="block text-xs font-medium text-slate-700" htmlFor="email">
                  Official email
                </label>
                <input id="email" type="email" autoComplete="username" className="fp-input" {...loginForm.register("email")} />
                {loginForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-slate-800" role="alert">
                    {loginForm.formState.errors.email.message}
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
                  {...loginForm.register("password")}
                />
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-slate-800" role="alert">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              {error && (
                <p className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800" role="alert">
                  {error}
                </p>
              )}
              {info && (
                <p className="border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{info}</p>
              )}
              <button type="submit" disabled={loginForm.formState.isSubmitting} className="fp-btn-primary w-full">
                {loginForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          {mode === "signup" && (
            <form onSubmit={signupForm.handleSubmit(onSignUp)} className="mt-6 space-y-4" noValidate>
              <div>
                <label className="block text-xs font-medium text-slate-700" htmlFor="fullName">
                  Full name
                </label>
                <input id="fullName" type="text" autoComplete="name" className="fp-input" {...signupForm.register("fullName")} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700" htmlFor="signup-email">
                  Email
                </label>
                <input id="signup-email" type="email" autoComplete="email" className="fp-input" {...signupForm.register("email")} />
                {signupForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-slate-800" role="alert">
                    {signupForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700" htmlFor="signup-password">
                  Password (8+ characters)
                </label>
                <input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  className="fp-input"
                  {...signupForm.register("password")}
                />
                {signupForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-slate-800" role="alert">
                    {signupForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              {error && (
                <p className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" disabled={signupForm.formState.isSubmitting} className="fp-btn-primary w-full">
                {signupForm.formState.isSubmitting ? "Creating account…" : "Create farmer account"}
              </button>
            </form>
          )}

          {mode === "forgot" && (
            <form
              onSubmit={loginForm.handleSubmit((data) => onForgot(data.email))}
              className="mt-6 space-y-4"
              noValidate
            >
              <div>
                <label className="block text-xs font-medium text-slate-700" htmlFor="forgot-email">
                  Email
                </label>
                <input id="forgot-email" type="email" autoComplete="email" className="fp-input" {...loginForm.register("email")} />
              </div>
              {error && (
                <p className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" disabled={loginForm.formState.isSubmitting} className="fp-btn-primary w-full">
                {loginForm.formState.isSubmitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <div className="mt-4 space-y-2 text-[11px] text-slate-500">
            {mode !== "signin" && (
              <button type="button" className="underline-offset-2 hover:underline" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            )}
            {mode === "signin" && !commandCentreLogin && (
              <div className="flex flex-wrap gap-3">
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setMode("signup")}>
                  Create farmer account
                </button>
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setMode("forgot")}>
                  Forgot password
                </button>
              </div>
            )}
            {mode === "signin" && commandCentreLogin && (
              <button type="button" className="underline-offset-2 hover:underline" onClick={() => setMode("forgot")}>
                Forgot password
              </button>
            )}
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
