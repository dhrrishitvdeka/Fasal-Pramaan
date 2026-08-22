"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

export function LoadingSpinner({
  size = "md",
  label,
  className,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        "inline-flex items-center justify-center gap-2.5 text-[var(--ink-muted)]",
        className,
      )}
    >
      <Loader2
        className={clsx("animate-spin text-[var(--accent)]", sizeClasses[size])}
        aria-hidden="true"
      />
      {label ? (
        <span className="text-xs font-medium tracking-wide">{label}</span>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
    </div>
  );
}

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 4,
  cols = 6,
  className,
}: TableSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading data table"
      className={clsx(
        "overflow-hidden border border-[var(--line)] bg-[var(--surface)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--canvas)] px-4 py-3">
        <div className="h-4 w-28 animate-pulse rounded-xs bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ink-muted)]" />
          <span className="text-[11px] font-mono text-[var(--ink-muted)]">
            Fetching…
          </span>
        </div>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--canvas)]/50">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-2.5 font-medium">
                <div
                  className="h-3 animate-pulse rounded-xs bg-slate-200 dark:bg-slate-700"
                  style={{ width: `${40 + (i % 3) * 20}%` }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {Array.from({ length: rows }).map((_, rIdx) => (
            <tr key={rIdx} className="hover:bg-[var(--canvas)]/30">
              {Array.from({ length: cols }).map((_, cIdx) => (
                <td key={cIdx} className="px-4 py-3.5">
                  <div
                    className="h-3.5 animate-pulse rounded-xs bg-slate-200/80 dark:bg-slate-700/80"
                    style={{
                      width: `${50 + ((rIdx + cIdx) % 4) * 15}%`,
                      animationDelay: `${(rIdx * cols + cIdx) * 50}ms`,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CardSkeletonProps {
  count?: number;
  className?: string;
}

export function CardSkeleton({ count = 4, className }: CardSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading cards"
      className={clsx(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-7 w-7 animate-pulse rounded-sm bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-12 animate-pulse rounded-xs bg-slate-200/70 dark:bg-slate-700/70" />
          </div>
          <div className="mt-3.5 h-4 w-3/4 animate-pulse rounded-xs bg-slate-200 dark:bg-slate-700" />
          <div className="mt-2 space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded-xs bg-slate-200/60 dark:bg-slate-700/60" />
            <div className="h-3 w-4/5 animate-pulse rounded-xs bg-slate-200/60 dark:bg-slate-700/60" />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-2.5">
            <div className="h-3 w-20 animate-pulse rounded-xs bg-slate-200/50 dark:bg-slate-700/50" />
            <div className="h-3 w-12 animate-pulse rounded-xs bg-slate-200/50 dark:bg-slate-700/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading case details"
      className={clsx("space-y-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded-xs bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-72 animate-pulse rounded-xs bg-slate-200/70 dark:bg-slate-700/70" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 animate-pulse rounded-xs bg-slate-200 dark:bg-slate-700" />
          <div className="h-9 w-24 animate-pulse rounded-xs bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="h-72 w-full animate-pulse rounded-sm border border-[var(--line)] bg-slate-200/60 dark:bg-slate-800/60" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-sm border border-[var(--line)] bg-slate-200/40 dark:bg-slate-800/40"
              />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-44 w-full animate-pulse rounded-sm border border-[var(--line)] bg-slate-200/50 dark:bg-slate-800/50" />
          <div className="h-60 w-full animate-pulse rounded-sm border border-[var(--line)] bg-slate-200/50 dark:bg-slate-800/50" />
        </div>
      </div>
    </div>
  );
}
