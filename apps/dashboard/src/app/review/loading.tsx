export default function ReviewLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading review queue">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-72 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <div className="fp-chip-row gap-1.5 border-b border-slate-200 pb-2 text-xs">
        {["w-16", "w-24", "w-28", "w-32", "w-20", "w-24"].map((w, i) => (
          <div key={i} className={`h-7 ${w} animate-pulse rounded-md bg-slate-100`} />
        ))}
      </div>
      <div className="fp-panel hidden overflow-x-auto shadow-sm md:block">
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
      <div className="space-y-2 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="fp-panel h-20 animate-pulse p-3" />
        ))}
      </div>
    </div>
  );
}
