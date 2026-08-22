"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import type { RoleGateStatus } from "@/lib/use-require-role";

function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-8">
      <div className="fp-panel w-full max-w-md p-6 text-center sm:p-8">{children}</div>
    </div>
  );
}

function LoadingGate() {
  return (
    <div className="fp-panel flex min-h-[40vh] items-center justify-center">
      <span
        aria-label="Loading"
        role="status"
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--ink)]"
      />
    </div>
  );
}

function UnauthenticatedGate() {
  const pathname = usePathname();
  return (
    <GateCard>
      <Lock className="mx-auto h-8 w-8 opacity-60" strokeWidth={1.5} aria-hidden />
      <h2 className="mt-3 text-base font-semibold text-[var(--ink)]">
        Sign in to access the Reviewer Command Centre
      </h2>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        समीक्षक कमांड सेंटर तक पहुँचने के लिए साइन इन करें
      </p>
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="fp-btn-primary mt-5 w-full sm:w-auto"
      >
        Sign in · साइन इन करें
      </Link>
    </GateCard>
  );
}

function DeniedGate() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setEmail(data.user?.email ?? null);
      })
      .catch(() => {
        // ignore — hint stays generic
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GateCard>
      <ShieldAlert className="mx-auto h-8 w-8 opacity-60" strokeWidth={1.5} aria-hidden />
      <h2 className="mt-3 text-base font-semibold text-[var(--ink)]">Reviewer access required</h2>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        इस पृष्ठ के लिए समीक्षक अधिकार आवश्यक हैं
      </p>
      <p className="mt-4 border border-[var(--line)] bg-[var(--canvas)] px-3 py-2 text-xs text-[var(--ink-muted)]">
        Signed in as{" "}
        <span className="font-medium text-[var(--ink)]">{email || "your account"}</span> · प्रवेश:{" "}
        {email || "—"}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/" className="fp-btn-secondary w-full sm:w-auto">
          Back to home · मुखपृष्ठ
        </Link>
      </div>
    </GateCard>
  );
}

export default function AccessGate({
  status,
  children,
}: {
  status: RoleGateStatus;
  children?: React.ReactNode;
}) {
  if (status === "ok") return <>{children}</>;
  if (status === "loading") return <LoadingGate />;
  if (status === "unauthenticated") return <UnauthenticatedGate />;
  return <DeniedGate />;
}
