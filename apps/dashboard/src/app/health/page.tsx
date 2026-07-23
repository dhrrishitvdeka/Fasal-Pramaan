"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function HealthPage() {
  const apiHealth = useQuery({
    queryKey: ["api-health"],
    queryFn: async () => (await axios.get(`${API_BASE}/health`)).data,
  });

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">System health</h2>
        <p className="fp-page-sub">Service status for operations staff</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { title: "API", data: apiHealth.data || apiHealth.error },
          { title: "Dependency checks", data: apiHealth.data?.checks || {} },
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
