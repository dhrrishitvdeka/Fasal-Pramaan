import Link from "next/link";

type EmptyStateProps = {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  title: string;
  body?: string;
  action?: { href: string; label: string };
};

export default function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="fp-panel flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {Icon ? (
        <Icon className="h-8 w-8 opacity-50" strokeWidth={1.5} aria-hidden />
      ) : null}
      <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
      {body ? <p className="max-w-sm text-xs text-[var(--ink-muted)]">{body}</p> : null}
      {action ? (
        <Link href={action.href} className="fp-btn-secondary mt-2 min-h-11 px-4 text-xs">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
