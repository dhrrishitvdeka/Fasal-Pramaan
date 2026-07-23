/**
 * Compact KPI tile for government dashboards.
 * Status is communicated by left border weight + text, not loud colour fills.
 */
export default function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "ok";
}) {
  const border = {
    default: "border-l-slate-300",
    warn: "border-l-slate-600",
    danger: "border-l-slate-900",
    ok: "border-l-slate-500",
  }[tone];

  const badge =
    tone === "warn"
      ? "Attention"
      : tone === "danger"
        ? "Priority"
        : tone === "ok"
          ? "Complete"
          : null;

  return (
    <div className={`border border-slate-200 border-l-4 bg-white px-3 py-3 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </div>
        {badge ? (
          <span className="fp-badge-neutral shrink-0 text-[10px]">{badge}</span>
        ) : null}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
