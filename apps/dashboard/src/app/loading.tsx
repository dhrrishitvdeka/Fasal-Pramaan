export default function DashboardLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-64 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <section aria-hidden="true">
        <div className="mb-2 h-3 w-40 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="fp-panel animate-pulse p-4">
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="mt-3 h-6 w-14 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
      <section aria-hidden="true">
        <div className="mb-2 h-3 w-28 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="fp-panel animate-pulse p-4">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="mt-3 h-6 w-12 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
      <section aria-hidden="true">
        <div className="mb-2 h-3 w-32 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="fp-panel animate-pulse p-4">
              <div className="h-3 w-16 rounded bg-slate-100" />
              <div className="mt-3 h-6 w-16 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
