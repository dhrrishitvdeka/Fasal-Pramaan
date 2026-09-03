"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLoading from "@/app/loading";

export default function AnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/overview#analytics");
  }, [router]);

  return <DashboardLoading />;
}

