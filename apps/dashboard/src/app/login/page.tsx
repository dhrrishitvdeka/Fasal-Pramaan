"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, logoutSession, setSessionTokens } from "@/lib/api";
import { LoginForm, loginSchema } from "@/lib/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues:
      process.env.NEXT_PUBLIC_DEMO_MODE === "true"
        ? { email: "reviewer@fasalpramaan.local", password: "Demo@12345" }
        : { email: "", password: "" },
  });

  async function onSubmit(data: LoginForm) {
    setError(null);
    try {
      const res = await api.post("/auth/login", data);
      setSessionTokens(res.data.access_token, res.data.refresh_token);
      const me = await api.get<{ roles: string[] }>("/auth/me");
      if (!me.data.roles.some((role) => role === "reviewer" || role === "administrator")) {
        await logoutSession();
        setError("This command centre is restricted to reviewers and administrators.");
        return;
      }
      router.push("/overview");
    } catch {
      setError("Sign-in failed. Check credentials and network connectivity.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <div className="border-b border-slate-300 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-lg items-baseline justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">FasalPramaan</div>
            <div className="text-xs text-slate-500">Command Centre · Official access</div>
          </div>
          <div className="text-xs text-slate-400">फसल प्रमाण</div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm border border-slate-300 bg-white p-6">
          <h1 className="text-base font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-xs text-slate-500">
            For authorised government and insurance reviewers only.
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

          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
            <p className="mt-6 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-400">
              Local demo: reviewer@fasalpramaan.local / Demo@12345. Do not use production credentials
              in this environment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
