"use client";

import { useQuery } from "@tanstack/react-query";
import { getHfModelId, getHfSpaceId } from "@/lib/hf-model";

type HealthPayload = {
  ok?: boolean;
  status?: string;
  mode?: string;
  checks?: Record<string, unknown>;
};

export default function HealthPage() {
  const hosted = useQuery({
    queryKey: ["hosted-health"],
    queryFn: async (): Promise<HealthPayload> => {
      const response = await fetch("/api/health");
      const body = (await response.json().catch(() => null)) as HealthPayload | null;
      if (!response.ok || !body) {
        throw new Error(`Hosted health failed (${response.status})`);
      }
      return body;
    },
  });

  const apiBlock = hosted.isLoading
    ? { status: "loading" }
    : hosted.error
      ? { status: "error", error: hosted.error instanceof Error ? hosted.error.message : "probe failed" }
      : hosted.data || { status: "empty" };

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">System health</h2>
        <p className="fp-page-sub">Service status for operations staff</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { title: "API", data: apiBlock },
          { title: "Dependency checks", data: hosted.data?.checks || { status: hosted.status } },
          {
            title: "Hugging Face Space",
            data: {
              model_id: getHfModelId(),
              space_id: getHfSpaceId(),
              path: "farmer upload → /api/claims → Fasal-Pramaan Space → reviewer queue",
              probe: hosted.data?.checks?.huggingface_space || null,
            },
          },
        ].map((block) => (
          <div key={block.title} className="fp-panel">
            <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {block.title}
            </div>
            <pre className="overflow-auto p-3 text-xs text-slate-700">
              {JSON.stringify(block.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
