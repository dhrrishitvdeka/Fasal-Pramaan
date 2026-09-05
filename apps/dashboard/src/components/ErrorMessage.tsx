"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ArrowLeft, ShieldAlert } from "lucide-react";
import clsx from "clsx";

interface ErrorMessageProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
  compact?: boolean;
}

export default function ErrorMessage({
  title = "Something went wrong",
  message = "An unexpected error occurred while loading this section. Your existing data remains safe.",
  onRetry,
  retryLabel = "Try again · पुनः प्रयास करें",
  actionHref,
  actionLabel = "Return to overview",
  className,
  compact = false,
}: ErrorMessageProps) {
  if (compact) {
    return (
      <div
        role="alert"
        className={clsx(
          "flex items-center justify-between gap-3 border border-amber-300 bg-amber-50/70 p-3.5 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200",
          className,
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
            aria-hidden="true"
          />
          <span className="truncate">{message}</span>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center gap-1.5 font-medium underline hover:text-amber-900 dark:hover:text-white"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={clsx(
        "border border-amber-300 bg-amber-50/50 p-6 sm:p-8 text-center shadow-2xs dark:border-amber-900/50 dark:bg-amber-950/10",
        className,
      )}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
        <ShieldAlert
          className="h-6 w-6 text-amber-800 dark:text-amber-400"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      <h3 className="mt-4 text-base font-serif font-semibold text-[var(--ink)] sm:text-lg">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--ink-muted)] sm:text-sm">
        {message}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 items-center justify-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-4 text-xs font-semibold text-[var(--surface)] transition-all hover:bg-[var(--accent)] hover:border-[var(--accent)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{retryLabel}</span>
          </button>
        )}

        {actionHref && (
          <Link
            href={actionHref}
            className="inline-flex h-9 items-center justify-center gap-1.5 border border-[var(--line)] bg-[var(--surface)] px-4 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--canvas)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{actionLabel}</span>
          </Link>
        )}
      </div>
    </div>
  );
}

export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={clsx(
        "flex items-center justify-between gap-2 rounded border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
        <span className="truncate">{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-mono text-[11px] font-semibold underline hover:text-rose-950"
        >
          Retry
        </button>
      )}
    </div>
  );
}
