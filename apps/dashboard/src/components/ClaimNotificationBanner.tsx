"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import type { ClaimNotificationItem } from "@/lib/claim-notifications";
import clsx from "clsx";

interface ClaimNotificationBannerProps {
  notification: ClaimNotificationItem | null;
  onDismiss: () => void;
}

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    wrapperClass:
      "border-emerald-500/40 bg-emerald-950/95 text-emerald-100 shadow-lg shadow-emerald-950/50",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    iconClass: "text-emerald-400",
    actionHintClass: "text-emerald-200/90 bg-emerald-900/40 border-emerald-700/30",
    ariaLive: "polite" as const,
    role: "status",
  },
  warning: {
    icon: AlertTriangle,
    wrapperClass:
      "border-amber-500/50 bg-amber-950/95 text-amber-100 shadow-lg shadow-amber-950/50",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    iconClass: "text-amber-400",
    actionHintClass: "text-amber-200/90 bg-amber-900/40 border-amber-700/30",
    ariaLive: "polite" as const,
    role: "status",
  },
  error: {
    icon: AlertCircle,
    wrapperClass:
      "border-rose-500/50 bg-rose-950/95 text-rose-100 shadow-lg shadow-rose-950/50",
    badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    iconClass: "text-rose-400",
    actionHintClass: "text-rose-200/90 bg-rose-900/40 border-rose-700/30",
    ariaLive: "assertive" as const,
    role: "alert",
  },
  info: {
    icon: Info,
    wrapperClass:
      "border-sky-500/40 bg-sky-950/95 text-sky-100 shadow-lg shadow-sky-950/50",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    iconClass: "text-sky-400",
    actionHintClass: "text-sky-200/90 bg-sky-900/40 border-sky-700/30",
    ariaLive: "polite" as const,
    role: "status",
  },
};

export default function ClaimNotificationBanner({
  notification,
  onDismiss,
}: ClaimNotificationBannerProps) {
  useEffect(() => {
    if (!notification) return;

    // Longer timeout for errors & warnings so farmer has plenty of time to read guidance
    const duration =
      notification.type === "error" || notification.type === "warning" ? 6000 : 3800;

    const timer = window.setTimeout(() => {
      onDismiss();
    }, duration);

    return () => window.clearTimeout(timer);
  }, [notification, onDismiss]);

  if (!notification) return null;

  const cfg = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <aside
      role={cfg.role}
      aria-live={cfg.ariaLive}
      className={clsx(
        "fixed left-3 right-3 top-20 z-50 rounded-xl border p-3.5 backdrop-blur-md sm:left-auto sm:right-4 sm:max-w-md",
        "animate-in fade-in slide-in-from-top-4 duration-200 transition-all",
        cfg.wrapperClass,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <Icon className={clsx("h-5 w-5", cfg.iconClass)} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold tracking-wide">{notification.title}</h4>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs leading-relaxed opacity-95">{notification.message}</p>
          {notification.actionHint && (
            <div
              className={clsx(
                "mt-2 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                cfg.actionHintClass,
              )}
            >
              <span className="flex-shrink-0">👉</span>
              <span className="leading-snug">{notification.actionHint}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
