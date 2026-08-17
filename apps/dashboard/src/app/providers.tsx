"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { LanguageProvider } from "@/lib/LanguageContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <LanguageProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </LanguageProvider>
  );
}
