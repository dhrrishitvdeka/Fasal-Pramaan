import { NextResponse } from "next/server";
import { CANONICAL_GITHUB_REPO, resolveGithubRepo } from "@/lib/github-repo";

export const dynamic = "force-dynamic";
export const revalidate = 300; // 5 minutes cache

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repo = resolveGithubRepo(
    searchParams.get("repo") || process.env.NEXT_PUBLIC_GITHUB_REPO || CANONICAL_GITHUB_REPO
  );

  // Validate repo format: owner/name
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return NextResponse.json({ error: "Invalid repository format" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "FasalPramaan-App/2.6.1",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers,
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const data = (await res.json()) as { stargazers_count?: number; html_url?: string };
      if (typeof data.stargazers_count === "number") {
        return NextResponse.json(
          {
            stars: data.stargazers_count,
            repo,
            url: data.html_url || `https://github.com/${repo}`,
            updatedAt: new Date().toISOString(),
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            },
          }
        );
      }
    }

    // Fallback: fetch from shields.io JSON API if GitHub direct API is rate-limited
    const shieldRes = await fetch(`https://img.shields.io/github/stars/${repo}.json`, {
      next: { revalidate: 300 },
    }).catch(() => null);

    if (shieldRes && shieldRes.ok) {
      const shieldData = (await shieldRes.json()) as { value?: string };
      const parsed = parseInt(String(shieldData.value || "").replace(/[^\d]/g, ""), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return NextResponse.json({
          stars: parsed,
          repo,
          url: `https://github.com/${repo}`,
          source: "shield",
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      stars: 7,
      repo,
      url: `https://github.com/${repo}`,
      source: "fallback",
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      stars: 7,
      repo,
      url: `https://github.com/${repo}`,
      error: err instanceof Error ? err.message : "Fetch error",
    });
  }
}
