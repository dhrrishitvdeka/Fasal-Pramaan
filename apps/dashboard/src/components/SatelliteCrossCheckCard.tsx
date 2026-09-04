"use client";

import { useEffect, useState } from "react";

interface SatelliteCrossCheckCardProps {
  wideFieldImageUrl?: string | null;
  bhuvanTileUrl?: string | null;
  bhuvanFallbackUrl?: string | null;
  burnMapUrl?: string | null;
}

export function SatelliteCrossCheckCard({
  wideFieldImageUrl,
  bhuvanTileUrl,
  bhuvanFallbackUrl,
  burnMapUrl,
}: SatelliteCrossCheckCardProps) {
  const [bhuvanFailed, setBhuvanFailed] = useState(false);

  useEffect(() => {
    setBhuvanFailed(false);
  }, [bhuvanTileUrl]);

  if (!wideFieldImageUrl && !bhuvanTileUrl && !burnMapUrl) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Field Overview (photo_1 / wide_field)
          </p>
          {wideFieldImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wideFieldImageUrl}
              alt="Field overview crop capture"
              className="h-[256px] w-full rounded border border-slate-200 bg-white object-cover"
            />
          ) : (
            <div className="flex h-[256px] items-center justify-center rounded border border-slate-200 bg-slate-100 text-xs text-slate-400">
              No overview photo uploaded
            </div>
          )}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Field vs Land-use overlay (Bhuvan)
          </p>
          {bhuvanTileUrl && !bhuvanFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bhuvanTileUrl}
              alt="Bhuvan land-use overlay"
              width={256}
              height={256}
              referrerPolicy="no-referrer"
              onError={() => setBhuvanFailed(true)}
              className="h-[256px] w-full rounded border border-slate-200 bg-white object-cover"
            />
          ) : (
            <div className="flex h-[256px] flex-col items-center justify-center gap-2 rounded border border-slate-200 bg-slate-100 px-4 text-center text-xs text-slate-400">
              <span>Bhuvan land-use tile unavailable</span>
              {bhuvanFallbackUrl && (
                <a
                  href={bhuvanFallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900"
                >
                  Open plot in Bhuvan 2D ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {burnMapUrl && (
        <a
          href={burnMapUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900"
        >
          Open Sentinel-2 in Copernicus Browser ↗
        </a>
      )}
    </div>
  );
}
