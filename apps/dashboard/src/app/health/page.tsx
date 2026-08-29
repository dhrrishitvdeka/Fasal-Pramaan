"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Server,
  Database,
  Cpu,
  Sparkles,
  CloudSun,
  Radio,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Activity,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Clock,
  ArrowRight,
  Zap,
} from "lucide-react";
import clsx from "clsx";

type ServiceCheck = {
  id?: string;
  name: string;
  category?: string;
  status: "healthy" | "degraded" | "unreachable" | "unconfigured" | "misconfigured" | "cold_sleeping";
  ok: boolean;
  latencyMs?: number;
  runtime?: string;
  details?: string;
  error?: string;
  note?: string;
  modelId?: string;
  spaceId?: string;
  spaceUrl?: string;
  provider?: string;
};

type HealthResponse = {
  ok: boolean;
  status: "healthy" | "degraded" | "critical";
  timestamp: string;
  totalDurationMs: number;
  checks: Record<string, ServiceCheck>;
};

export default function HealthPage() {
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery<HealthResponse>({
    queryKey: ["system-health-telemetry"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`Health probe failed with HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 20000 : false,
  });

  const checks = data?.checks || {};
  const totalDuration = data?.totalDurationMs ?? 0;
  const overallStatus = data?.status || (isLoading ? "loading" : error ? "critical" : "healthy");

  const copyTelemetry = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getServiceIcon = (key: string) => {
    switch (key) {
      case "app_server":
        return Server;
      case "supabase":
        return Database;
      case "huggingface_space":
        return Cpu;
      case "gemini_ai":
        return Sparkles;
      case "weather_gateway":
        return CloudSun;
      case "satellite_engine":
        return Radio;
      default:
        return Activity;
    }
  };

  const renderStatusBadge = (status: string, ok: boolean) => {
    if (status === "healthy" || (ok && status !== "degraded")) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span>Operational</span>
        </span>
      );
    }
    if (status === "cold_sleeping") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
          <span>Waking Up (Cold)</span>
        </span>
      );
    }
    if (status === "degraded" || status === "unconfigured") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          <span>{status === "unconfigured" ? "Demo Standby" : "Degraded"}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">
        <XCircle className="h-3.5 w-3.5 text-red-600" />
        <span>Unreachable</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              System Health & Live Telemetry
            </h1>
            <span
              className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                overallStatus === "healthy"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : overallStatus === "degraded"
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-red-100 text-red-800 border border-red-300",
              )}
            >
              <span className={clsx("h-2 w-2 rounded-full", overallStatus === "healthy" ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
              {overallStatus === "healthy" ? "All Systems Operational" : overallStatus === "degraded" ? "Partial Degradation" : "Service Disruption"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Real-time multi-server latency probes and pipeline dependency monitoring for reviewers & operators.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={clsx(
              "fp-btn-secondary text-xs gap-1.5",
              autoRefresh ? "border-emerald-300 bg-emerald-50/60 text-emerald-800" : "text-slate-600",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>{autoRefresh ? "Live (20s)" : "Paused"}</span>
          </button>

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="fp-btn-primary gap-1.5 text-xs py-2 px-3"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", isFetching && "animate-spin")} />
            <span>{isFetching ? "Pinging Servers…" : "Ping All Services"}</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="fp-panel p-3.5 sm:p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Gateway Status</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900 sm:text-xl">
              {data?.ok ? "Healthy" : "Offline"}
            </span>
            <span className="text-xs text-slate-500 font-medium">live probe</span>
          </div>
        </div>

        <div className="fp-panel p-3.5 sm:p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Roundtrip Probe Latency</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900 sm:text-xl">
              {totalDuration} <span className="text-xs font-normal text-slate-500">ms</span>
            </span>
            <span className={clsx("text-xs font-medium", totalDuration < 200 ? "text-emerald-600" : "text-amber-600")}>
              {totalDuration < 200 ? "Fast" : "Normal"}
            </span>
          </div>
        </div>

        <div className="fp-panel p-3.5 sm:p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Database Layer</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900 sm:text-xl">
              {checks.supabase?.ok ? "Connected" : "Standby"}
            </span>
            <span className="text-xs text-slate-500">
              {checks.supabase?.latencyMs ? `${checks.supabase.latencyMs}ms` : "Mock"}
            </span>
          </div>
        </div>

        <div className="fp-panel p-3.5 sm:p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Subsystems</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900 sm:text-xl">
              {Object.values(checks).filter((c) => c.ok).length} / {Object.keys(checks).length || 6}
            </span>
            <span className="text-xs text-emerald-600 font-medium">Active</span>
          </div>
        </div>
      </div>

      {/* Interactive Service Health Cards */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Live Server & Microservice Telemetry
          </h2>
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-slate-400">
              Last probed: {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(checks).map(([key, service]) => {
            const Icon = getServiceIcon(key);
            return (
              <div
                key={key}
                className="fp-panel flex flex-col justify-between p-4 transition-all duration-150 hover:border-slate-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                        <Icon className="h-5 w-5 text-slate-800" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{service.name}</h3>
                        <p className="text-[11px] text-slate-500">{service.category || "Service"}</p>
                      </div>
                    </div>
                    {renderStatusBadge(service.status, service.ok)}
                  </div>

                  <div className="mt-4 space-y-2 text-xs">
                    {service.details && (
                      <p className="font-medium text-slate-700">{service.details}</p>
                    )}
                    {service.error && (
                      <p className="text-red-600 font-mono text-[11px] bg-red-50 p-1.5 rounded border border-red-100">
                        {service.error}
                      </p>
                    )}
                    {service.note && (
                      <p className="text-amber-700 bg-amber-50/80 p-1.5 rounded border border-amber-100">
                        {service.note}
                      </p>
                    )}
                    {service.modelId && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <span className="font-semibold text-slate-500">Model:</span>
                        <span className="font-mono text-[11px] truncate">{service.modelId}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <div className="flex items-center gap-1 text-slate-500">
                    <Zap className="h-3 w-3 text-amber-500" />
                    <span>Latency:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {service.latencyMs != null ? `${service.latencyMs} ms` : "—"}
                    </span>
                  </div>

                  {service.spaceUrl ? (
                    <a
                      href={service.spaceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
                    >
                      <span>Space View</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* End-to-End Architectural Pipeline Flow */}
      <div className="fp-panel p-4 sm:p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Verification Pipeline Architecture
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-center text-xs">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
            <div className="font-bold text-slate-900">1. Mobile Viewfinder</div>
            <p className="mt-1 text-[11px] text-slate-500">Realtime Open CV + GPS Geofence</p>
          </div>
          <div className="hidden sm:flex items-center justify-center text-slate-400">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
            <div className="font-bold text-slate-900">2. Gemini Gate & Audio</div>
            <p className="mt-1 text-[11px] text-slate-500">16kHz Live duplex + Vision Clarity</p>
          </div>
          <div className="hidden sm:flex items-center justify-center text-slate-400">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
            <div className="font-bold text-slate-900">3. Multi-Signal Engine</div>
            <p className="mt-1 text-[11px] text-slate-500">DINOv2 + Sentinel NDVI + Weather</p>
          </div>
        </div>
      </div>

      {/* Raw Telemetry Inspector */}
      <div className="fp-panel p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Raw JSON Diagnostics Log
            </h3>
          </div>
          <button
            type="button"
            onClick={copyTelemetry}
            className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? "Copied!" : "Copy JSON"}</span>
          </button>
        </div>
        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] font-mono text-emerald-400">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
