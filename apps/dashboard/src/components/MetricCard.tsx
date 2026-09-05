import Link from "next/link";

/**
 * Compact KPI tile for government dashboards.
 * Clean neutral card — no side accent strip; status via small neutral badge only.
 */
export default function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "ok";
  href?: string;
}) {

  const badge =
    tone === "warn"
      ? "Attention"
      : tone === "danger"
        ? "Priority"
        : tone === "ok"
          ? "Complete"
          : null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 text-[10px] font-medium leading-snug text-slate-500 sm:text-[11px]">
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
    </>
  );

  const className = `fp-panel px-2.5 py-2.5 sm:px-3 sm:py-3`;
  if (href) {
    return (
      <Link href={href} className={`${className} block hover:bg-[var(--accent-soft)]`}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
