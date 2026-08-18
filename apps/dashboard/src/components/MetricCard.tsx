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
    <div className={`fp-panel border-l-4 px-2.5 py-2.5 sm:px-3 sm:py-3 ${border}`}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 text-[10px] font-medium uppercase leading-snug tracking-wide text-slate-500 sm:text-[11px]">
          {label}
        </div>
        {badge ? (
          <span className="fp-badge-neutral hidden shrink-0 text-[10px] sm:inline-flex">{badge}</span>
        ) : null}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-slate-900 sm:mt-1.5 sm:text-xl">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
