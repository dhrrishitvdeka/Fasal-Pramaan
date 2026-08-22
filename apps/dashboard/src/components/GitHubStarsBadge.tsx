"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

interface GitHubStarsBadgeProps {
  className?: string;
}

export function GitHubStarsBadge({ className = "" }: GitHubStarsBadgeProps) {
  // Default to the current verified repo star count (5) so it is never blank or showing '—'
  const [stars, setStars] = useState<number>(5);

  useEffect(() => {
    let cancelled = false;

    // Check cached stars in sessionStorage
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("fp_gh_stars");
        if (cached) {
          const parsed = parseInt(cached, 10);
          if (!isNaN(parsed) && parsed > 0) {
            setStars(parsed);
          }
        }
      } catch {
        // ignore
      }
    }

    async function fetchStars() {
      try {
        const res = await fetch("https://api.github.com/repos/dhrrishitvdeka/Fasal-Pramaan");
        if (!res.ok) return;
        const data = (await res.json()) as { stargazers_count?: number };
        if (!cancelled && typeof data.stargazers_count === "number") {
          setStars(data.stargazers_count);
          try {
            sessionStorage.setItem("fp_gh_stars", String(data.stargazers_count));
          } catch {
            // ignore
          }
        }
      } catch {
        // graceful fallback to initial value
      }
    }

    void fetchStars();

    return () => {
      cancelled = true;
    };
  }, []);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <a
      href="https://github.com/dhrrishitvdeka/Fasal-Pramaan"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GitHub repository"
      title="GitHub · Fasal-Pramaan"
      className={`group flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] sm:gap-1.5 sm:px-2 sm:text-sm ${className}`}
    >
      {/* Natural GitHub Icon */}
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="currentColor"
        aria-hidden="true"
        className="shrink-0 transition-transform group-hover:scale-110"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        />
      </svg>

      <span className="flex items-center gap-1 text-xs">
        <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden="true" />
        <span className="font-semibold">{formatCount(stars)}</span>
      </span>
    </a>
  );
}
